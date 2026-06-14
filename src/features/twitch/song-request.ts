/**
 * Twitch song-request pipeline: turning a chat command / permit / channel-point
 * redemption into a queued song. Split out of twitch.js. This module owns the
 * request-related local settings (max duration, duplicate check) and the permit
 * bookkeeping; it does not touch the Twitch connection state.
 */

import { getTauriInvoke } from '../../core/tauri';
import { queueItems, registerRequester, cacheTrackInfo } from '../queue/index';
import { addToHistory } from '../history/request-history';
import { isUrl, isSpotifyInput, extractSpotifyTrackId } from './parse';
import { isBlocked } from '../history/blocklist';
import { getTwitchMessages } from './messages';

// Request-related local settings (stored in localStorage).
let localSettings = {
  maxDuration: 0,
  duplicateCheck: true,
};

let lastProcessedRequest: string | null = null;
let listenersSetup = false;
const pendingPermits = new Map<string, { timestamp: number; userId: string }>();

/** Load request settings from localStorage and reflect them in the UI. */
export function loadLocalSettings(): void {
  try {
    const stored = localStorage.getItem('twitch-local-settings');
    if (stored) {
      localSettings = { ...localSettings, ...JSON.parse(stored) };
    }

    const maxDurationInput = document.getElementById('twitch-max-duration') as HTMLInputElement | null;
    const duplicateCheckInput = document.getElementById('twitch-duplicate-check') as HTMLInputElement | null;

    if (maxDurationInput) maxDurationInput.value = String(localSettings.maxDuration);
    if (duplicateCheckInput) duplicateCheckInput.checked = localSettings.duplicateCheck;
  } catch (e) {
    console.error('[Twitch] Load local settings error:', e);
  }
}

function saveLocalSettings(): void {
  try {
    localStorage.setItem('twitch-local-settings', JSON.stringify(localSettings));
  } catch (e) {
    console.error('[Twitch] Save local settings error:', e);
  }
}

/** Wire the request-settings inputs (max duration, duplicate check). */
export function setupRequestSettingsListeners(): void {
  document.getElementById('twitch-max-duration')?.addEventListener('change', (e) => {
    localSettings.maxDuration = parseInt((e.target as HTMLInputElement).value) || 0;
    saveLocalSettings();
  });

  document.getElementById('twitch-duplicate-check')?.addEventListener('change', (e) => {
    localSettings.duplicateCheck = (e.target as HTMLInputElement).checked;
    saveLocalSettings();
  });
}

/**
 * Whether song requests are enabled (the master toggle in Twitch settings).
 */
function songRequestsEnabled(): boolean {
  return localStorage.getItem('song-requests-enabled') !== 'false';
}

/**
 * Setup EventSub event listeners (only once!) that route chat commands, permit
 * follow-ups and channel-point redemptions into the request pipeline.
 */
export function setupSongRequestListeners(): void {
  if (listenersSetup) return;
  if (!window.__TAURI__?.event) return;

  listenersSetup = true;
  console.log('[Twitch] song-request listeners registered');

  // Handle !sr command (with or without link)
  window.__TAURI__.event.listen('twitch-chat-command', async (event: any) => {
    const { userId, userName, spotifyInput, source } = event.payload;

    // Check if user just typed !sr without a link (wants to post a link)
    if (!spotifyInput || spotifyInput.trim() === '') {
      // User wants to post a link - send permit first
      await handlePermitRequest(userId, userName);
    } else {
      // User already provided input - process it
      await handleSongRequest(userId, userName, spotifyInput, source);
    }
  });

  // Handle follow-up messages from permitted users
  window.__TAURI__.event.listen('twitch-chat-message', async (event: any) => {
    const { userId, userName, message } = event.payload;

    // Check if this user has a pending permit
    const permit = pendingPermits.get(userName.toLowerCase());
    if (permit) {
      // Check if permit is still valid (60 seconds)
      if (Date.now() - permit.timestamp < 60000) {
        // Check if message contains a link
        if (isUrl(message)) {
          pendingPermits.delete(userName.toLowerCase());
          await handleSongRequest(userId, userName, message, 'chat');
        }
      } else {
        // Permit expired
        pendingPermits.delete(userName.toLowerCase());
      }
    }
  });

  window.__TAURI__.event.listen('twitch-redemption', async (event: any) => {
    const { id, user_id, user_name, user_input, reward_id } = event.payload;
    // Real redemptions carry an id + reward_id we can use to refund (CANCEL) or
    // fulfill the channel-point cost. Test redemptions have neither → no refund.
    const redemption = (id && reward_id) ? { redemptionId: id, rewardId: reward_id } : null;
    await handleSongRequest(user_id, user_name, user_input, 'points', redemption);
  });
}

/**
 * Handle permit request - user typed !sr without a link
 * Bot sends /permit to allow links temporarily
 */
async function handlePermitRequest(userId: string, userName: string): Promise<void> {
  if (!songRequestsEnabled()) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  const twitchMessages = getTwitchMessages();
  try {
    // Check cooldown first
    const onCooldown = await invoke('check_request_cooldown', { userId });
    if (onCooldown) {
      const cooldownSeconds = parseInt((document.getElementById('twitch-cooldown') as HTMLInputElement | null)?.value || '30');
      const msg = twitchMessages.cooldown
        .replace('{user}', userName)
        .replace('{seconds}', cooldownSeconds.toString());
      await invoke('twitch_send_chat', { message: msg });
      return;
    }

    // Send permit command (requires bot to be moderator)
    // This allows the user to post ONE link in the next 60 seconds
    try {
      await invoke('twitch_send_chat', { message: `/permit ${userName}` });
    } catch (e) {
      // Permit failed - bot is probably not a moderator
      console.warn('[Twitch] Permit failed (bot not mod?):', e);
    }

    // Store pending permit
    pendingPermits.set(userName.toLowerCase(), {
      timestamp: Date.now(),
      userId: userId,
    });

    // Tell user they can now post their link
    const msg = `@${userName} Du hast jetzt 60 Sekunden um deinen Song-Link zu posten!`;
    await invoke('twitch_send_chat', { message: msg });

    console.log(`[Twitch] Permit granted to ${userName}`);
  } catch (e) {
    console.error('[Twitch] Permit error:', e);
  }
}

/**
 * Handle song request from chat or channel points.
 * Supports Spotify, plus YouTube/Apple Music/SoundCloud/etc. via the resolver.
 */
async function handleSongRequest(userId: string, userName: string, input: string, source: string, redemption: any = null): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  const twitchMessages = getTwitchMessages();

  // Channel-point refund/fulfill helpers. Only act on real point redemptions.
  const refundPoints = async () => {
    if (source !== 'points' || !redemption) return;
    try {
      await invoke('twitch_update_redemption', {
        rewardId: redemption.rewardId,
        redemptionId: redemption.redemptionId,
        fulfill: false, // CANCELED -> points are refunded to the viewer
      });
    } catch (e) {
      console.warn('[Twitch] Channel-point refund failed:', e);
    }
  };
  const fulfillPoints = async () => {
    if (source !== 'points' || !redemption) return;
    try {
      await invoke('twitch_update_redemption', {
        rewardId: redemption.rewardId,
        redemptionId: redemption.redemptionId,
        fulfill: true,
      });
    } catch (e) {
      console.warn('[Twitch] Channel-point fulfill failed:', e);
    }
  };

  // Master toggle off => channel points are not active, refund the cost.
  if (!songRequestsEnabled()) {
    await refundPoints();
    return;
  }

  // Deduplicate
  const requestKey = `${userId}_${input}_${Math.floor(Date.now() / 2000)}`;
  if (lastProcessedRequest === requestKey) return;
  lastProcessedRequest = requestKey;

  const trimmedInput = input.trim();

  try {
    // Check cooldown
    const cooldownSeconds = parseInt((document.getElementById('twitch-cooldown') as HTMLInputElement | null)?.value || '30');
    const onCooldown = await invoke('check_request_cooldown', { userId });
    if (onCooldown) {
      const msg = twitchMessages.cooldown
        .replace('{user}', userName)
        .replace('{seconds}', cooldownSeconds.toString());
      await invoke('twitch_send_chat', { message: msg });
      await refundPoints();
      return;
    }

    let spotifyUri: string | null = null;
    let trackId: string | null = null;
    let isYouTube = false;
    let ytMeta: any = null; // { track, artist, albumCover } for YouTube-only requests

    // STEP 1: Try to extract/convert to Spotify
    if (isSpotifyInput(trimmedInput)) {
      trackId = extractSpotifyTrackId(trimmedInput);
      if (trackId) {
        spotifyUri = `spotify:track:${trackId}`;
        console.log('[Twitch] Direct Spotify link:', spotifyUri);
      }
    } else if (trimmedInput.length === 22 && /^[a-zA-Z0-9]+$/.test(trimmedInput)) {
      trackId = trimmedInput;
      spotifyUri = `spotify:track:${trackId}`;
      console.log('[Twitch] Raw Spotify ID:', spotifyUri);
    } else if (isUrl(trimmedInput)) {
      console.log('[Twitch] Resolving external link:', trimmedInput);

      try {
        // One Odesli lookup gives us both the Spotify and the YouTube version.
        const res: any = await invoke('resolve_song_request', { input: trimmedInput });

        if (res && res.spotify_uri && res.track_id) {
          spotifyUri = res.spotify_uri;
          trackId = res.track_id;
          console.log('[Twitch] Resolved to Spotify:', spotifyUri);
        } else if (res && res.youtube_video_id) {
          isYouTube = true;
          spotifyUri = `youtube:${res.youtube_video_id}`;
          ytMeta = {
            track: res.title || 'YouTube',
            artist: res.artist || '',
            albumCover: res.thumbnail || `https://i.ytimg.com/vi/${res.youtube_video_id}/hqdefault.jpg`,
          };
          console.log('[Twitch] Accepted YouTube-only request:', spotifyUri);
        } else {
          const msg = twitchMessages.notOnSpotify.replace('{user}', userName);
          await invoke('twitch_send_chat', { message: msg });
          await refundPoints();
          return;
        }
      } catch (e) {
        console.error('[Twitch] Link resolution error:', e);
        const msg = twitchMessages.songNotFound
          .replace('{user}', userName)
          .replace('{query}', trimmedInput);
        await invoke('twitch_send_chat', { message: msg });
        await refundPoints();
        return;
      }
    }

    // No valid input found (Spotify needs a track id; YouTube needs the pseudo-uri)
    if (!spotifyUri || (!isYouTube && !trackId)) {
      const msg = twitchMessages.songNotFound
        .replace('{user}', userName)
        .replace('{query}', trimmedInput);
      await invoke('twitch_send_chat', { message: msg });
      await refundPoints();
      return;
    }

    // STEP 2: Check for duplicates
    if (localSettings.duplicateCheck) {
      const isDuplicate = queueItems.some((item: any) => item.spotify_uri === spotifyUri);
      if (isDuplicate) {
        const msg = twitchMessages.duplicate.replace('{user}', userName);
        await invoke('twitch_send_chat', { message: msg });
        await refundPoints();
        return;
      }
    }

    // STEP 3: Get track info from Spotify
    let trackName = 'Unbekannt';
    let artistName = 'Unbekannt';
    let durationMs = 0;

    if (isYouTube) {
      trackName = ytMeta.track || 'YouTube';
      artistName = ytMeta.artist || '';
    } else {
      try {
        const trackInfo: any = await invoke('get_track_info', { trackId });
        if (trackInfo) {
          trackName = trackInfo.track || 'Unbekannt';
          artistName = trackInfo.artist || 'Unbekannt';
          durationMs = trackInfo.durationMs || 0;
        }
      } catch (e) {
        console.error('[Twitch] Track info error:', e);
      }
    }

    // STEP 3.5: Reject blocked songs (by exact id or by artist+title)
    const blockId = isYouTube ? spotifyUri.slice('youtube:'.length) : trackId;
    if (isBlocked({ id: blockId, artist: artistName, title: trackName })) {
      await invoke('twitch_send_chat', {
        message: `@${userName} Dieser Song ist blockiert und kann nicht angefragt werden.`,
      });
      await refundPoints();
      return;
    }

    // STEP 4: Check max duration
    if (localSettings.maxDuration > 0 && durationMs > 0) {
      const maxMs = localSettings.maxDuration * 60 * 1000;
      if (durationMs > maxMs) {
        const msg = twitchMessages.tooLong
          .replace('{user}', userName)
          .replace('{max}', localSettings.maxDuration.toString());
        await invoke('twitch_send_chat', { message: msg });
        await refundPoints();
        return;
      }
    }

    // STEP 5: Add to internal display queue
    await invoke('add_song_request', {
      userId,
      userName,
      spotifyUri,
      source,
    });

    // For YouTube-only items there is no Spotify lookup, so prime the cache.
    if (isYouTube) {
      cacheTrackInfo(spotifyUri, {
        track: trackName,
        artist: artistName,
        albumCover: ytMeta.albumCover,
        durationMs: 0,
        source: 'youtube',
      });
    }

    // Remember who requested this track.
    registerRequester({ trackId, track: trackName, artist: artistName, user: userName, source });

    // Update cooldown
    await invoke('update_request_cooldown', { userId });

    // STEP 7: Add to history (Spotify Playlist if configured)
    try {
      await addToHistory(spotifyUri, { track: trackName, artist: artistName });
    } catch (e) {
      console.error('[Twitch] Add to history error:', e);
    }

    // STEP 8: Send confirmation
    const msg = twitchMessages.songAdded
      .replace('{user}', userName)
      .replace('{artist}', artistName)
      .replace('{title}', trackName);

    await invoke('twitch_send_chat', { message: msg });

    // Request accepted -> mark the redemption fulfilled.
    await fulfillPoints();
  } catch (e) {
    console.error('[Twitch] Song request error:', e);
    // Unexpected failure after the points were spent -> refund.
    await refundPoints();
  }
}

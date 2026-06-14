/**
 * Queue Feature - Song Request Queue with Track Info
 */

import { getTauriInvoke } from '../../core/tauri.js';
import { state } from '../../core/state.js';
import { escapeAttr } from '../../utils/format.js';
import { prefetchYouTube } from './youtube-player.js';
import {
  initYouTube,
  isYouTubePlaying,
  isYouTubeUri,
  youTubeVideoId,
  startYouTubeTakeover,
  setupYouTubeControls,
  stopYouTubePlayback,
} from './youtube.js';

// Re-export so existing importers (app.js) keep working.
export { isYouTubePlaying } from './youtube.js';

// State
let queueItems = [];
let trackInfoCache = new Map();
let queueEventListenerSetup = false;
let containerListenersSetup = new Set();

// Auto-advance: play queued requests one after another (track-changed driven).
let autoPlayQueue = false;
let lastAutoPlayAt = 0;

// Grace delay before a YouTube takeover, so the current Spotify song finishes
// (the YouTube stream is prefetched, so this adds no real gap).
const YT_TAKEOVER_DELAY_MS = 1000;

/** Prime the track-info cache (used by the request flow for YouTube items). */
export function cacheTrackInfo(uri, info) { trackInfoCache.set(uri, info); }

// Requester memory: who requested a track. Survives the song's removal from the
// queue, so "requested by X" can still be shown while it plays. Keyed by Spotify
// track id AND by normalized "artist|title" (the Windows-media source has no
// track id). Capped so it can't grow unbounded.
const requesterMemory = new Map();

function reqNormKey(artist, title) {
  return 'k:' + String(artist || '').toLowerCase().trim() + '|' + String(title || '').toLowerCase().trim();
}

/** Remember who requested a track (called when a request is added / loaded). */
export function registerRequester({ trackId, track, artist, user, source }) {
  if (!user) return;
  const entry = { user, source: source || 'chat' };
  if (trackId) requesterMemory.set('id:' + trackId, entry);
  if (track) requesterMemory.set(reqNormKey(artist, track), entry);
  while (requesterMemory.size > 300) {
    requesterMemory.delete(requesterMemory.keys().next().value);
  }
}

/** Look up the requester for the currently playing track (by id, then title). */
export function getRequesterForTrack(track) {
  if (!track) return null;
  if (track.trackId && requesterMemory.has('id:' + track.trackId)) {
    return requesterMemory.get('id:' + track.trackId);
  }
  const k = reqNormKey(track.artist, track.track);
  return requesterMemory.has(k) ? requesterMemory.get(k) : null;
}

// SVG Icons
const ICONS = {
  music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  chat: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  inbox: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
};

/**
 * Initialize Queue
 */
export async function initQueue() {
  // Give the YouTube module the queue accessors it needs (no circular import).
  initYouTube({
    getQueueItems: () => queueItems,
    removeQueueItem: (id) => { queueItems = queueItems.filter((q) => q.id !== id); },
    isAutoPlay: () => autoPlayQueue,
    setLastAutoPlayAt: (v) => { lastAutoPlayAt = v; },
    renderQueue,
    updateQueueVisibility,
    getCachedTrackInfo: (uri) => trackInfoCache.get(uri),
  });

  setupQueueEventListener();
  setupClearButtons();
  setupQueueDelegation();
  setupAutoPlay();
  setupYouTubeControls();
  await loadQueue();
  renderQueue();
  updateQueueVisibility();
}

/**
 * Auto-advance setup: load the persisted toggle, wire the checkbox and start
 * the monitor. When enabled, the next queued request is played automatically
 * once nothing is playing â€” so the request queue is what gets played, not the
 * next song from the streamer's own playlist.
 */
function setupAutoPlay() {
  autoPlayQueue = localStorage.getItem('queue-autoplay') === 'true';
  // The toggle lives in the queue header (player view + standalone queue view),
  // so there can be two checkboxes â€” keep them in sync.
  const toggles = document.querySelectorAll('.js-queue-autoplay');
  toggles.forEach((cb) => {
    cb.checked = autoPlayQueue;
    cb.addEventListener('change', (e) => {
      autoPlayQueue = e.target.checked;
      localStorage.setItem('queue-autoplay', String(autoPlayQueue));
      toggles.forEach((other) => { if (other !== e.target) other.checked = autoPlayQueue; });
      // If turned on while truly nothing is playing, start the queue right away.
      if (autoPlayQueue && !state.currentTrack) maybeAutoAdvance();
    });
  });
}

/**
 * Hand the next queued request over to Spotify's native queue shortly before the
 * current song ends (triggered from the player's progress loop and as a fallback
 * on track-changed). Using add_to_queue (instead of play_track) is important:
 * it plays the request right after the current song AND keeps the streamer's
 * playlist context, so music keeps going once the request queue is empty â€”
 * play_track would replace the context with a single track and leave silence.
 * A cooldown prevents queueing the same item repeatedly.
 */
export async function maybeAutoAdvance(remainingMs = 0) {
  if (!autoPlayQueue || queueItems.length === 0) return;
  if (isYouTubePlaying()) return; // the YouTube player drives its own advance
  if (Date.now() - lastAutoPlayAt < 6000) return; // one hand-over per song
  const next = queueItems[0];
  if (!next) return;

  // Timing of the hand-over depends on the next item:
  // - Spotify: queue it ~10s before the end, BEFORE Spotify's crossfade window
  //   (up to 12s) kicks in. If we queue too late, Spotify has already started
  //   crossfading into the next playlist track and the request is skipped/late.
  // - YouTube: only once the current song is basically over (the stream is
  //   prefetched, so it starts instantly) â€” this avoids cutting the last second
  //   of the Spotify song before pausing it for YouTube.
  const isYt = isYouTubeUri(next.spotify_uri);
  const threshold = isYt ? 0 : 10000;
  if (remainingMs > threshold) return;
  lastAutoPlayAt = Date.now();

  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    if (isYt) {
      // Let the current Spotify song finish first (grace delay), then take over.
      setTimeout(() => { startYouTubeTakeover(next); }, YT_TAKEOVER_DELAY_MS);
    } else {
      await invoke('add_to_queue', { uri: next.spotify_uri });
      await invoke('remove_song_request', { requestId: next.id });
    }
  } catch (e) {
    console.error('[Queue] Auto-play queue error:', e);
    lastAutoPlayAt = 0; // allow a retry on the next trigger
  }
}

/**
 * Attach delegated click handlers to the queue containers.
 *
 * The list HTML is re-rendered on every update, so we listen on the (stable)
 * container instead of the buttons. This replaces the old inline `onclick`
 * handlers, which were brittle (broke on quotes in URIs and depended on
 * globals) and are the reason the queue buttons did nothing when clicked.
 */
function setupQueueDelegation() {
  ['queue-list', 'queue-list-standalone'].forEach((id) => {
    const container = document.getElementById(id);
    if (!container || containerListenersSetup.has(id)) return;
    containerListenersSetup.add(id);

    container.addEventListener('click', (e) => {
      const item = e.target.closest('.queue-item');
      if (!item) return;
      const { id: requestId, uri } = item.dataset;

      if (e.target.closest('.queue-btn-play')) {
        playSong(requestId, uri);
      } else if (e.target.closest('.queue-btn-remove')) {
        removeSong(requestId);
      }
    });
  });
}

/**
 * Setup Tauri event listener for queue updates (only once)
 */
function setupQueueEventListener() {
  if (queueEventListenerSetup) return;
  if (!window.__TAURI__?.event) return;
  
  queueEventListenerSetup = true;
  
  window.__TAURI__.event.listen('queue-updated', async () => {
    await loadQueue();
    renderQueue();
    updateQueueVisibility();
  });
  
  // Listen for track changes: auto-remove the matching queue item, and (when
  // Auto-Play is on) advance the queue once the current song ends.
  window.__TAURI__.event.listen('track-changed', (event) => {
    const track = event.payload;
    if (track?.trackId) {
      checkAndRemovePlayingTrack(track.trackId);
    }
    maybeAutoAdvance();
  });
}

/**
 * Setup clear buttons (once)
 */
function setupClearButtons() {
  document.getElementById('btn-clear-queue')?.addEventListener('click', clearQueue);
  document.getElementById('btn-clear-queue-standalone')?.addEventListener('click', clearQueue);
}

/**
 * Check if currently playing track is in queue and remove it
 */
async function checkAndRemovePlayingTrack(trackId) {
  const uri = `spotify:track:${trackId}`;
  const item = queueItems.find(q => q.spotify_uri === uri);
  
  if (item) {
    console.log('[Queue] Auto-removing playing track:', trackId);
    await removeSong(item.id);
  }
}

/**
 * Load queue from backend
 */
async function loadQueue() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    queueItems = await invoke('get_song_request_queue') || [];
    
    // Fetch track info for items without cached info
    for (const item of queueItems) {
      if (!trackInfoCache.has(item.spotify_uri)) {
        fetchTrackInfo(item.spotify_uri);
      }
    }
  } catch (e) {
    console.error('[Queue] Load error:', e);
    queueItems = [];
  }
}

/**
 * Fetch track info from Spotify API
 */
async function fetchTrackInfo(spotifyUri) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;

  // YouTube-only items: metadata is primed when the request is added. If it's
  // missing (e.g. queue restored from DB after a restart), re-resolve it from
  // the video id instead of asking Spotify.
  if (isYouTubeUri(spotifyUri)) {
    if (!trackInfoCache.has(spotifyUri)) {
      const videoId = youTubeVideoId(spotifyUri);
      try {
        const res = await invoke('resolve_song_request', { input: `https://www.youtube.com/watch?v=${videoId}` });
        trackInfoCache.set(spotifyUri, {
          track: res?.title || 'YouTube',
          artist: res?.artist || '',
          albumCover: res?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs: 0,
          source: 'youtube',
        });
        renderQueue();
      } catch (e) { /* keep showing the raw item */ }
    }
    return trackInfoCache.get(spotifyUri) || null;
  }

  const trackId = spotifyUri.replace('spotify:track:', '');

  try {
    const info = await invoke('get_track_info', { trackId });
    if (info) {
      trackInfoCache.set(spotifyUri, info);
      // Remember the requester for this track now that we know its title/artist,
      // so "requested by X" works even after it leaves the queue.
      const item = queueItems.find((q) => q.spotify_uri === spotifyUri);
      if (item) {
        registerRequester({ trackId, track: info.track, artist: info.artist, user: item.user_name, source: item.source });
      }
      renderQueue();
    }
    return info;
  } catch (e) {
    return null;
  }
}

/**
 * Get track info (for external use)
 */
export async function getTrackInfo(spotifyUri) {
  if (trackInfoCache.has(spotifyUri)) {
    return trackInfoCache.get(spotifyUri);
  }
  return await fetchTrackInfo(spotifyUri);
}

/**
 * Clear entire queue
 */
async function clearQueue() {
  if (!confirm('Queue wirklich leeren?')) return;
  
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('clear_song_request_queue');
    queueItems = [];
    // Stop a running YouTube request and hand playback back to Spotify.
    await stopYouTubePlayback({ resume: true });
    renderQueue();
    updateQueueVisibility();
  } catch (e) {
    console.error('[Queue] Clear error:', e);
  }
}

/**
 * Play a song from queue (skip to it)
 */
async function playSong(requestId, spotifyUri) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // YouTube-only item: play it via the hidden YouTube player (pauses Spotify,
  // shows it like a now-playing song) instead of Spotify's play_track.
  if (isYouTubeUri(spotifyUri)) {
    const item = queueItems.find((q) => q.id === requestId) || { id: requestId, spotify_uri: spotifyUri };
    await startYouTubeTakeover(item);
    return;
  }

  // Skipping to a Spotify song while a YouTube request is playing: stop the
  // YouTube audio first so they don't overlap.
  await stopYouTubePlayback({ resume: false });

  try {
    await invoke('play_track', { uri: spotifyUri });
    await invoke('remove_song_request', { requestId });
  } catch (e) {
    console.error('[Queue] Play error:', e);
  }
}

/**
 * Remove song from queue
 */
async function removeSong(requestId) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('remove_song_request', { requestId });
  } catch (e) {
    console.error('[Queue] Remove error:', e);
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'gerade eben';
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

/**
 * Update queue container visibility based on queue content
 */
function updateQueueVisibility() {
  // The standalone Queue tab itself is shown/hidden by updateTabVisibility()
  // (tied to the Player tab setting). Here we only toggle the mini-queue that
  // lives inside the Player tab: visible when the Player tab is on and the
  // queue has items.
  const playerQueue = document.getElementById('player-queue-container');
  if (!playerQueue) return;

  const settings = JSON.parse(localStorage.getItem('displaysong-settings') || '{}');
  const playerTabEnabled = settings.showPlayerTab !== false;
  const hasItems = queueItems.length > 0;

  playerQueue.classList.toggle('hidden', !(playerTabEnabled && hasItems));
}

/**
 * Render queue UI
 */
function renderQueue() {
  // Resolve the next YouTube song's audio stream ahead of time so it starts
  // (near-)instantly when its turn comes, instead of waiting ~5s for yt-dlp.
  const next = queueItems[0];
  if (next && isYouTubeUri(next.spotify_uri)) {
    prefetchYouTube(youTubeVideoId(next.spotify_uri));
  }

  const containers = [
    document.getElementById('queue-list'),
    document.getElementById('queue-list-standalone')
  ];

  const counts = [
    document.getElementById('queue-count'),
    document.getElementById('queue-count-standalone')
  ];

  // Update counts
  counts.forEach(el => {
    if (el) el.textContent = queueItems.length;
  });

  // Render each container
  containers.forEach(container => {
    if (!container) return;

    if (queueItems.length === 0) {
      container.innerHTML = `
        <div class="queue-empty">
          <div class="queue-empty-icon">${ICONS.inbox}</div>
          <p class="queue-empty-text">Queue ist leer</p>
          <p class="queue-empty-hint">Nutze !sr im Chat um Songs hinzuzufÃ¼gen</p>
        </div>
      `;
      return;
    }

    container.innerHTML = queueItems.map((item, index) => {
      const trackInfo = trackInfoCache.get(item.spotify_uri);
      const hasInfo = trackInfo?.track && trackInfo?.artist;
      const sourceIcon = item.source === 'points' ? ICONS.star : ICONS.chat;
      const coverUrl = trackInfo?.albumCover || null;
      
      return `
        <div class="queue-item" data-id="${escapeAttr(item.id)}" data-uri="${escapeAttr(item.spotify_uri)}">
          <div class="queue-item-position">${index + 1}</div>

          <div class="queue-item-cover">
            ${coverUrl
              ? `<img src="${escapeAttr(coverUrl)}" alt="Cover">`
              : `<div class="queue-item-cover-placeholder">${ICONS.music}</div>`
            }
          </div>

          <div class="queue-item-info">
            <div class="queue-item-track">
              ${hasInfo
                ? `<span class="queue-item-title">${escapeAttr(trackInfo.track)}</span>`
                : `<span class="queue-item-title loading">LÃ¤dt...</span>`
              }
            </div>
            <div class="queue-item-meta">
              ${hasInfo
                ? `<span class="queue-item-artist">${escapeAttr(trackInfo.artist)}</span>`
                : `<span class="queue-item-uri">${escapeAttr(item.spotify_uri.substring(14, 30))}...</span>`
              }
            </div>
            <div class="queue-item-requester">
              <span class="queue-item-source" title="${item.source === 'points' ? 'Channel Points' : 'Chat Command'}">${sourceIcon}</span>
              <span class="queue-item-user">${escapeAttr(item.user_name)}</span>
              <span class="queue-item-time">${formatTimeAgo(item.timestamp)}</span>
            </div>
          </div>
          
          <div class="queue-item-actions">
            <button class="queue-btn queue-btn-play" title="Jetzt abspielen">
              ${ICONS.play}
            </button>
            <button class="queue-btn queue-btn-remove" title="Entfernen">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');
  });
}

/**
 * Called when player tab visibility changes
 */
export function onPlayerTabVisibilityChange() {
  updateQueueVisibility();
}

/**
 * Called when track changes - check if it's in queue
 */
export function onTrackChange(trackId) {
  if (trackId) {
    checkAndRemovePlayingTrack(trackId);
  }
}

export { queueItems, loadQueue, renderQueue, trackInfoCache };

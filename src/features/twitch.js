/**
 * Twitch Integration - Song Requests via Chat oder Channel Points
 * 
 * Supports:
 * - Spotify Links/URIs
 * - YouTube Links
 * - YouTube Music Links
 * - Apple Music Links
 * - SoundCloud Links
 * - Deezer Links
 * - Tidal Links
 * - And more via Songlink/Odesli API
 */

import { getTauriInvoke } from '../core/tauri.js';
import { showNotification } from '../ui/notifications.js';
import { queueItems } from './queue/queue.js';
import { addToHistory } from './requestHistory.js';

// State
let isConnected = false;
let currentUser = null;
let isConnecting = false;
let eventSubListenersSetup = false;
let lastProcessedRequest = null;
let twitchMessages = {
  nowPlaying: 'Jetzt laeuft: {artist} - {title}',
  songAdded: '@{user} hat hinzugefuegt: {artist} - {title}',
  songNotFound: '@{user} Song nicht gefunden. Nutze einen Spotify, YouTube oder Apple Music Link.',
  cooldown: '@{user} Bitte warte noch {seconds}s',
  tooLong: '@{user} Song ist zu lang (max. {max} Minuten)',
  duplicate: '@{user} Song ist bereits in der Queue',
  converting: '@{user} Konvertiere {platform} zu Spotify...',
  notOnSpotify: '@{user} Song ist nicht auf Spotify verfuegbar'
};

// Local settings (stored in localStorage)
let localSettings = {
  addToSpotify: true,
  maxDuration: 0,
  duplicateCheck: true
};

/**
 * Initialize Twitch integration
 */
export async function initTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  setupEventSubListeners();
  loadLocalSettings();

  try {
    const hasCredentials = await invoke('check_twitch_credentials');
    
    if (hasCredentials) {
      const info = await invoke('twitch_get_connection');
      isConnected = info.connected;
      currentUser = info.user;
      
      if (isConnected) {
        startEventSub();
        checkTwitchScopes();
      }
    }
  } catch (e) {
    console.error('[Twitch] Init error:', e);
  }

  updateTwitchUI();
  loadMessagesFromStorage();
}

/**
 * Check whether the stored Twitch token still has all required scopes.
 * After the app's scope set grows (e.g. channel point redemptions), an old
 * token keeps its original scopes until the user reconnects — which silently
 * breaks EventSub/chat. Warn and offer a reconnect when scopes are missing.
 */
async function checkTwitchScopes() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const missing = await invoke('twitch_check_scopes');
    if (Array.isArray(missing) && missing.length > 0) {
      console.warn('[Twitch] Missing scopes:', missing);
      showNotification(
        'Twitch-Berechtigungen sind veraltet — bitte neu verbinden (Trennen → Verbinden).',
        { type: 'warning', duration: 8000 }
      );
      // Surface a persistent hint in the UI if the element exists.
      const hint = document.getElementById('twitch-scope-warning');
      if (hint) hint.classList.remove('hidden');
    } else {
      const hint = document.getElementById('twitch-scope-warning');
      if (hint) hint.classList.add('hidden');
    }
  } catch (e) {
    // Not connected or validation failed — ignore silently.
    console.debug('[Twitch] Scope check skipped:', e);
  }
}

/**
 * Load local settings from localStorage
 */
function loadLocalSettings() {
  try {
    const stored = localStorage.getItem('twitch-local-settings');
    if (stored) {
      localSettings = { ...localSettings, ...JSON.parse(stored) };
    }
    
    // Apply to UI
    const addToSpotifyCheck = document.getElementById('twitch-add-to-spotify');
    const maxDurationInput = document.getElementById('twitch-max-duration');
    const duplicateCheckInput = document.getElementById('twitch-duplicate-check');
    
    if (addToSpotifyCheck) addToSpotifyCheck.checked = localSettings.addToSpotify;
    if (maxDurationInput) maxDurationInput.value = localSettings.maxDuration;
    if (duplicateCheckInput) duplicateCheckInput.checked = localSettings.duplicateCheck;
  } catch (e) {
    console.error('[Twitch] Load local settings error:', e);
  }
}

/**
 * Save local settings to localStorage
 */
function saveLocalSettings() {
  try {
    localStorage.setItem('twitch-local-settings', JSON.stringify(localSettings));
  } catch (e) {
    console.error('[Twitch] Save local settings error:', e);
  }
}

/**
 * Start EventSub connection for chat commands
 */
async function startEventSub() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('twitch_connect_eventsub');
  } catch (e) {
    console.error('[Twitch] EventSub error:', e);
    showNotification('EventSub Fehler: ' + e, { type: 'error' });
  }
}

/**
 * Setup EventSub event listeners (only once!)
 */
// Track users waiting to post a link after permit
const pendingPermits = new Map(); // Map<userName, { timestamp, userId }>

function setupEventSubListeners() {
  if (eventSubListenersSetup) return;
  if (!window.__TAURI__?.event) return;

  eventSubListenersSetup = true;

  // Handle !sr command (with or without link)
  window.__TAURI__.event.listen('twitch-chat-command', async (event) => {
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
  window.__TAURI__.event.listen('twitch-chat-message', async (event) => {
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

  window.__TAURI__.event.listen('twitch-redemption', async (event) => {
    const { user_id, user_name, user_input } = event.payload;
    await handleSongRequest(user_id, user_name, user_input, 'points');
  });
}

/**
 * Handle permit request - user typed !sr without a link
 * Bot sends /permit to allow links temporarily
 */
async function handlePermitRequest(userId, userName) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    // Check cooldown first
    const onCooldown = await invoke('check_request_cooldown', { userId });
    if (onCooldown) {
      const cooldownSeconds = parseInt(document.getElementById('twitch-cooldown')?.value || '30');
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
      userId: userId
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
 * Check if input looks like a URL
 */
function isUrl(input) {
  return input.startsWith('http://') || 
         input.startsWith('https://') || 
         input.startsWith('spotify:') ||
         input.includes('.com/') ||
         input.includes('.be/');
}

/**
 * Check if input is a Spotify link/URI
 */
function isSpotifyInput(input) {
  return input.startsWith('spotify:track:') ||
         input.includes('spotify.com/track/') ||
         input.includes('spotify.com/intl-');
}

/**
 * Extract Spotify track ID from various Spotify URL formats
 */
function extractSpotifyTrackId(input) {
  // spotify:track:ID format
  if (input.startsWith('spotify:track:')) {
    return input.replace('spotify:track:', '').split('?')[0];
  }
  
  // https://open.spotify.com/track/ID or /intl-xx/track/ID
  if (input.includes('spotify.com')) {
    const match = input.match(/track\/([a-zA-Z0-9]{22})/);
    if (match) return match[1];
  }
  
  // Raw 22-character ID
  if (input.length === 22 && /^[a-zA-Z0-9]+$/.test(input)) {
    return input;
  }
  
  return null;
}

/**
 * Handle song request from chat or channel points
 * Now supports YouTube, Apple Music, SoundCloud, etc.
 */
async function handleSongRequest(userId, userName, input, source) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Deduplicate
  const requestKey = `${userId}_${input}_${Math.floor(Date.now() / 2000)}`;
  if (lastProcessedRequest === requestKey) return;
  lastProcessedRequest = requestKey;

  const trimmedInput = input.trim();
  
  try {
    // Check cooldown
    const cooldownSeconds = parseInt(document.getElementById('twitch-cooldown')?.value || '30');
    const onCooldown = await invoke('check_request_cooldown', { userId });
    if (onCooldown) {
      const msg = twitchMessages.cooldown
        .replace('{user}', userName)
        .replace('{seconds}', cooldownSeconds.toString());
      await invoke('twitch_send_chat', { message: msg });
      return;
    }

    let spotifyUri = null;
    let trackId = null;

    // =========================================================================
    // STEP 1: Try to extract/convert to Spotify
    // =========================================================================
    
    // Check if it's already a Spotify link
    if (isSpotifyInput(trimmedInput)) {
      trackId = extractSpotifyTrackId(trimmedInput);
      if (trackId) {
        spotifyUri = `spotify:track:${trackId}`;
        console.log('[Twitch] Direct Spotify link:', spotifyUri);
      }
    }
    // Check if it's a raw 22-char track ID
    else if (trimmedInput.length === 22 && /^[a-zA-Z0-9]+$/.test(trimmedInput)) {
      trackId = trimmedInput;
      spotifyUri = `spotify:track:${trackId}`;
      console.log('[Twitch] Raw Spotify ID:', spotifyUri);
    }
    // Check if it's another streaming link (YouTube, Apple Music, etc.)
    else if (isUrl(trimmedInput)) {
      console.log('[Twitch] Converting external link:', trimmedInput);
      
      try {
        // Get platform for user feedback
        const platform = await invoke('get_link_platform', { url: trimmedInput });
        
        // Convert to Spotify via Odesli API
        const result = await invoke('convert_link_to_spotify', { url: trimmedInput });
        
        if (result.success && result.spotify_uri) {
          spotifyUri = result.spotify_uri;
          trackId = result.track_id;
          console.log(`[Twitch] Converted ${platform} to Spotify:`, spotifyUri);
        } else {
          // Conversion failed - song not on Spotify
          const msg = twitchMessages.notOnSpotify
            .replace('{user}', userName);
          await invoke('twitch_send_chat', { message: msg });
          return;
        }
      } catch (e) {
        console.error('[Twitch] Link conversion error:', e);
        const msg = twitchMessages.songNotFound
          .replace('{user}', userName)
          .replace('{query}', trimmedInput);
        await invoke('twitch_send_chat', { message: msg });
        return;
      }
    }
    
    // No valid input found
    if (!spotifyUri || !trackId) {
      const msg = twitchMessages.songNotFound
        .replace('{user}', userName)
        .replace('{query}', trimmedInput);
      await invoke('twitch_send_chat', { message: msg });
      return;
    }

    // =========================================================================
    // STEP 2: Check for duplicates
    // =========================================================================
    
    if (localSettings.duplicateCheck) {
      const isDuplicate = queueItems.some(item => item.spotify_uri === spotifyUri);
      if (isDuplicate) {
        const msg = twitchMessages.duplicate.replace('{user}', userName);
        await invoke('twitch_send_chat', { message: msg });
        return;
      }
    }

    // =========================================================================
    // STEP 3: Get track info from Spotify
    // =========================================================================
    
    let trackName = 'Unbekannt';
    let artistName = 'Unbekannt';
    let durationMs = 0;
    
    try {
      const trackInfo = await invoke('get_track_info', { trackId });
      if (trackInfo) {
        trackName = trackInfo.track || 'Unbekannt';
        artistName = trackInfo.artist || 'Unbekannt';
        durationMs = trackInfo.durationMs || 0;
      }
    } catch (e) {
      console.error('[Twitch] Track info error:', e);
    }

    // =========================================================================
    // STEP 4: Check max duration
    // =========================================================================
    
    if (localSettings.maxDuration > 0 && durationMs > 0) {
      const maxMs = localSettings.maxDuration * 60 * 1000;
      if (durationMs > maxMs) {
        const msg = twitchMessages.tooLong
          .replace('{user}', userName)
          .replace('{max}', localSettings.maxDuration.toString());
        await invoke('twitch_send_chat', { message: msg });
        return;
      }
    }

    // =========================================================================
    // STEP 5: Add to Spotify queue
    // =========================================================================
    
    if (localSettings.addToSpotify) {
      try {
        await invoke('add_to_queue', { uri: spotifyUri });
      } catch (e) {
        console.error('[Twitch] Spotify queue error:', e);
        // Continue anyway - add to internal queue
      }
    }

    // =========================================================================
    // STEP 6: Add to internal display queue
    // =========================================================================
    
    await invoke('add_song_request', {
      userId,
      userName,
      spotifyUri,
      source
    });

    // Update cooldown
    await invoke('update_request_cooldown', { userId });

    // =========================================================================
    // STEP 7: Add to history (Spotify Playlist if configured)
    // =========================================================================
    
    try {
      await addToHistory(spotifyUri, { track: trackName, artist: artistName });
    } catch (e) {
      console.error('[Twitch] Add to history error:', e);
    }

    // =========================================================================
    // STEP 8: Send confirmation
    // =========================================================================
    
    const msg = twitchMessages.songAdded
      .replace('{user}', userName)
      .replace('{artist}', artistName)
      .replace('{title}', trackName);
    
    await invoke('twitch_send_chat', { message: msg });

  } catch (e) {
    console.error('[Twitch] Song request error:', e);
  }
}

/**
 * Check if connected to Twitch
 */
export function isTwitchConnected() {
  return isConnected;
}

/**
 * Get current Twitch user
 */
export function getTwitchUser() {
  return currentUser;
}

/**
 * Connect to Twitch - Shows OAuth modal while browser handles auth
 */
export async function connectTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  if (isConnecting) return;
  isConnecting = true;

  const statusText = document.getElementById('twitch-status-text');
  const btnConnect = document.getElementById('btn-twitch-connect');
  const oauthModal = document.getElementById('twitch-oauth-modal');
  
  try {
    // Show OAuth modal
    if (oauthModal) oauthModal.classList.remove('hidden');
    
    if (btnConnect) {
      btnConnect.disabled = true;
      btnConnect.textContent = 'Verbinde...';
    }
    if (statusText) {
      statusText.textContent = 'Verbinde...';
    }

    // This will open browser and wait for callback
    await invoke('twitch_connect');

    const info = await invoke('twitch_get_connection');
    isConnected = info.connected;
    currentUser = info.user;

    if (isConnected) {
      showNotification(`Mit Twitch verbunden als ${currentUser?.display_name || 'User'}`);
      closeOAuthModal();
      startEventSub();
    } else {
      throw new Error('Verbindung fehlgeschlagen');
    }

  } catch (e) {
    console.error('[Twitch] Connect error:', e);
    showNotification(e.toString(), { type: 'error' });
    closeOAuthModal();
  } finally {
    isConnecting = false;
    if (btnConnect) {
      btnConnect.disabled = false;
      btnConnect.textContent = 'Verbinden';
    }
    updateTwitchUI();
  }
}

/**
 * Close OAuth modal and cancel any pending auth
 */
function closeOAuthModal() {
  const modal = document.getElementById('twitch-oauth-modal');
  if (modal) modal.classList.add('hidden');
  isConnecting = false;
}

/**
 * Disconnect from Twitch
 */
export async function disconnectTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('twitch_disconnect');
    
    isConnected = false;
    currentUser = null;
    
    showNotification('Twitch getrennt');
    updateTwitchUI();
    
  } catch (e) {
    console.error('[Twitch] Disconnect error:', e);
    showNotification('Fehler beim Trennen', { type: 'error' });
  }
}

/**
 * Send a test chat message
 */
export async function sendTestMessage() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const settings = await invoke('twitch_get_settings');
    const message = `DisplaySong Song Requests sind aktiv! Nutze ${settings.command} <link> (Spotify, YouTube, Apple Music, SoundCloud...)`;
    
    await invoke('twitch_send_chat', { message });
    showNotification('Test-Nachricht gesendet');
    
  } catch (e) {
    console.error('[Twitch] Send test error:', e);
    showNotification(e.toString(), { type: 'error' });
  }
}

/**
 * Update Twitch settings
 */
export async function updateTwitchSettings(settings) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    if (settings.command !== undefined) {
      await invoke('twitch_set_command', { command: settings.command });
    }
    if (settings.cooldown !== undefined) {
      await invoke('twitch_set_cooldown', { seconds: parseInt(settings.cooldown) || 30 });
    }
    if (settings.mode !== undefined) {
      await invoke('twitch_set_mode', { mode: settings.mode });
    }
    if (settings.subOnly !== undefined) {
      await invoke('twitch_set_sub_only', { enabled: settings.subOnly });
    }
    if (settings.useBot !== undefined) {
      await invoke('twitch_set_use_bot', { useBot: settings.useBot });
    }
  } catch (e) {
    console.error('[Twitch] Settings error:', e);
  }
}

/**
 * Update Twitch UI elements
 */
export function updateTwitchUI() {
  const statusText = document.getElementById('twitch-status-text');
  if (statusText) {
    statusText.textContent = isConnected ? `Verbunden als ${currentUser?.display_name || 'User'}` : 'Nicht verbunden';
    statusText.classList.toggle('connected', isConnected);
  }

  const btnConnect = document.getElementById('btn-twitch-connect');
  const btnDisconnect = document.getElementById('btn-twitch-disconnect');
  
  if (btnConnect) btnConnect.classList.toggle('hidden', isConnected);
  if (btnDisconnect) btnDisconnect.classList.toggle('hidden', !isConnected);

  const settingsSection = document.getElementById('twitch-settings-section');
  if (settingsSection) {
    settingsSection.classList.toggle('hidden', !isConnected);
  }

  const channelDisplay = document.getElementById('twitch-channel-display');
  if (channelDisplay && currentUser) {
    channelDisplay.textContent = currentUser.login;
  }

  const userOption = document.getElementById('twitch-user-option');
  if (userOption && currentUser) {
    userOption.textContent = currentUser.display_name;
  }

  updateChatPreview();
  updateDisconnectAllButton();
}

/**
 * Update the chat preview
 */
function updateChatPreview() {
  const senderName = document.getElementById('chat-sender-name');
  const useBotSelect = document.getElementById('twitch-use-bot');
  
  if (senderName && useBotSelect) {
    const useBot = useBotSelect.value === 'true';
    const name = useBot ? 'DisplaySong' : (currentUser?.display_name || 'Du');
    
    senderName.textContent = name;
    senderName.classList.remove('bot-name', 'user-name');
    senderName.classList.add(useBot ? 'bot-name' : 'user-name');
  }
}

/**
 * Update "Alle Verbindungen trennen" button
 */
function updateDisconnectAllButton() {
  const btn = document.getElementById('btn-disconnect-all');
  if (!btn) return;

  const spotifyConnected = true;
  const twitchConnected = isConnected;
  
  const connectionCount = (spotifyConnected ? 1 : 0) + (twitchConnected ? 1 : 0);
  btn.classList.toggle('hidden', connectionCount < 2);
}

/**
 * Load custom messages from localStorage
 */
function loadMessagesFromStorage() {
  try {
    const stored = localStorage.getItem('twitch-messages');
    if (stored) {
      twitchMessages = { ...twitchMessages, ...JSON.parse(stored) };
    }
    
    const nowPlayingInput = document.getElementById('msg-now-playing');
    const songAddedInput = document.getElementById('msg-song-added');
    const songNotFoundInput = document.getElementById('msg-song-not-found');
    const cooldownInput = document.getElementById('msg-cooldown');
    
    if (nowPlayingInput) nowPlayingInput.value = twitchMessages.nowPlaying;
    if (songAddedInput) songAddedInput.value = twitchMessages.songAdded;
    if (songNotFoundInput) songNotFoundInput.value = twitchMessages.songNotFound;
    if (cooldownInput) cooldownInput.value = twitchMessages.cooldown;
  } catch (e) {
    console.error('[Twitch] Load messages error:', e);
  }
}

/**
 * Save custom messages to localStorage
 */
function saveMessagesToStorage() {
  try {
    const nowPlayingInput = document.getElementById('msg-now-playing');
    const songAddedInput = document.getElementById('msg-song-added');
    const songNotFoundInput = document.getElementById('msg-song-not-found');
    const cooldownInput = document.getElementById('msg-cooldown');
    
    twitchMessages = {
      ...twitchMessages,
      nowPlaying: nowPlayingInput?.value || twitchMessages.nowPlaying,
      songAdded: songAddedInput?.value || twitchMessages.songAdded,
      songNotFound: songNotFoundInput?.value || twitchMessages.songNotFound,
      cooldown: cooldownInput?.value || twitchMessages.cooldown
    };
    
    localStorage.setItem('twitch-messages', JSON.stringify(twitchMessages));
    showNotification('Nachrichten gespeichert');
  } catch (e) {
    console.error('[Twitch] Save messages error:', e);
  }
}

/**
 * Reset messages to default
 */
function resetMessagesToDefault() {
  twitchMessages = {
    nowPlaying: 'Jetzt laeuft: {artist} - {title}',
    songAdded: '@{user} hat hinzugefuegt: {artist} - {title}',
    songNotFound: '@{user} Song nicht gefunden. Versuche: !sr Spotify-Link oder YouTube-Link',
    cooldown: '@{user} Bitte warte noch {seconds}s',
    tooLong: '@{user} Song ist zu lang (max. {max} Minuten)',
    duplicate: '@{user} Song ist bereits in der Queue',
    converting: '@{user} Konvertiere {platform} zu Spotify...',
    notOnSpotify: '@{user} Song ist nicht auf Spotify verfuegbar'
  };
  
  localStorage.removeItem('twitch-messages');
  loadMessagesFromStorage();
  showNotification('Nachrichten zurueckgesetzt');
}

/**
 * Get current messages
 */
export function getTwitchMessages() {
  return twitchMessages;
}

/**
 * Apply the request mode to the UI (show/hide command vs channel-points settings).
 */
function applyTwitchMode(mode) {
  document.querySelectorAll('#twitch-mode-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const commandSettings = document.getElementById('twitch-command-mode-settings');
  const pointsSettings = document.getElementById('twitch-points-mode-settings');
  if (commandSettings) commandSettings.classList.toggle('hidden', mode !== 'commands');
  if (pointsSettings) pointsSettings.classList.toggle('hidden', mode !== 'points');
}

/**
 * Switch request mode, persist it and reconnect EventSub so the correct
 * subscription (chat messages vs. channel-point redemptions) becomes active.
 */
async function setTwitchMode(mode) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  applyTwitchMode(mode);
  try {
    await updateTwitchSettings({ mode });
    if (mode === 'points') {
      await loadRewards();
    }
    if (isConnected) await invoke('twitch_connect_eventsub');
  } catch (e) {
    console.error('[Twitch] Set mode error:', e);
  }
}

/** Escape user-provided text before inserting it into option markup. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Load the channel's existing point rewards into the dropdown.
 */
async function loadRewards(selectedId) {
  const invoke = getTauriInvoke();
  const select = document.getElementById('twitch-reward-select');
  if (!invoke || !select) return;

  try {
    const rewards = await invoke('twitch_get_rewards');
    const current = selectedId ?? select.value;
    select.innerHTML = '<option value="">— Belohnung wählen —</option>' +
      (rewards || []).map(r =>
        `<option value="${r.id}">${escapeHtml(r.title)} (${r.cost})</option>`
      ).join('');
    if (current) select.value = current;
  } catch (e) {
    console.error('[Twitch] Load rewards error:', e);
    showNotification('Belohnungen konnten nicht geladen werden: ' + e, { type: 'error' });
  }
}

/**
 * Persist the selected reward id and reconnect EventSub for the redemption sub.
 */
async function setReward(rewardId) {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('twitch_set_reward_id', { rewardId: rewardId || null });
    if (isConnected) await invoke('twitch_connect_eventsub');
  } catch (e) {
    console.error('[Twitch] Set reward error:', e);
  }
}

/**
 * Create a new "Song Request" channel-point reward, then select it.
 */
async function createReward() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  const titleInput = document.getElementById('twitch-reward-title');
  const costInput = document.getElementById('twitch-reward-cost');
  const title = titleInput?.value?.trim() || 'Song Request';
  const cost = parseInt(costInput?.value) || 500;

  try {
    const reward = await invoke('twitch_create_reward', { title, cost });
    showNotification(`Belohnung "${reward.title}" erstellt!`);
    document.getElementById('twitch-create-reward-form')?.classList.add('hidden');
    await loadRewards(reward.id);
    await setReward(reward.id);
  } catch (e) {
    console.error('[Twitch] Create reward error:', e);
    showNotification('Belohnung konnte nicht erstellt werden: ' + e, { type: 'error' });
  }
}

/**
 * Setup Twitch event listeners
 */
export function setupTwitchListeners() {
  document.getElementById('btn-twitch-connect')?.addEventListener('click', connectTwitch);
  document.getElementById('btn-twitch-disconnect')?.addEventListener('click', disconnectTwitch);

  document.getElementById('btn-disconnect-all')?.addEventListener('click', async () => {
    if (isConnected) await disconnectTwitch();
    document.getElementById('btn-disconnect')?.click();
  });

  document.getElementById('twitch-command')?.addEventListener('change', async (e) => {
    await updateTwitchSettings({ command: e.target.value });
    showNotification(`Command: ${e.target.value}`);
  });

  document.getElementById('twitch-cooldown')?.addEventListener('change', async (e) => {
    await updateTwitchSettings({ cooldown: e.target.value });
  });

  document.getElementById('twitch-sub-only')?.addEventListener('change', async (e) => {
    await updateTwitchSettings({ subOnly: e.target.checked });
  });

  // Channel Points: mode toggle + reward selection/creation
  document.querySelectorAll('#twitch-mode-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setTwitchMode(btn.dataset.mode));
  });
  document.getElementById('twitch-reward-select')?.addEventListener('change', (e) => setReward(e.target.value));
  document.getElementById('btn-twitch-refresh-rewards')?.addEventListener('click', () => loadRewards());
  document.getElementById('btn-twitch-create-reward')?.addEventListener('click', () => {
    document.getElementById('twitch-create-reward-form')?.classList.toggle('hidden');
  });
  document.getElementById('btn-twitch-save-reward')?.addEventListener('click', createReward);

  // Local settings (stored in localStorage, not backend)
  document.getElementById('twitch-add-to-spotify')?.addEventListener('change', (e) => {
    localSettings.addToSpotify = e.target.checked;
    saveLocalSettings();
  });

  document.getElementById('twitch-max-duration')?.addEventListener('change', (e) => {
    localSettings.maxDuration = parseInt(e.target.value) || 0;
    saveLocalSettings();
  });

  document.getElementById('twitch-duplicate-check')?.addEventListener('change', (e) => {
    localSettings.duplicateCheck = e.target.checked;
    saveLocalSettings();
  });

  document.getElementById('twitch-use-bot')?.addEventListener('change', async (e) => {
    const useBot = e.target.value === 'true';
    await updateTwitchSettings({ useBot });
    updateChatPreview();
  });

  document.getElementById('btn-twitch-test')?.addEventListener('click', sendTestMessage);

  document.getElementById('btn-twitch-messages')?.addEventListener('click', () => {
    const modal = document.getElementById('twitch-messages-modal');
    if (modal) {
      loadMessagesFromStorage();
      modal.classList.remove('hidden');
    }
  });

  document.querySelector('[data-modal="twitch-messages-modal"]')?.addEventListener('click', () => {
    document.getElementById('twitch-messages-modal')?.classList.add('hidden');
  });

  document.getElementById('btn-save-messages')?.addEventListener('click', () => {
    saveMessagesToStorage();
    document.getElementById('twitch-messages-modal')?.classList.add('hidden');
  });

  document.getElementById('btn-reset-messages')?.addEventListener('click', resetMessagesToDefault);

  document.querySelector('[data-modal="twitch-oauth-modal"]')?.addEventListener('click', closeOAuthModal);
  document.getElementById('btn-cancel-twitch-auth')?.addEventListener('click', closeOAuthModal);

  loadTwitchSettingsToUI();
  loadLocalSettings();
}

/**
 * Load Twitch settings into UI
 */
async function loadTwitchSettingsToUI() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const settings = await invoke('twitch_get_settings');
    
    const cmdInput = document.getElementById('twitch-command');
    if (cmdInput) cmdInput.value = settings.command || '!sr';

    const cooldownInput = document.getElementById('twitch-cooldown');
    if (cooldownInput) cooldownInput.value = settings.cooldown || 30;

    const subOnlyInput = document.getElementById('twitch-sub-only');
    if (subOnlyInput) subOnlyInput.checked = settings.subOnly || false;

    const useBotSelect = document.getElementById('twitch-use-bot');
    if (useBotSelect) {
      useBotSelect.value = settings.useBotAccount ? 'true' : 'false';
      updateChatPreview();
    }

    // Apply request mode (chat command vs channel points) and load rewards.
    const mode = settings.mode || 'commands';
    applyTwitchMode(mode);
    if (mode === 'points') {
      await loadRewards(settings.rewardId);
    }

  } catch (e) {
    console.error('[Twitch] Load settings error:', e);
  }
}

// Legacy exports
export function openTwitchSetup() { connectTwitch(); }
export function closeTwitchSetup() { closeOAuthModal(); }

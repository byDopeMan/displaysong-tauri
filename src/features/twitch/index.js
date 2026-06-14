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

import { getTauriInvoke } from '../../core/tauri.js';
import { showNotification } from '../../ui/notifications.js';
import {
  applyTwitchMode,
  setTwitchMode,
  loadRewards,
  simulateRedemption,
  setReward,
  createReward,
} from './channel-points.js';
import {
  loadMessagesFromStorage,
  saveMessagesToStorage,
  resetMessagesToDefault,
} from './messages.js';
import {
  setupSongRequestListeners,
  setupRequestSettingsListeners,
  loadLocalSettings,
} from './song-request.js';
import {
  isTwitchConnected,
  getTwitchUser,
  isConnecting,
  setConnected,
  setUser,
  setConnecting,
} from './state.js';
import { updateTwitchUI, updateChatPreview } from './ui.js';

// Re-export connection state getters + UI so existing importers keep working.
export { isTwitchConnected, getTwitchUser } from './state.js';
export { updateTwitchUI } from './ui.js';

/**
 * Initialize Twitch integration
 */
export async function initTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  setupSongRequestListeners();
  loadLocalSettings();

  try {
    const hasCredentials = await invoke('check_twitch_credentials');
    
    if (hasCredentials) {
      const info = await invoke('twitch_get_connection');
      setConnected(info.connected);
      setUser(info.user);

      if (isTwitchConnected()) {
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
 * Connect to Twitch - Shows OAuth modal while browser handles auth
 */
export async function connectTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  if (isConnecting()) return;
  setConnecting(true);

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
    setConnected(info.connected);
    setUser(info.user);

    if (isTwitchConnected()) {
      showNotification(`Mit Twitch verbunden als ${getTwitchUser()?.display_name || 'User'}`);
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
    setConnecting(false);
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
  setConnecting(false);
}

/**
 * Disconnect from Twitch
 */
export async function disconnectTwitch() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('twitch_disconnect');

    setConnected(false);
    setUser(null);

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
 * Setup Twitch event listeners
 */
export function setupTwitchListeners() {
  document.getElementById('btn-twitch-connect')?.addEventListener('click', connectTwitch);
  document.getElementById('btn-twitch-disconnect')?.addEventListener('click', disconnectTwitch);

  document.getElementById('btn-disconnect-all')?.addEventListener('click', async () => {
    if (isTwitchConnected()) await disconnectTwitch();
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
  document.getElementById('btn-twitch-test-redemption')?.addEventListener('click', simulateRedemption);

  // Request settings (max duration, duplicate check) — wired by the module.
  setupRequestSettingsListeners();

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

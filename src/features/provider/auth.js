/**
 * Spotify Authentication
 */

import { state, elements } from '../../core/state.js';
import { getTauriInvoke } from '../../core/tauri.js';
import { showView, openExternal } from '../../ui/navigation.js';
import { showNotification } from '../../ui/notifications.js';
import { removeItem } from '../../utils/storage';
import { updateWidgetList } from '../widgets.js';
import { t } from '../../utils/i18n';
import { setSpotifyConnected } from './provider-ui.js';

/**
 * Save Spotify credentials and start auth
 */
export async function saveCredentials(clientId, clientSecret) {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { 
      showNotification('Tauri API nicht verfügbar'); 
      return; 
    }

    removeItem('using_developer_credentials');
    
    await invoke('save_credentials', { clientId, clientSecret });
    await invoke('start_auth_server');
    const authUrl = await invoke('get_auth_url');
    if (authUrl) {
      showView('auth');
      await openExternal(authUrl);
    }
  } catch (e) {
    showNotification('Fehler: ' + e);
  }
}

/**
 * Disconnect from Spotify
 */
export async function disconnectSpotify() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    
    await invoke('disconnect_spotify');

    removeItem('using_developer_credentials');
    
    state.isAuthenticated = false;
    updateSpotifyStatus(false);
    setSpotifyConnected(false);
    
    // Auto-switch to Windows Audio provider when Spotify is disconnected
    const { PROVIDER, setProvider, loadSavedProvider } = await import('./provider.js');
    const currentProvider = loadSavedProvider();
    
    if (currentProvider === PROVIDER.SPOTIFY) {
      setProvider(PROVIDER.WINDOWS_AUDIO);
      
      // Update provider select UI
      const providerSelect = document.getElementById('music-provider-select');
      if (providerSelect) {
        providerSelect.value = PROVIDER.WINDOWS_AUDIO;
      }
      
      // Restart Windows Audio polling
      const { startWindowsAudioPolling } = await import('../../app.js');
      startWindowsAudioPolling(invoke);
      
      showNotification('Zu Windows Audio gewechselt');
    }
    
    // Do NOT show setup view - stay on current view
    // showView('setup'); // REMOVED
    
    // Stop access request polling
    import('../access/index.js').then(module => {
      if (module.stopBlockCheckPolling) module.stopBlockCheckPolling();
      if (module.stopStatusPolling) module.stopStatusPolling();
    });
  } catch (e) {
    console.error('Disconnect error:', e);
  }
}

/**
 * Update Spotify connection status in UI
 */
export function updateSpotifyStatus(connected) {
  if (elements.spotifyStatusText) {
    elements.spotifyStatusText.textContent = connected 
      ? t('settings.connections.connected', {}, 'Verbunden') 
      : t('settings.connections.notConnected', {}, 'Nicht verbunden');
    elements.spotifyStatusText.style.color = connected ? 'var(--accent)' : '#888';
    elements.spotifyStatusText.classList.toggle('connected', connected);
  }
}

/**
 * Check for existing credentials on startup
 */
export async function checkExistingCredentialsWithStatus(setStatus) {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { 
      showView('setup'); 
      return false; 
    }
    
    setStatus('Suche gespeicherte Anmeldedaten...');
    await new Promise(r => setTimeout(r, 200));
    
    const hasCredentials = await invoke('check_credentials');
    
    if (hasCredentials) {
      setStatus('Anmeldedaten gefunden!');
      await new Promise(r => setTimeout(r, 300));
      setStatus('Verbinde mit Spotify...');
      await new Promise(r => setTimeout(r, 500));
      
      state.isAuthenticated = true;
      updateSpotifyStatus(true);
      return true;
    } else {
      setStatus('Keine Anmeldedaten gefunden');
      await new Promise(r => setTimeout(r, 300));
      return false;
    }
  } catch (e) {
    console.error('Credential check failed:', e);
    return false;
  }
}

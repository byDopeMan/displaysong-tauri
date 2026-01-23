/**
 * Spotify Authentication
 */

import { state, elements } from '../core/state.js';
import { getTauriInvoke } from '../core/tauri.js';
import { showView, openExternal } from '../ui/navigation.js';
import { showNotification } from '../ui/notifications.js';
import { removeItem } from '../utils/storage.js';
import { updateWidgetList } from './widgets.js';

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
      openExternal(authUrl);
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
    state.currentTrack = null;
    state.activeWidgets.clear();
    updateWidgetList();
    showView('setup');
    updateSpotifyStatus(false);
    
    // Stop all polling after state cleanup
    import('./access-request.js').then(module => {
      if (module.stopBlockCheck) module.stopBlockCheck();
      if (module.stopStatusPolling) module.stopStatusPolling();
    });
  } catch (e) {}
}

/**
 * Update Spotify connection status in UI
 */
export function updateSpotifyStatus(connected) {
  if (elements.spotifyStatusText) {
    elements.spotifyStatusText.textContent = connected ? 'Verbunden' : 'Nicht verbunden';
    elements.spotifyStatusText.style.color = connected ? 'var(--accent)' : '#888';
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
      return; 
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
      showView('player');
      updateSpotifyStatus(true);
      
      // ✅ WICHTIG: Access-System nach Login starten!
      const { initAccessSystem } = await import('./access-request.js');
      initAccessSystem();
    } else {
      setStatus('Keine Anmeldedaten gefunden');
      await new Promise(r => setTimeout(r, 300));
      showView('setup');
    }
  } catch (e) {
    console.error('Credential check failed:', e);
    showView('setup');
  }
}

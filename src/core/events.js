/**
 * Event Listeners Setup
 */

import { state, elements } from './state.js';
import { getTauriListen } from './tauri.js';
import { updateTrackDisplay } from '../ui/track-display.js';
import { switchTab, showView } from '../ui/navigation.js';
import { showNotification } from '../ui/notifications.js';
import { toggleWidget, openConfigFolder, reloadWidgets } from '../features/widgets.js';
import { disconnectSpotify } from '../features/auth.js';
import { refreshHistory } from '../features/history.js';

/**
 * Setup all UI event listeners
 */
export function setupEventListeners() {
  if (elements.tabs) {
    elements.tabs.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  // NOTE: credentials-form handler is in setup.js
  // Do not add a duplicate handler here!

  document.querySelectorAll('.btn-show').forEach(btn => {
    btn.addEventListener('click', () => toggleWidget(btn.dataset.widget));
  });

  if (elements.btnDisconnect) {
    elements.btnDisconnect.addEventListener('click', disconnectSpotify);
  }
  
  if (elements.btnCancelAuth) {
    elements.btnCancelAuth.addEventListener('click', () => showView('setup'));
  }

  const btnOpenFolder = document.getElementById('btn-open-folder');
  if (btnOpenFolder) btnOpenFolder.addEventListener('click', openConfigFolder);

  const btnReloadWidgets = document.getElementById('btn-reload-widgets');
  if (btnReloadWidgets) btnReloadWidgets.addEventListener('click', reloadWidgets);
  
  document.querySelectorAll('.design-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setHistoryDesign(btn.dataset.design));
  });
  
  setupExternalLinks();
}

/**
 * Setup external link handlers
 */
async function setupExternalLinks() {
  const { openExternal } = await import('../ui/navigation.js');
  
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openExternal(link.href);
    });
  });
}

/**
 * Setup deep link handler for Spotify auth
 */
export async function setupDeepLinkHandler() {
  const listen = getTauriListen();
  if (!listen) return;
  
  await listen('auth-success', async () => {
    state.isAuthenticated = true;
    showView('player');
    const { updateSpotifyStatus } = await import('../features/auth.js');
    const { setSpotifyConnected } = await import('../features/provider-ui.js');
    const { PROVIDER, loadSavedProvider } = await import('../features/provider.js');
    
    updateSpotifyStatus(true);
    setSpotifyConnected(true);
    showNotification('Spotify verbunden!');
    
    // Show nav tabs
    document.getElementById('nav-tabs')?.classList.remove('hidden');
    
    // DO NOT auto-switch to Spotify provider or start Spotify polling
    // The user must manually switch the provider if they want Spotify API
    // Keep current Windows Audio polling running
    
    const currentProvider = loadSavedProvider();
    console.log('[Auth] Spotify connected, current provider:', currentProvider);
    
    // Only start access system (for 420 code users)
    const { initAccessSystem } = await import('../features/access-request.js');
    initAccessSystem();
  });
  
  await listen('auth-error', (event) => {
    showNotification('Authentifizierung fehlgeschlagen');
    showView('setup');
  });
}

/**
 * Setup track update listener
 */
export async function setupTrackListener() {
  const listen = getTauriListen();
  if (!listen) return;
  
  await listen('track-update', (event) => {
    const track = event.payload;
    const isNewTrack = !state.currentTrack || 
      (track && (state.currentTrack.track !== track.track || state.currentTrack.artist !== track.artist));
    
    updateTrackDisplay(track);
    
    if (isNewTrack && track?.track) {
      refreshHistory();
    }
  });
}

/**
 * Provider UI Management
 * Handles Spotify connection status in Settings and visibility of Spotify-dependent features
 */

import { getTauriInvoke } from '../../core/tauri.js';
import { showView } from '../../ui/navigation.js';
import { showNotification } from '../../ui/notifications.js';
import { PROVIDER, loadSavedProvider, setProvider } from './provider.js';
import { state } from '../../core/state.js';
import { updatePriorityButtonVisibility } from './source-priority.js';

// Track Spotify connection state
let isSpotifyConnected = false;

/**
 * Initialize provider UI
 */
export function initProviderUI() {
  updateSpotifyUI();
  setupSpotifyConnectButton();
  setupProviderSelect();
  setupHistoryStorageToggle();
  setupSongRequestsToggle();
  setupHistorySourceFilter();
}

/**
 * Check if Spotify is connected
 */
export function getSpotifyConnected() {
  return isSpotifyConnected;
}

/**
 * Set Spotify connection state and update UI
 */
export function setSpotifyConnected(connected) {
  isSpotifyConnected = connected;
  updateSpotifyUI();
  updateSpotifyDependentFeatures();
}

/**
 * Update Spotify connection UI in Settings
 */
function updateSpotifyUI() {
  const statusText = document.getElementById('spotify-status-text');
  const disconnectBtn = document.getElementById('btn-disconnect');
  const connectBtn = document.getElementById('btn-spotify-connect');
  const spotifyConnection = document.getElementById('spotify-connection');
  
  if (statusText) {
    statusText.textContent = isSpotifyConnected ? 'Verbunden' : 'Nicht verbunden';
    statusText.setAttribute('data-i18n', isSpotifyConnected 
      ? 'settings.connections.connected' 
      : 'settings.connections.notConnected');
  }
  
  // Show/hide connect/disconnect buttons
  if (disconnectBtn) {
    disconnectBtn.classList.toggle('hidden', !isSpotifyConnected);
  }
  if (connectBtn) {
    connectBtn.classList.toggle('hidden', isSpotifyConnected);
  }
  
  // Visual indicator
  if (spotifyConnection) {
    spotifyConnection.classList.toggle('connected', isSpotifyConnected);
    spotifyConnection.classList.toggle('not-connected', !isSpotifyConnected);
  }
}

/**
 * Setup Spotify connect button in Settings
 */
function setupSpotifyConnectButton() {
  const connectBtn = document.getElementById('btn-spotify-connect');
  
  connectBtn?.addEventListener('click', () => {
    // Navigate to Spotify setup view
    showView('spotify-setup');
  });
}

/**
 * Setup Provider select in Settings
 */
function setupProviderSelect() {
  const select = document.getElementById('music-provider-select');
  const hint = document.getElementById('provider-hint');
  
  if (!select) return;
  
  // Load current provider
  const currentProvider = loadSavedProvider();
  select.value = currentProvider;
  updateProviderHint(currentProvider, hint);
  
  select.addEventListener('change', async () => {
    const newProvider = select.value;
    
    // Restart polling with new provider
    const invoke = getTauriInvoke();
    if (invoke) {
      if (newProvider === PROVIDER.WINDOWS_AUDIO) {
        // Stop Spotify polling first
        try {
          await invoke('stop_spotify_polling');
        } catch (e) {
          // Ignore if not running
        }
        
        // Start Windows Audio polling
        const { startWindowsAudioPolling } = await import('../../app.js');
        setProvider(newProvider);
        updateProviderHint(newProvider, hint);
        updatePriorityButtonVisibility();
        startWindowsAudioPolling(invoke);
        showNotification('Windows Audio aktiviert');
      } else if (newProvider === PROVIDER.SPOTIFY) {
        // Check if Spotify is connected
        if (!isSpotifyConnected) {
          showNotification('Spotify nicht verbunden - bitte zuerst verbinden', { type: 'warning' });
          // Reset to Windows Audio visually (don't change saved provider)
          select.value = PROVIDER.WINDOWS_AUDIO;
          // Button stays visible since provider is still Windows Audio
          return;
        }
        
        // Stop Windows Audio polling
        const { stopWindowsAudioPolling } = await import('../../app.js');
        stopWindowsAudioPolling();
        
        setProvider(newProvider);
        updateProviderHint(newProvider, hint);
        updatePriorityButtonVisibility();
        
        // Start Spotify polling via backend
        try {
          await invoke('start_spotify_polling');
          showNotification('Spotify API aktiviert');
        } catch (e) {
          console.error('Failed to start Spotify polling:', e);
          showNotification('Fehler beim Starten von Spotify', { type: 'error' });
        }
      }
    }
  });
}

/**
 * Update provider hint text
 */
async function updateProviderHint(provider, hintEl) {
  if (!hintEl) return;
  
  const { t } = await import('../../utils/i18n.js');
  
  if (provider === PROVIDER.WINDOWS_AUDIO) {
    hintEl.textContent = t('settings.system.providerHintWindows', {}, 'Windows Audio erkennt Musik von allen Playern automatisch.');
    hintEl.setAttribute('data-i18n', 'settings.system.providerHintWindows');
  } else {
    hintEl.textContent = t('settings.system.providerHintSpotify', {}, 'Spotify API ermöglicht Song Requests direkt zur Spotify Queue.');
    hintEl.setAttribute('data-i18n', 'settings.system.providerHintSpotify');
  }
}

/**
 * Update visibility of Spotify-dependent features
 */
function updateSpotifyDependentFeatures() {
  // Hide/show Spotify-only features
  const spotifyOnlyElements = document.querySelectorAll('[data-requires-spotify]');
  spotifyOnlyElements.forEach(el => {
    el.classList.toggle('hidden', !isSpotifyConnected);
  });
  
  // Spotify Playlist storage option
  const spotifyPlaylistBtn = document.querySelector('[data-storage="spotify"]');
  if (spotifyPlaylistBtn) {
    spotifyPlaylistBtn.disabled = !isSpotifyConnected;
    spotifyPlaylistBtn.title = isSpotifyConnected ? '' : 'Spotify nicht verbunden';
    if (!isSpotifyConnected) {
      spotifyPlaylistBtn.classList.remove('active');
      // Switch to local if spotify was selected
      const localBtn = document.querySelector('[data-storage="local"]');
      if (localBtn && !localBtn.classList.contains('active')) {
        localBtn.classList.add('active');
        document.getElementById('local-history-settings')?.classList.remove('hidden');
        document.getElementById('spotify-playlist-settings')?.classList.add('hidden');
      }
    }
  }
  
  // Spotify embed button in history
  const embedBtn = document.querySelector('.design-toggle-btn[data-design="embedded"]');
  if (embedBtn) {
    embedBtn.disabled = !isSpotifyConnected;
    embedBtn.title = isSpotifyConnected ? 'Spotify Embed' : 'Spotify nicht verbunden';
  }
}

/**
 * Setup history storage toggle (Local vs Spotify Playlist)
 */
function setupHistoryStorageToggle() {
  const toggleGroup = document.getElementById('history-storage-toggle');
  if (!toggleGroup) return;
  
  toggleGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    
    const storage = btn.dataset.storage;
    
    // Check if Spotify is available
    if (storage === 'spotify' && !isSpotifyConnected) {
      showNotification('Spotify nicht verbunden', { type: 'warning' });
      return;
    }
    
    // Update active state
    toggleGroup.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Show appropriate settings
    const localSettings = document.getElementById('local-history-settings');
    const spotifySettings = document.getElementById('spotify-playlist-settings');
    
    if (storage === 'local') {
      localSettings?.classList.remove('hidden');
      spotifySettings?.classList.add('hidden');
    } else {
      localSettings?.classList.add('hidden');
      spotifySettings?.classList.remove('hidden');
    }
    
    // Save preference
    localStorage.setItem('history-storage', storage);
  });
}

/**
 * Setup Song Requests toggle (collapsible section)
 */
function setupSongRequestsToggle() {
  const toggle = document.getElementById('song-requests-toggle');
  const content = document.getElementById('song-requests-content');
  
  if (!toggle || !content) return;
  
  // Load saved state
  const enabled = localStorage.getItem('song-requests-enabled') !== 'false';
  toggle.checked = enabled;
  content.classList.toggle('collapsed', !enabled);
  
  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    content.classList.toggle('collapsed', !isEnabled);
    localStorage.setItem('song-requests-enabled', isEnabled);
    
    // Emit event for other modules
    window.dispatchEvent(new CustomEvent('song-requests-toggle', { detail: { enabled: isEnabled } }));
  });
}

/**
 * Setup history source filter (All vs Spotify only)
 */
function setupHistorySourceFilter() {
  const filterSelect = document.getElementById('history-source-filter');
  if (!filterSelect) return;
  
  // Load saved preference
  const savedFilter = localStorage.getItem('history-source-filter') || 'all';
  filterSelect.value = savedFilter;
  
  filterSelect.addEventListener('change', () => {
    const filter = filterSelect.value;
    localStorage.setItem('history-source-filter', filter);
    
    // Emit event for history module to reload
    window.dispatchEvent(new CustomEvent('history-filter-change', { detail: { filter } }));
  });
}

/**
 * Get current history source filter
 */
export function getHistorySourceFilter() {
  return localStorage.getItem('history-source-filter') || 'all';
}

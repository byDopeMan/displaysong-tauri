/**
 * Provider UI Management
 * Handles Spotify connection status in Settings and visibility of Spotify-dependent features
 */

import { getTauriInvoke } from '../../core/tauri';
import { showView } from '../../ui/navigation';
import { showNotification } from '../../ui/notifications';
import { t } from '../../utils/i18n';
import { PROVIDER, loadSavedProvider, setProvider } from './provider';
import { state } from '../../core/state';
import { updatePriorityButtonVisibility } from './source-priority';

// Track Spotify connection state
let isSpotifyConnected = false;

/** Initialize provider UI */
export function initProviderUI(): void {
  updateSpotifyUI();
  setupSpotifyConnectButton();
  setupProviderSelect();
  setupHistoryStorageToggle();
  setupSongRequestsToggle();
  setupHistorySourceFilter();
}

/** Check if Spotify is connected */
export function getSpotifyConnected(): boolean {
  return isSpotifyConnected;
}

/** Set Spotify connection state and update UI */
export function setSpotifyConnected(connected: boolean): void {
  isSpotifyConnected = connected;
  updateSpotifyUI();
  updateSpotifyDependentFeatures();
}

/** Update Spotify connection UI in Settings */
function updateSpotifyUI(): void {
  const statusText = document.getElementById('spotify-status-text');
  const disconnectBtn = document.getElementById('btn-disconnect');
  const connectBtn = document.getElementById('btn-spotify-connect');
  const spotifyConnection = document.getElementById('spotify-connection');

  if (statusText) {
    statusText.setAttribute('data-i18n', isSpotifyConnected
      ? 'settings.connections.connected'
      : 'settings.connections.notConnected');
    statusText.textContent = isSpotifyConnected
      ? t('settings.connections.connected', {}, 'Verbunden')
      : t('settings.connections.notConnected', {}, 'Nicht verbunden');
  }

  if (disconnectBtn) {
    disconnectBtn.classList.toggle('hidden', !isSpotifyConnected);
  }
  if (connectBtn) {
    connectBtn.classList.toggle('hidden', isSpotifyConnected);
  }

  if (spotifyConnection) {
    spotifyConnection.classList.toggle('connected', isSpotifyConnected);
    spotifyConnection.classList.toggle('not-connected', !isSpotifyConnected);
  }
}

/** Setup Spotify connect button in Settings */
function setupSpotifyConnectButton(): void {
  const connectBtn = document.getElementById('btn-spotify-connect');

  connectBtn?.addEventListener('click', () => {
    // Navigate to Spotify setup view
    showView('spotify-setup');
  });
}

/** Setup Provider select in Settings */
function setupProviderSelect(): void {
  const select = document.getElementById('music-provider-select') as HTMLSelectElement | null;
  const hint = document.getElementById('provider-hint');

  if (!select) return;

  // Load current provider
  const currentProvider = loadSavedProvider();
  select.value = currentProvider;
  updateProviderHint(currentProvider, hint);

  select.addEventListener('change', async () => {
    const newProvider = select.value;

    const invoke = getTauriInvoke();
    if (invoke) {
      if (newProvider === PROVIDER.WINDOWS_AUDIO) {
        try {
          await invoke('stop_spotify_polling');
        } catch (e) {
          // Ignore if not running
        }

        const { startWindowsAudioPolling } = await import('../../app');
        setProvider(newProvider);
        updateProviderHint(newProvider, hint);
        updatePriorityButtonVisibility();
        startWindowsAudioPolling(invoke);
        showNotification(t('notifications.windowsAudioEnabled', {}, 'Windows Audio aktiviert'));
      } else if (newProvider === PROVIDER.SPOTIFY) {
        if (!isSpotifyConnected) {
          showNotification(t('notifications.spotifyNotConnectedFirst', {}, 'Spotify nicht verbunden - bitte zuerst verbinden'), { type: 'warning' });
          select.value = PROVIDER.WINDOWS_AUDIO;
          return;
        }

        const { stopWindowsAudioPolling } = await import('../../app');
        stopWindowsAudioPolling();

        setProvider(newProvider);
        updateProviderHint(newProvider, hint);
        updatePriorityButtonVisibility();

        try {
          await invoke('start_spotify_polling');
          showNotification(t('notifications.spotifyApiEnabled', {}, 'Spotify API aktiviert'));
        } catch (e) {
          console.error('Failed to start Spotify polling:', e);
          showNotification(t('notifications.spotifyStartError', {}, 'Fehler beim Starten von Spotify'), { type: 'error' });
        }
      }
    }
  });
}

/** Update provider hint text */
async function updateProviderHint(provider: string, hintEl: HTMLElement | null): Promise<void> {
  if (!hintEl) return;

  const { t } = await import('../../utils/i18n');

  if (provider === PROVIDER.WINDOWS_AUDIO) {
    hintEl.textContent = t('settings.system.providerHintWindows', {}, 'Windows Audio erkennt Musik von allen Playern automatisch.');
    hintEl.setAttribute('data-i18n', 'settings.system.providerHintWindows');
  } else {
    hintEl.textContent = t('settings.system.providerHintSpotify', {}, 'Spotify API ermöglicht Song Requests direkt zur Spotify Queue.');
    hintEl.setAttribute('data-i18n', 'settings.system.providerHintSpotify');
  }
}

/** Update visibility of Spotify-dependent features */
function updateSpotifyDependentFeatures(): void {
  const spotifyOnlyElements = document.querySelectorAll('[data-requires-spotify]');
  spotifyOnlyElements.forEach((el) => {
    el.classList.toggle('hidden', !isSpotifyConnected);
  });

  // Spotify Playlist storage option
  const spotifyPlaylistBtn = document.querySelector('[data-storage="spotify"]') as HTMLButtonElement | null;
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
}

/** Setup history storage toggle (Local vs Spotify Playlist) */
function setupHistoryStorageToggle(): void {
  const toggleGroup = document.getElementById('history-storage-toggle');
  if (!toggleGroup) return;

  toggleGroup.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.toggle-btn') as HTMLElement | null;
    if (!btn) return;

    const storage = btn.dataset.storage;

    if (storage === 'spotify' && !isSpotifyConnected) {
      showNotification(t('notifications.spotifyNotConnected', {}, 'Spotify nicht verbunden'), { type: 'warning' });
      return;
    }

    toggleGroup.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const localSettings = document.getElementById('local-history-settings');
    const spotifySettings = document.getElementById('spotify-playlist-settings');

    if (storage === 'local') {
      localSettings?.classList.remove('hidden');
      spotifySettings?.classList.add('hidden');
    } else {
      localSettings?.classList.add('hidden');
      spotifySettings?.classList.remove('hidden');
    }

    localStorage.setItem('history-storage', storage || 'local');
  });
}

/** Setup Song Requests toggle (collapsible section) */
function setupSongRequestsToggle(): void {
  const toggle = document.getElementById('song-requests-toggle') as HTMLInputElement | null;
  const content = document.getElementById('song-requests-content');

  if (!toggle || !content) return;

  // Load saved state
  const enabled = localStorage.getItem('song-requests-enabled') !== 'false';
  toggle.checked = enabled;
  content.classList.toggle('collapsed', !enabled);

  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    content.classList.toggle('collapsed', !isEnabled);
    localStorage.setItem('song-requests-enabled', String(isEnabled));

    // Emit event for other modules
    window.dispatchEvent(new CustomEvent('song-requests-toggle', { detail: { enabled: isEnabled } }));
  });
}

/** Setup history source filter (All vs Spotify only) */
function setupHistorySourceFilter(): void {
  const filterSelect = document.getElementById('history-source-filter') as HTMLSelectElement | null;
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

/** Get current history source filter */
export function getHistorySourceFilter(): string {
  return localStorage.getItem('history-source-filter') || 'all';
}

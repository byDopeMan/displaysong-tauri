/**
 * Request History - Spotify Playlist Integration & Scope Checking
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';

// State
let playlistConfig: any = null;
let storageMode = 'local'; // 'local' or 'spotify'

/** Initialize request history module */
export async function initRequestHistory(): Promise<void> {
  loadConfig();
  setupListeners();
  updateUI();

  // Check scopes on init (silently)
  checkScopesQuietly();
}

/** Load config from localStorage */
function loadConfig(): void {
  try {
    const stored = localStorage.getItem('request-history-config');
    if (stored) {
      const config = JSON.parse(stored);
      playlistConfig = config.playlist || null;
      storageMode = config.storageMode || 'local';
    }
  } catch (e) {
    console.error('[RequestHistory] Load config error:', e);
  }
}

/** Save config to localStorage */
function saveConfig(): void {
  try {
    localStorage.setItem('request-history-config', JSON.stringify({
      playlist: playlistConfig,
      storageMode,
    }));
  } catch (e) {
    console.error('[RequestHistory] Save config error:', e);
  }
}

/** Setup event listeners */
function setupListeners(): void {
  // Storage toggle
  document.querySelectorAll('#history-storage-toggle .toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storage = (btn as HTMLElement).dataset.storage;
      if (storage) setStorageMode(storage);
    });
  });

  // Setup playlist button
  document.getElementById('btn-setup-playlist')?.addEventListener('click', openPlaylistSetup);

  // Create playlist button in modal
  document.getElementById('btn-create-playlist')?.addEventListener('click', createPlaylist);

  // Cancel playlist setup
  document.getElementById('btn-cancel-playlist')?.addEventListener('click', () => {
    document.getElementById('playlist-setup-modal')?.classList.add('hidden');
  });

  // Open playlist in Spotify
  document.getElementById('btn-open-playlist')?.addEventListener('click', openPlaylistInSpotify);

  // Delete playlist
  document.getElementById('btn-delete-playlist')?.addEventListener('click', deletePlaylist);

  // Re-auth button
  document.getElementById('btn-reauth')?.addEventListener('click', triggerReauth);

  // Close modals
  document.querySelectorAll('[data-modal="playlist-setup-modal"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.getElementById('playlist-setup-modal')?.classList.add('hidden');
    });
  });

  document.querySelectorAll('[data-modal="reauth-modal"]').forEach((el) => {
    el.addEventListener('click', () => {
      document.getElementById('reauth-modal')?.classList.add('hidden');
    });
  });
}

/** Set storage mode */
function setStorageMode(mode: string): void {
  storageMode = mode;
  saveConfig();
  updateUI();

  // If switching to Spotify and not configured, check scopes first
  if (mode === 'spotify' && !playlistConfig) {
    checkScopesAndSetup();
  }
}

/** Update UI based on current state */
function updateUI(): void {
  // Toggle buttons
  document.querySelectorAll('#history-storage-toggle .toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.storage === storageMode);
  });

  // Show/hide settings sections
  const localSettings = document.getElementById('local-history-settings');
  const spotifySettings = document.getElementById('spotify-playlist-settings');
  const setupContainer = document.getElementById('playlist-setup-container');
  const configuredContainer = document.getElementById('playlist-configured-container');

  if (localSettings) localSettings.classList.toggle('hidden', storageMode !== 'local');
  if (spotifySettings) spotifySettings.classList.toggle('hidden', storageMode !== 'spotify');

  if (playlistConfig) {
    if (setupContainer) setupContainer.classList.add('hidden');
    if (configuredContainer) configuredContainer.classList.remove('hidden');

    const nameDisplay = document.getElementById('playlist-name-display');
    if (nameDisplay) nameDisplay.textContent = playlistConfig.name;
  } else {
    if (setupContainer) setupContainer.classList.remove('hidden');
    if (configuredContainer) configuredContainer.classList.add('hidden');
  }
}

/** Check scopes quietly (no UI interruption) */
async function checkScopesQuietly(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const missingScopes = await invoke('check_spotify_scopes');
    if (missingScopes.length > 0) {
      console.log('[RequestHistory] Missing scopes:', missingScopes);
    }
  } catch (e) {
    // Silently ignore
  }
}

/** Check scopes and prompt for setup if needed */
async function checkScopesAndSetup(): Promise<boolean> {
  const invoke = getTauriInvoke();
  if (!invoke) return false;

  try {
    const missingScopes = await invoke('check_spotify_scopes');

    if (missingScopes.length > 0) {
      // Show re-auth modal
      document.getElementById('reauth-modal')?.classList.remove('hidden');
      return false;
    }

    return true;
  } catch (e) {
    console.error('[RequestHistory] Scope check error:', e);
    showNotification('Fehler beim Prüfen der Berechtigungen', { type: 'error' });
    return false;
  }
}

/** Open playlist setup modal */
async function openPlaylistSetup(): Promise<void> {
  // First check scopes
  const hasScopes = await checkScopesAndSetup();
  if (!hasScopes) return; // Re-auth modal is shown, user needs to re-auth first

  // Clear error
  const errorEl = document.getElementById('playlist-setup-error');
  if (errorEl) {
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
  }

  // Show modal
  document.getElementById('playlist-setup-modal')?.classList.remove('hidden');
}

/** Create Spotify playlist */
async function createPlaylist(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  const nameInput = document.getElementById('playlist-name') as HTMLInputElement | null;
  const descInput = document.getElementById('playlist-description') as HTMLInputElement | null;
  const publicCheck = document.getElementById('playlist-public') as HTMLInputElement | null;
  const errorEl = document.getElementById('playlist-setup-error');
  const createBtn = document.getElementById('btn-create-playlist') as HTMLButtonElement | null;

  const name = nameInput?.value?.trim() || 'DisplaySong Requests';
  const description = descInput?.value?.trim() || 'Song Requests von Twitch Chat';
  const isPublic = publicCheck?.checked || false;

  if (!name) {
    if (errorEl) {
      errorEl.textContent = 'Bitte gib einen Namen ein.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  // Disable button
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = '<div class="spinner-small"></div> Erstelle...';
  }

  try {
    const playlistId = await invoke('create_spotify_playlist', {
      name,
      description,
      public: isPublic,
    });

    // Save config
    playlistConfig = {
      id: playlistId,
      name,
      description,
      public: isPublic,
    };
    saveConfig();

    // Close modal
    document.getElementById('playlist-setup-modal')?.classList.add('hidden');

    // Update UI
    updateUI();

    showNotification(`Playlist "${name}" erstellt!`);
  } catch (e) {
    console.error('[RequestHistory] Create playlist error:', e);

    if (errorEl) {
      errorEl.textContent = String(e);
      errorEl.classList.remove('hidden');
    }
  } finally {
    // Re-enable button
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Playlist erstellen</span>
      `;
    }
  }
}

/** Open playlist in Spotify */
function openPlaylistInSpotify(): void {
  if (!playlistConfig?.id) return;

  const url = `https://open.spotify.com/playlist/${playlistConfig.id}`;
  window.__TAURI__?.shell?.open(url);
}

/** Delete playlist */
async function deletePlaylist(): Promise<void> {
  if (!playlistConfig?.id) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  if (!confirm(`Möchtest du die Playlist "${playlistConfig.name}" wirklich löschen?`)) {
    return;
  }

  try {
    await invoke('delete_spotify_playlist', { playlistId: playlistConfig.id });

    showNotification(`Playlist "${playlistConfig.name}" gelöscht`);

    // Clear config
    playlistConfig = null;
    saveConfig();
    updateUI();
  } catch (e) {
    console.error('[RequestHistory] Delete playlist error:', e);
    showNotification('Fehler beim Löschen: ' + e, { type: 'error' });
  }
}

/** Trigger re-authentication */
async function triggerReauth(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    // Close modal
    document.getElementById('reauth-modal')?.classList.add('hidden');

    showNotification('Browser öffnet sich...', { type: 'info' });

    // Get auth URL and open
    const authUrl = await invoke('get_auth_url');
    window.__TAURI__?.shell?.open(authUrl);

    // Start auth server - this waits for the callback!
    await invoke('start_auth_server');

    // If we get here, auth was successful
    showNotification('Spotify erfolgreich verbunden!', { type: 'success' });

    // Now open the playlist setup since we have the scopes
    setTimeout(() => openPlaylistSetup(), 500);
  } catch (e) {
    console.error('[RequestHistory] Re-auth error:', e);
    showNotification('Fehler: ' + e, { type: 'error' });
  }
}

/** Add song to history (called from twitch.js) */
export async function addToHistory(spotifyUri: string, trackInfo: any): Promise<void> {
  if (storageMode !== 'spotify' || !playlistConfig?.id) {
    return; // Local storage is handled by SQLite queue
  }

  const autoAdd = (document.getElementById('playlist-auto-add') as HTMLInputElement | null)?.checked ?? true;
  if (!autoAdd) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('add_to_spotify_playlist', {
      playlistId: playlistConfig.id,
      uri: spotifyUri,
    });
    console.log('[RequestHistory] Added to playlist:', spotifyUri);
  } catch (e) {
    console.error('[RequestHistory] Add to playlist error:', e);
  }
}

/** Get current storage mode */
export function getStorageMode(): string {
  return storageMode;
}

/** Get playlist config */
export function getPlaylistConfig(): any {
  return playlistConfig;
}

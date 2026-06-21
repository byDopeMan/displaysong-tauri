/**
 * Music Provider Manager
 * Handles switching between Windows Audio and Spotify API
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { t } from '../../utils/i18n';
import { state } from '../../core/state';

// Provider types
export const PROVIDER = {
  WINDOWS_AUDIO: 'windows',
  SPOTIFY: 'spotify',
} as const;

export type ProviderId = (typeof PROVIDER)[keyof typeof PROVIDER];

// Current provider state
let currentProvider: string = PROVIDER.WINDOWS_AUDIO;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastTrack: any = null;

/** Get current provider */
export function getProvider(): string {
  return currentProvider;
}

/** Set provider */
export function setProvider(provider: string): void {
  currentProvider = provider;
  localStorage.setItem('music-provider', provider);
  console.log('[Provider] Set to:', provider);
}

/** Load saved provider from localStorage */
export function loadSavedProvider(): string {
  const saved = localStorage.getItem('music-provider');
  if (saved && (Object.values(PROVIDER) as string[]).includes(saved)) {
    currentProvider = saved;
  }
  return currentProvider;
}

/** Check if Spotify is connected */
export function isSpotifyConnected(): boolean {
  return state.isAuthenticated === true;
}

/** Start polling for current track based on provider */
export async function startProviderPolling(app: any, interval = 2000): Promise<void> {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  const invoke = getTauriInvoke();
  if (!invoke) return;

  console.log('[Provider] Starting polling with provider:', currentProvider);

  const poll = async () => {
    try {
      let track = null;

      if (currentProvider === PROVIDER.WINDOWS_AUDIO) {
        track = await invoke('get_windows_media_track');
      } else if (currentProvider === PROVIDER.SPOTIFY && isSpotifyConnected()) {
        track = await invoke('get_track');
      }

      if (track) {
        // Emit track update event
        if (app && typeof app.emit === 'function') {
          app.emit('track-update', track);
        }

        // Check if track changed
        const trackChanged = !lastTrack ||
          lastTrack.track !== track.track ||
          lastTrack.artist !== track.artist;

        if (trackChanged && track.track) {
          // Save to local history
          await saveToLocalHistory(track);
          lastTrack = track;
        }
      }
    } catch (e) {
      console.error('[Provider] Polling error:', e);
    }
  };

  // Initial poll
  await poll();

  // Start interval
  pollingInterval = setInterval(poll, interval);
}

/** Stop polling */
export function stopProviderPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/** Save track to local history (SQLite) */
async function saveToLocalHistory(track: any): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('save_track_to_history', {
      track: track.track,
      artist: track.artist,
      album: track.album || '',
      albumCover: track.albumCover || track.album_cover || '',
      source: track.source || 'Unknown',
      trackId: track.trackId || track.track_id || null,
      durationMs: track.durationMs || track.duration_ms || 0,
    });
  } catch (e) {
    // Command might not exist yet, ignore silently
    console.debug('[Provider] Save to history error:', e);
  }
}

/** Initialize provider system */
export async function initProvider(): Promise<void> {
  loadSavedProvider();

  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Check if Windows Audio is available
  try {
    const available = await invoke('is_windows_media_available');
    console.log('[Provider] Windows Audio available:', available);
  } catch (e) {
    console.log('[Provider] Windows Audio check failed:', e);
  }
}

/** Switch to Windows Audio provider */
export function useWindowsAudio(): void {
  setProvider(PROVIDER.WINDOWS_AUDIO);
  showNotification(t('notifications.windowsAudioEnabled', {}, 'Windows Audio aktiviert'));
}

/** Switch to Spotify provider */
export function useSpotify(): boolean {
  if (!isSpotifyConnected()) {
    showNotification(t('notifications.connectSpotifyFirst', {}, 'Bitte zuerst mit Spotify verbinden'), { type: 'warning' });
    return false;
  }
  setProvider(PROVIDER.SPOTIFY);
  showNotification(t('notifications.spotifyApiEnabled', {}, 'Spotify API aktiviert'));
  return true;
}

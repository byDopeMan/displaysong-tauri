/**
 * Event Listeners Setup
 */

import { state, elements } from './state';
import { getTauriListen } from './tauri';
import { updateTrackDisplay } from '../ui/track-display';
import { switchTab, showView } from '../ui/navigation';
import { showNotification } from '../ui/notifications';
import { disconnectSpotify } from '../features/provider/auth';
import { refreshHistory } from '../features/history/history';

/** Setup all UI event listeners */
export function setupEventListeners(): void {
  if (elements.tabs) {
    elements.tabs.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab || ''));
    });
  }

  // NOTE: credentials-form handler is in provider/setup.ts
  // NOTE: the Designs tab (.btn-show / folder / reload) is wired in
  // features/designs/Designs.svelte.

  // Spotify disconnect lives in Connections.svelte (resolved by id post-mount).
  document.getElementById('btn-disconnect')?.addEventListener('click', disconnectSpotify);
  // The auth-view cancel button lives in features/provider/AuthView.svelte.

  setupExternalLinks();
}

/** Setup external link handlers */
async function setupExternalLinks(): Promise<void> {
  const { openExternal } = await import('../ui/navigation');

  document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openExternal(link.href);
    });
  });
}

/** Setup deep link handler for Spotify auth */
export async function setupDeepLinkHandler(): Promise<void> {
  const listen = getTauriListen();
  if (!listen) return;

  await listen('auth-success', async () => {
    state.isAuthenticated = true;
    showView('player');
    const { updateSpotifyStatus } = await import('../features/provider/auth');
    const { setSpotifyConnected } = await import('../features/provider/provider-ui');
    const { PROVIDER, loadSavedProvider } = await import('../features/provider/provider');

    updateSpotifyStatus(true);
    setSpotifyConnected(true);
    showNotification('Spotify verbunden!');

    // Show nav tabs
    document.getElementById('nav-tabs')?.classList.remove('hidden');

    const currentProvider = loadSavedProvider();
    console.log('[Auth] Spotify connected, current provider:', currentProvider);

    // Only start access system (for 420 code users)
    const { initAccessSystem } = await import('../features/access/index');
    initAccessSystem();
  });

  await listen('auth-error', () => {
    showNotification('Authentifizierung fehlgeschlagen');
    showView('setup');
  });
}

/** Setup track update listener */
export async function setupTrackListener(): Promise<void> {
  const listen = getTauriListen();
  if (!listen) return;

  await listen('track-update', (event: any) => {
    const track = event.payload;
    const isNewTrack = !state.currentTrack ||
      (track && (state.currentTrack.track !== track.track || state.currentTrack.artist !== track.artist));

    updateTrackDisplay(track);

    if (isNewTrack && track?.track) {
      refreshHistory();
    }
  });
}

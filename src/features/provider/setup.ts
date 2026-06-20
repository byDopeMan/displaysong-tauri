/**
 * Setup Flow Handler
 * Manages the initial setup experience and provider selection
 */

import { getTauriInvoke } from '../../core/tauri';
import { showView } from '../../ui/navigation';
import { showNotification } from '../../ui/notifications';
import { setProvider, PROVIDER } from './provider';
import { state } from '../../core/state';

// Secret code buffer for 420
let secretBuffer = '';
let secretTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize setup flow. The provider cards and the Spotify credentials form are
 * Svelte components now (Setup.svelte / SpotifySetup.svelte) that call the
 * exported helpers below; only the document-level 420 secret code stays here.
 */
export function initSetupFlow(): void {
  setupSecretCode();
}

/** Windows Audio quick-start (provider card). */
export async function useWindowsAudio(): Promise<void> {
  const invoke = getTauriInvoke();

  setProvider(PROVIDER.WINDOWS_AUDIO);
  localStorage.setItem('setup-complete', 'true');

  // App is ready (no Spotify auth needed)
  state.isAuthenticated = true;

  // Show player view
  showView('player');
  document.getElementById('nav-tabs')?.classList.remove('hidden');

  // Start Windows Audio polling (dynamic import to avoid circular dependency)
  const { startWindowsAudioPolling } = await import('../../app');
  startWindowsAudioPolling(invoke);

  showNotification('Windows Audio aktiviert - Musik wird automatisch erkannt!');
}

/**
 * Save Spotify credentials and kick off the OAuth flow (switches to the auth
 * view and opens the browser). Throws on failure so the caller can reset its UI.
 */
export async function connectSpotify(clientId: string, clientSecret: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Save credentials
  await invoke('save_credentials', { clientId, clientSecret });

  // Start auth server first
  await invoke('start_auth_server');

  // Get auth URL
  const authUrl = await invoke('get_auth_url');

  // Show auth view BEFORE opening browser
  showView('auth');

  // Open in default browser
  const { openExternal } = await import('../../ui/navigation');
  await openExternal(authUrl);
}

/** Back button on the Spotify setup view. */
export function goBackFromSpotifySetup(): void {
  // If already authenticated, go back to settings instead of setup
  if (state.isAuthenticated) {
    showView('settings');
  } else {
    showView('setup');
  }
}

/**
 * Setup secret 420 code (Konami-style)
 * User types "420" anywhere on setup screen to open access modal
 */
function setupSecretCode(): void {
  document.addEventListener('keydown', (e) => {
    // Only on setup view
    const setupView = document.getElementById('setup-view');
    if (!setupView || setupView.classList.contains('hidden')) {
      return;
    }

    // Ignore if typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }

    // Clear buffer after 2 seconds of no input
    if (secretTimeout) clearTimeout(secretTimeout);
    secretTimeout = setTimeout(() => {
      secretBuffer = '';
    }, 2000);

    // Add key to buffer
    secretBuffer += e.key;

    // Keep only last 3 characters
    if (secretBuffer.length > 3) {
      secretBuffer = secretBuffer.slice(-3);
    }

    // Check for 420
    if (secretBuffer === '420') {
      secretBuffer = '';
      openAccessModal();
    }
  });
}

/** Open 420 access request modal */
function openAccessModal(): void {
  const modal = document.getElementById('access-request-modal');
  if (modal) {
    modal.classList.remove('hidden');
    console.log('[Setup] 420 modal opened');
  }
}

/**
 * Check if setup is complete.
 *
 * Besides the explicit setup-complete flag (set when a provider is picked), the
 * 420/developer-credentials access flow also counts as set up: it connects
 * Spotify via approved access but never sets setup-complete. Without this, those
 * users hit the "Setup required" early-return on every start, which skips
 * initTwitch()/initQueue() — so the !sr chat listener was never registered and
 * song requests silently did nothing.
 */
export function isSetupComplete(): boolean {
  return localStorage.getItem('setup-complete') === 'true'
    || localStorage.getItem('using_developer_credentials') === 'true';
}

/** Mark setup as complete */
export function markSetupComplete(): void {
  localStorage.setItem('setup-complete', 'true');
}

/** Reset setup (for testing) */
export function resetSetup(): void {
  localStorage.removeItem('setup-complete');
  localStorage.removeItem('music-provider');
}

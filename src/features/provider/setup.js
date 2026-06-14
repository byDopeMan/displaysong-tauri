/**
 * Setup Flow Handler
 * Manages the initial setup experience and provider selection
 */

import { getTauriInvoke } from '../../core/tauri';
import { showView } from '../../ui/navigation.js';
import { showNotification } from '../../ui/notifications.js';
import { setProvider, PROVIDER } from './provider.js';
import { state } from '../../core/state.js';

// Secret code buffer for 420
let secretBuffer = '';
let secretTimeout = null;

/**
 * Initialize setup flow
 */
export function initSetupFlow() {
  setupProviderButtons();
  setupSpotifyForm();
  setupSecretCode();
  setupBackButton();
}

/**
 * Setup provider selection buttons
 */
function setupProviderButtons() {
  // Windows Audio - Quick Start
  document.getElementById('btn-use-windows-audio')?.addEventListener('click', async () => {
    const invoke = getTauriInvoke();
    
    setProvider(PROVIDER.WINDOWS_AUDIO);
    localStorage.setItem('setup-complete', 'true');
    
    // App is ready (no Spotify auth needed)
    state.isAuthenticated = true;
    
    // Show player view
    showView('player');
    document.getElementById('nav-tabs')?.classList.remove('hidden');
    
    // Start Windows Audio polling (dynamic import to avoid circular dependency)
    const { startWindowsAudioPolling } = await import('../../app.js');
    startWindowsAudioPolling(invoke);
    
    showNotification('Windows Audio aktiviert - Musik wird automatisch erkannt!');
  });

  // Spotify Setup
  document.getElementById('btn-setup-spotify')?.addEventListener('click', () => {
    showView('spotify-setup');
  });
}

/**
 * Setup Spotify credentials form
 */
function setupSpotifyForm() {
  const form = document.getElementById('credentials-form');
  
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const clientId = document.getElementById('client-id')?.value?.trim();
    const clientSecret = document.getElementById('client-secret')?.value?.trim();
    
    if (!clientId || !clientSecret) {
      showNotification('Bitte beide Felder ausfüllen', { type: 'error' });
      return;
    }
    
    const invoke = getTauriInvoke();
    if (!invoke) return;
    
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent || 'Speichern & Verbinden';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verbinde...';
    }
    
    // Reset button function (used after auth or on error)
    const resetButton = () => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
    
    try {
      // Save credentials
      await invoke('save_credentials', { clientId, clientSecret });
      
      // Start auth server first
      await invoke('start_auth_server');
      
      // Get auth URL
      const authUrl = await invoke('get_auth_url');
      
      // Show auth view BEFORE opening browser
      showView('auth');
      
      // Open in default browser
      const { openExternal } = await import('../../ui/navigation.js');
      await openExternal(authUrl);
      
      // Reset button after a short delay
      setTimeout(resetButton, 1500);
      
    } catch (e) {
      console.error('[Setup] Spotify setup error:', e);
      showNotification('Fehler: ' + e, { type: 'error' });
      resetButton();
    }
  });
}

/**
 * Setup back button
 */
function setupBackButton() {
  document.getElementById('btn-back-to-setup')?.addEventListener('click', () => {
    // If already authenticated, go back to settings instead of setup
    if (state.isAuthenticated) {
      showView('settings');
    } else {
      showView('setup');
    }
  });
}

/**
 * Setup secret 420 code (Konami-style)
 * User types "420" anywhere on setup screen to open access modal
 */
function setupSecretCode() {
  document.addEventListener('keydown', (e) => {
    // Only on setup view
    const setupView = document.getElementById('setup-view');
    if (!setupView || setupView.classList.contains('hidden')) {
      return;
    }
    
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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

/**
 * Open 420 access request modal
 */
function openAccessModal() {
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
export function isSetupComplete() {
  return localStorage.getItem('setup-complete') === 'true'
    || localStorage.getItem('using_developer_credentials') === 'true';
}

/**
 * Mark setup as complete
 */
export function markSetupComplete() {
  localStorage.setItem('setup-complete', 'true');
}

/**
 * Reset setup (for testing)
 */
export function resetSetup() {
  localStorage.removeItem('setup-complete');
  localStorage.removeItem('music-provider');
}

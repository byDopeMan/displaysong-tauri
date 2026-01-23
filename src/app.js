/**
 * DisplaySong v2.2.0 - Main Entry Point
 * Modular & Clean Architecture - Optimized Version
 */

// Core
import { state, initElements, initViews } from './core/state.js';
import { waitForTauri, getTauriInvoke } from './core/tauri.js';
import { setupEventListeners, setupDeepLinkHandler, setupTrackListener } from './core/events.js';

// UI
import { showView } from './ui/navigation.js';
import { updateTrackDisplay, startProgressInterpolation } from './ui/track-display.js';
import { setupTitlebarControls } from './ui/titlebar.js';

// Features
import { loadSettings, setupSettingsListeners, loadAutostartStatus } from './features/settings.js';
import { loadWidgetPositions, autoShowWidgets, syncActiveWidgets } from './features/widgets.js';
import { setupAccessRequestListeners, initAccessSystem } from './features/access-request.js';
import { checkExistingCredentialsWithStatus } from './features/auth.js';
import { checkForUpdates } from './features/updater.js';
import { updateHistoryTabVisibility } from './ui/navigation.js';

/**
 * Main initialization function
 */
async function init() {
  const loadingStatus = document.getElementById('loading-status');
  const loadingView = document.getElementById('loading-view');

  function setLoadingStatus(text) {
    if (loadingStatus) loadingStatus.textContent = text;
  }
  
  setLoadingStatus('Initialisiere...');
  
  // Wait for Tauri
  await waitForTauri();
  
  const invoke = getTauriInvoke();
  
  setLoadingStatus('Lade Komponenten...');
  
  // Initialize DOM references
  initViews();
  initElements();
  
  // Setup UI
  setupTitlebarControls();
  setupEventListeners();
  setupSettingsListeners();
  setupAccessRequestListeners();
  
  // Load settings & positions
  loadSettings();
  loadWidgetPositions();
  updateHistoryTabVisibility();
  
  setLoadingStatus('Prüfe Anmeldedaten...');
  
  await loadAutostartStatus();
  await setupDeepLinkHandler();
  await setupTrackListener();
  
  // Check credentials with visual status updates
  await checkExistingCredentialsWithStatus(setLoadingStatus);
  
  // Start progress interpolation (uses central timer)
  startProgressInterpolation();
  
  // Load current track if authenticated
  if (state.isAuthenticated && invoke) {
    try {
      const track = await invoke('get_track');
      updateTrackDisplay(track);
    } catch (e) {}
    
    // Auto-show widgets (Lazy Loading - only creates if needed)
    await autoShowWidgets();
  }

  // Sync widget state with backend
  await syncActiveWidgets();

  // Initialize access system (SSE/polling)
  initAccessSystem();
  
  // Hide loading view
  if (loadingView) {
    loadingView.classList.add('hidden');
  }
  
  // Check for updates after startup
  setTimeout(checkForUpdates, 2000);
  
  console.log('🚀 DisplaySong v2.2.0 (Optimized) initialized!');
  console.log('📊 Active widgets:', state.activeWidgets.size);
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

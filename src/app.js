/**
 * DisplaySong v3.0.0 - Main Entry Point
 * Universal Music Detection with optional Spotify Integration
 */

// Core
import { state, initElements, initViews } from './core/state.js';
import { waitForTauri, getTauriInvoke } from './core/tauri.js';
import { setupEventListeners, setupDeepLinkHandler, setupTrackListener } from './core/events.js';

// UI
import { showView, updateHistoryTabVisibility } from './ui/navigation.js';
import { updateTrackDisplay, updateTrackMetadata, startProgressInterpolation, getInterpolatedProgress } from './ui/track-display.js';
import { setupTitlebarControls } from './ui/titlebar.js';

// Features
import { loadSettings, setupSettingsListeners, loadAutostartStatus } from './features/settings.js';
import { loadWidgetPositions, autoShowWidgets, syncActiveWidgets } from './features/widgets.js';
import { setupAccessRequestListeners, initAccessSystem } from './features/access-request.js';
import { checkExistingCredentialsWithStatus } from './features/auth.js';
import { checkForUpdates } from './features/updater.js';
import { loadEnabledPlugins, setupPluginListeners, renderPluginList } from './features/plugins.js';
import { setupTwitchListeners, initTwitch } from './features/twitch.js';
import { initQueue } from './features/queue/queue.js';
import { initYouTubePlayer } from './features/youtube-player.js';
import { initRequestHistory } from './features/requestHistory.js';
import { initSetupFlow, isSetupComplete } from './features/setup.js';
import { initProvider, loadSavedProvider, PROVIDER, startProviderPolling } from './features/provider.js';
import { initProviderUI, setSpotifyConnected } from './features/provider-ui.js';
import { loadLanguage, updatePageTranslations, populateLanguageSelect } from './utils/i18n.js';
import { initSourcePriority, addSeenSource, getSourcePriority } from './features/source-priority.js';

/**
 * Windows Audio Polling
 */
let windowsAudioInterval = null;

/**
 * Stop Windows Audio polling
 */
export function stopWindowsAudioPolling() {
  if (windowsAudioInterval) {
    clearInterval(windowsAudioInterval);
    windowsAudioInterval = null;
    console.log('[App] Stopped Windows Audio polling');
  }
}

export async function startWindowsAudioPolling(invoke) {
  if (!invoke) return;
  
  // Clear any existing interval
  if (windowsAudioInterval) {
    clearInterval(windowsAudioInterval);
  }
  
  console.log('[App] Starting Windows Audio polling');
  
  let lastTrackKey = '';
  let lastIsPlaying = null;
  let lastSyncTime = 0;
  
  const pollTrack = async () => {
    try {
      // Pass the user's source priority so the backend can pick the right
      // session when multiple players are active (e.g. Opera over Spotify).
      const track = await invoke('get_windows_media_track', { priority: getSourcePriority() });
      if (track) {
        // Track the source for priority list
        if (track.source) {
          addSeenSource(track.source);
        }
        
        // Check if this is a new track
        const trackKey = `${track.artist}-${track.track}`;
        const isNewTrack = trackKey !== lastTrackKey && track.track && track.artist;
        const playStateChanged = lastIsPlaying !== track.isPlaying;
        const now = Date.now();
        
        if (isNewTrack) {
          lastTrackKey = trackKey;
          lastSyncTime = now;
          
          // Save to local history
          try {
            await invoke('save_track_to_history', {
              track: track.track,
              artist: track.artist,
              album: track.album || '',
              albumCover: track.albumCover || '',
              source: track.source || 'Unknown',
              trackId: track.trackId || null,
              durationMs: track.durationMs || 0
            });
            console.log('[WindowsAudio] Track saved to history:', trackKey);
            
            // Refresh history display
            const { refreshHistory } = await import('./features/history.js');
            refreshHistory();
          } catch (e) {
            console.error('[WindowsAudio] Failed to save track:', e);
          }
          
          // New track: full sync with backend progress
          updateTrackDisplay(track, true);
        } else if (playStateChanged) {
          // Play/pause state changed: sync progress from backend
          lastIsPlaying = track.isPlaying;
          lastSyncTime = now;
          updateTrackDisplay(track, true);
        } else if (state.currentTrack) {
          // Same track, same state.
          // The backend now reports an accurate live position (advanced via
          // LastUpdatedTime), so we re-sync whenever our locally interpolated
          // value has drifted from it, instead of only every 30s.
          if (!track.isPlaying) {
            // Paused: sync progress to show exact position
            updateTrackDisplay(track, true);
          } else {
            const backendMs = track.progressMs || 0;
            const drift = Math.abs(backendMs - getInterpolatedProgress());
            if (drift > 1500) {
              // Noticeable drift: correct it from the backend
              lastSyncTime = now;
              updateTrackDisplay(track, true);
            } else {
              // In sync: only update metadata, keep smooth interpolation
              updateTrackMetadata(track);
            }
          }
        } else {
          // No current track - full sync
          updateTrackDisplay(track, true);
        }
        
        lastIsPlaying = track.isPlaying;
      } else if (state.currentTrack) {
        // No track playing - clear display
        updateTrackDisplay(null);
      }
    } catch (e) {
      console.error('[WindowsAudio] Polling error:', e);
    }
  };
  
  // Initial poll
  await pollTrack();
  
  // Poll every 2 seconds
  windowsAudioInterval = setInterval(pollTrack, 2000);
}

/**
 * Check if plugins folder exists and show/hide Plugins tab
 */
async function checkPluginsTabVisibility() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  
  const pluginsTab = document.getElementById('plugins-tab');
  if (!pluginsTab) return;
  
  try {
    const exists = await invoke('check_plugins_folder_exists');
    pluginsTab.style.display = exists === true ? 'block' : 'none';
  } catch (e) {
    console.error('[Plugins] Tab visibility check error:', e);
    pluginsTab.style.display = 'none';
  }
}

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
  
  // Load language EARLY so all UI text is translated
  const savedLang = localStorage.getItem('language') || 'de';
  await loadLanguage(savedLang);
  await populateLanguageSelect();
  updatePageTranslations();
  
  // Setup UI
  setupTitlebarControls();
  setupEventListeners();
  setupSettingsListeners();
  setupAccessRequestListeners();
  setupPluginListeners();
  setupTwitchListeners();
  
  // Initialize source priority
  initSourcePriority();
  
  // Initialize setup flow (provider selection)
  initSetupFlow();
  
  // Initialize provider UI (connection status, spotify features visibility)
  initProviderUI();
  
  // Load settings & positions
  loadSettings();
  loadWidgetPositions();
  updateHistoryTabVisibility();
  
  setLoadingStatus('Prüfe Konfiguration...');
  
  await loadAutostartStatus();
  await setupDeepLinkHandler();
  await setupTrackListener();
  
  // Initialize provider system
  await initProvider();
  const savedProvider = loadSavedProvider();
  
  // Check if setup is complete
  if (!isSetupComplete()) {
    // Show setup view for new users
    if (loadingView) loadingView.classList.add('hidden');
    showView('setup');
    console.log('DisplaySong v3.0.0 - Setup required');
    return;
  }
  
  // Restore the Spotify connection whenever credentials exist — song requests,
  // queue track info and playback all need the Spotify API client, even when the
  // now-playing source is Windows Audio. The provider only controls polling, not
  // whether the Spotify client is initialized. (Previously Spotify was only
  // connected in Spotify-provider mode, so in Windows Audio mode the queue showed
  // "Lädt…" forever and song requests/playback silently failed.)
  setLoadingStatus('Verbinde mit Spotify...');
  const spotifyConnected = await checkExistingCredentialsWithStatus(setLoadingStatus);
  setSpotifyConnected(spotifyConnected);
  if (savedProvider === PROVIDER.WINDOWS_AUDIO) {
    // Windows Audio is the now-playing source and works with or without Spotify;
    // don't gate app startup on the Spotify connection.
    state.isAuthenticated = true;
  }
  
  // Start progress interpolation (uses central timer)
  startProgressInterpolation();
  
  // Load current track based on provider and start polling
  if (invoke) {
    try {
      if (savedProvider === PROVIDER.WINDOWS_AUDIO) {
        // Start Windows Audio polling
        startWindowsAudioPolling(invoke);
      } else if (state.isAuthenticated) {
        // Spotify polling is handled by the existing system
        const track = await invoke('get_track');
        if (track) updateTrackDisplay(track);
      }
    } catch (e) {
      console.error('[Init] Track load error:', e);
    }
    
    // Auto-show widgets (Lazy Loading - only creates if needed)
    await autoShowWidgets();
  }

  // Sync widget state with backend
  await syncActiveWidgets();

  // Initialize access system (SSE/polling for 420)
  initAccessSystem();
  
  // Hide loading view
  if (loadingView) {
    loadingView.classList.add('hidden');
  }
  
  // Show navigation and player
  document.getElementById('nav-tabs')?.classList.remove('hidden');
  showView('player');
  
  // Check for updates after startup
  setTimeout(checkForUpdates, 2000);
  
  // Check if plugins folder exists and show/hide Plugins tab
  await checkPluginsTabVisibility();
  
  // Load plugins
  await renderPluginList();
  await loadEnabledPlugins();
  
  // Initialize Twitch (checks for saved credentials)
  await initTwitch();
  
  // Initialize Queue
  await initQueue();
  
  // Initialize YouTube Player (for auto-play without Spotify)
  initYouTubePlayer();
  
  // Initialize Request History (Spotify Playlist integration)
  await initRequestHistory();
  
  // Load history on startup
  const { loadHistory } = await import('./features/history.js');
  await loadHistory();
  
  console.log('DisplaySong v3.0.0 initialized!');
  console.log('Provider:', savedProvider);
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

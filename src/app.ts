/**
 * DisplaySong v4.1.0 - Main Entry Point
 * Universal Music Detection with optional Spotify Integration
 */

// Core
import { state, initElements, initViews } from './core/state';
import { waitForTauri, getTauriInvoke } from './core/tauri';
import { setupEventListeners, setupDeepLinkHandler, setupTrackListener } from './core/events';

// UI
import { showView, updateHistoryTabVisibility } from './ui/navigation';
import { updateTrackDisplay, updateTrackMetadata, startProgressInterpolation, getInterpolatedProgress } from './ui/track-display';
import Titlebar from './components/Titlebar.svelte';
import Player from './features/player/Player.svelte';
import WidgetBehavior from './features/settings/WidgetBehavior.svelte';
import Appearance from './features/settings/Appearance.svelte';
import SystemSettings from './features/settings/SystemSettings.svelte';
import Designs from './features/designs/Designs.svelte';
import Setup from './features/provider/Setup.svelte';
import SpotifySetup from './features/provider/SpotifySetup.svelte';
import SourcePriorityModal from './features/provider/SourcePriorityModal.svelte';
import AccessRequestModal from './features/access/AccessRequestModal.svelte';
import Connections from './features/provider/Connections.svelte';
import TwitchSettings from './features/twitch/TwitchSettings.svelte';

// Features
import { loadSettings, setupSettingsListeners } from './features/settings';
import { loadWidgetPositions, autoShowWidgets, syncActiveWidgets } from './features/widgets';
import { setupAccessRequestListeners, initAccessSystem } from './features/access/index';
import { checkExistingCredentialsWithStatus } from './features/provider/auth';
import { checkForUpdates } from './features/updater';
import { loadEnabledPlugins, setupPluginListeners, renderPluginList } from './features/plugins/index';
import { setupTwitchListeners, initTwitch } from './features/twitch/index';
import { initQueue, isYouTubePlaying } from './features/queue/index';
import { initYouTubePlayer } from './features/queue/youtube-player';
import { initRequestHistory } from './features/history/request-history';
import { initSetupFlow, isSetupComplete } from './features/provider/setup';
import { initProvider, loadSavedProvider, PROVIDER } from './features/provider/provider';
import { initProviderUI, setSpotifyConnected } from './features/provider/provider-ui';
import { loadLanguage, updatePageTranslations, populateLanguageSelect } from './utils/i18n';
import { initSourcePriority, addSeenSource, getSourcePriority } from './features/provider/source-priority';

/**
 * Windows Audio Polling
 */
let windowsAudioInterval: ReturnType<typeof setInterval> | null = null;

/** Stop Windows Audio polling */
export function stopWindowsAudioPolling(): void {
  if (windowsAudioInterval) {
    clearInterval(windowsAudioInterval);
    windowsAudioInterval = null;
    console.log('[App] Stopped Windows Audio polling');
  }
}

export async function startWindowsAudioPolling(invoke: any): Promise<void> {
  if (!invoke) return;

  // Clear any existing interval
  if (windowsAudioInterval) {
    clearInterval(windowsAudioInterval);
  }

  console.log('[App] Starting Windows Audio polling');

  let lastTrackKey = '';
  let lastIsPlaying: boolean | null = null;
  let lastSyncTime = 0;

  const pollTrack = async () => {
    try {
      // While a YouTube-only request plays (hidden player), the queue drives the
      // now-playing display itself — don't let Windows Media overwrite it.
      if (isYouTubePlaying()) return;

      // Pass the user's source priority so the backend can pick the right session.
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
              durationMs: track.durationMs || 0,
            });
            console.log('[WindowsAudio] Track saved to history:', trackKey);

            // Refresh history display
            const { refreshHistory } = await import('./features/history/history');
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
          // Same track, same state. Re-sync only when drift is noticeable.
          if (!track.isPlaying) {
            updateTrackDisplay(track, true);
          } else {
            const backendMs = track.progressMs || 0;
            const drift = Math.abs(backendMs - getInterpolatedProgress());
            if (drift > 1500) {
              lastSyncTime = now;
              updateTrackDisplay(track, true);
            } else {
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

/** Check if plugins folder exists and show/hide Plugins tab */
async function checkPluginsTabVisibility(): Promise<void> {
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

/** Main initialization function */
async function init(): Promise<void> {
  const loadingStatus = document.getElementById('loading-status');
  const loadingView = document.getElementById('loading-view');

  function setLoadingStatus(text: string): void {
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

  // Mount the Svelte islands first so i18n (populateLanguageSelect /
  // updatePageTranslations) and the rest of init can find their elements.
  // Titlebar is mounted as the first child of .app.
  const appEl = document.querySelector('.app');
  if (appEl) new Titlebar({ target: appEl, anchor: appEl.firstElementChild ?? undefined });
  // Now-playing player.
  const playerMount = document.getElementById('player-mount');
  if (playerMount) new Player({ target: playerMount });
  // Settings sections (Widget-Verhalten, Aussehen + Über).
  const settingsWidgetsMount = document.getElementById('settings-widgets-mount');
  if (settingsWidgetsMount) new WidgetBehavior({ target: settingsWidgetsMount });
  const settingsAppearanceMount = document.getElementById('settings-appearance-mount');
  if (settingsAppearanceMount) new Appearance({ target: settingsAppearanceMount });
  const settingsSystemMount = document.getElementById('settings-system-mount');
  if (settingsSystemMount) new SystemSettings({ target: settingsSystemMount });
  // Designs tab.
  const designsMount = document.getElementById('designs-mount');
  if (designsMount) new Designs({ target: designsMount });
  // Setup flow (provider selection + Spotify credentials).
  const setupMount = document.getElementById('setup-mount');
  if (setupMount) new Setup({ target: setupMount });
  const spotifySetupMount = document.getElementById('spotify-setup-mount');
  if (spotifySetupMount) new SpotifySetup({ target: spotifySetupMount });
  const sourcePriorityMount = document.getElementById('source-priority-mount');
  if (sourcePriorityMount) new SourcePriorityModal({ target: sourcePriorityMount });
  const accessRequestMount = document.getElementById('access-request-mount');
  if (accessRequestMount) new AccessRequestModal({ target: accessRequestMount });
  const connectionsMount = document.getElementById('connections-mount');
  if (connectionsMount) new Connections({ target: connectionsMount });
  const twitchSettingsMount = document.getElementById('twitch-settings-mount');
  if (twitchSettingsMount) new TwitchSettings({ target: twitchSettingsMount });

  // Load language EARLY so all UI text is translated
  const savedLang = localStorage.getItem('language') || 'de';
  await loadLanguage(savedLang);
  await populateLanguageSelect();
  updatePageTranslations();

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

  // Autostart status is loaded by SystemSettings.svelte on mount.
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
    console.log('DisplaySong v4.1.0 - Setup required');
    return;
  }

  // Restore the Spotify connection whenever credentials exist — song requests,
  // queue track info and playback all need the Spotify API client, even when the
  // now-playing source is Windows Audio.
  setLoadingStatus('Verbinde mit Spotify...');
  const spotifyConnected = await checkExistingCredentialsWithStatus(setLoadingStatus);
  setSpotifyConnected(spotifyConnected);
  if (savedProvider === PROVIDER.WINDOWS_AUDIO) {
    // Windows Audio is the now-playing source and works with or without Spotify.
    state.isAuthenticated = true;
  }

  // Start progress interpolation (requestAnimationFrame-based, see track-display.ts)
  startProgressInterpolation();

  // Load current track based on provider and start polling
  if (invoke) {
    try {
      if (savedProvider === PROVIDER.WINDOWS_AUDIO) {
        startWindowsAudioPolling(invoke);
      } else if (state.isAuthenticated) {
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

  // Wire the history blocklist management button
  const { setupBlocklistUI } = await import('./features/history/history');
  setupBlocklistUI();

  // Initialize Request History (Spotify Playlist integration)
  await initRequestHistory();

  // Load history on startup
  const { loadHistory } = await import('./features/history/history');
  await loadHistory();

  console.log('DisplaySong v4.1.0 initialized!');
  console.log('Provider:', savedProvider);
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

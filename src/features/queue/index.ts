/**
 * Queue Feature - Song Request Queue with Track Info
 */

import { getTauriInvoke } from '../../core/tauri';
import { state } from '../../core/state';
import { prefetchYouTube } from './youtube-player';
import { queueDisplay, type QueueDisplayItem } from './store';
import Queue from './Queue.svelte';
import {
  initYouTube,
  isYouTubePlaying,
  isYouTubeUri,
  youTubeVideoId,
  startYouTubeTakeover,
  setupYouTubeControls,
  stopYouTubePlayback,
} from './youtube';

// Re-export so existing importers (app.js) keep working.
export { isYouTubePlaying } from './youtube';

// State
let queueItems: any[] = [];
const trackInfoCache = new Map<string, any>();
let queueEventListenerSetup = false;
const containerListenersSetup = new Set<string>();

// Auto-advance: play queued requests one after another (track-changed driven).
let autoPlayQueue = false;
let lastAutoPlayAt = 0;

// Grace delay before a YouTube takeover, so the current Spotify song finishes
// (the YouTube stream is prefetched, so this adds no real gap).
const YT_TAKEOVER_DELAY_MS = 1000;

/** Prime the track-info cache (used by the request flow for YouTube items). */
export function cacheTrackInfo(uri: string, info: any): void { trackInfoCache.set(uri, info); }

// Requester memory: who requested a track. Survives the song's removal from the
// queue, so "requested by X" can still be shown while it plays. Keyed by Spotify
// track id AND by normalized "artist|title" (the Windows-media source has no
// track id). Capped so it can't grow unbounded.
const requesterMemory = new Map<string, { user: string; source: string }>();

function reqNormKey(artist: unknown, title: unknown): string {
  return 'k:' + String(artist || '').toLowerCase().trim() + '|' + String(title || '').toLowerCase().trim();
}

/** Remember who requested a track (called when a request is added / loaded). */
export function registerRequester(
  { trackId, track, artist, user, source }:
  { trackId?: string | null; track?: string; artist?: string; user?: string; source?: string },
): void {
  if (!user) return;
  const entry = { user, source: source || 'chat' };
  if (trackId) requesterMemory.set('id:' + trackId, entry);
  if (track) requesterMemory.set(reqNormKey(artist, track), entry);
  while (requesterMemory.size > 300) {
    const oldest = requesterMemory.keys().next().value;
    if (oldest === undefined) break;
    requesterMemory.delete(oldest);
  }
}

/** Look up the requester for the currently playing track (by id, then title). */
export function getRequesterForTrack(track: any): { user: string; source: string } | null {
  if (!track) return null;
  if (track.trackId && requesterMemory.has('id:' + track.trackId)) {
    return requesterMemory.get('id:' + track.trackId) || null;
  }
  const k = reqNormKey(track.artist, track.track);
  return requesterMemory.has(k) ? requesterMemory.get(k) || null : null;
}

/**
 * Initialize Queue
 */
export async function initQueue(): Promise<void> {
  // Give the YouTube module the queue accessors it needs (no circular import).
  initYouTube({
    getQueueItems: () => queueItems,
    removeQueueItem: (id) => { queueItems = queueItems.filter((q) => q.id !== id); },
    isAutoPlay: () => autoPlayQueue,
    setLastAutoPlayAt: (v) => { lastAutoPlayAt = v; },
    renderQueue,
    updateQueueVisibility,
    getCachedTrackInfo: (uri) => trackInfoCache.get(uri),
  });

  setupQueueEventListener();
  setupClearButtons();
  mountQueueViews();
  setupAutoPlay();
  setupYouTubeControls();
  await loadQueue();
  renderQueue();
  updateQueueVisibility();
}

/**
 * Auto-advance setup.
 */
function setupAutoPlay(): void {
  autoPlayQueue = localStorage.getItem('queue-autoplay') === 'true';
  // The toggle lives in the queue header (player view + standalone queue view),
  // so there can be two checkboxes — keep them in sync.
  const toggles = document.querySelectorAll<HTMLInputElement>('.js-queue-autoplay');
  toggles.forEach((cb) => {
    cb.checked = autoPlayQueue;
    cb.addEventListener('change', (e) => {
      autoPlayQueue = (e.target as HTMLInputElement).checked;
      localStorage.setItem('queue-autoplay', String(autoPlayQueue));
      toggles.forEach((other) => { if (other !== e.target) other.checked = autoPlayQueue; });
      // If turned on while truly nothing is playing, start the queue right away.
      if (autoPlayQueue && !state.currentTrack) maybeAutoAdvance();
    });
  });
}

/**
 * Hand the next queued request over to Spotify's native queue shortly before the
 * current song ends.
 */
export async function maybeAutoAdvance(remainingMs = 0): Promise<void> {
  if (!autoPlayQueue || queueItems.length === 0) return;
  if (isYouTubePlaying()) return; // the YouTube player drives its own advance
  if (Date.now() - lastAutoPlayAt < 6000) return; // one hand-over per song
  const next = queueItems[0];
  if (!next) return;

  const isYt = isYouTubeUri(next.spotify_uri);
  const threshold = isYt ? 0 : 10000;
  if (remainingMs > threshold) return;
  lastAutoPlayAt = Date.now();

  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    if (isYt) {
      // Let the current Spotify song finish first (grace delay), then take over.
      setTimeout(() => { startYouTubeTakeover(next); }, YT_TAKEOVER_DELAY_MS);
    } else {
      await invoke('add_to_queue', { uri: next.spotify_uri });
      await invoke('remove_song_request', { requestId: next.id });
    }
  } catch (e) {
    console.error('[Queue] Auto-play queue error:', e);
    lastAutoPlayAt = 0; // allow a retry on the next trigger
  }
}

/** Mount the Svelte queue list into the player-tab and standalone containers. */
function mountQueueViews(): void {
  ['queue-list', 'queue-list-standalone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !containerListenersSetup.has(id)) {
      containerListenersSetup.add(id);
      el.innerHTML = '';
      new Queue({ target: el });
    }
  });
}

/**
 * Setup Tauri event listener for queue updates (only once)
 */
function setupQueueEventListener(): void {
  if (queueEventListenerSetup) return;
  if (!window.__TAURI__?.event) return;

  queueEventListenerSetup = true;

  window.__TAURI__.event.listen('queue-updated', async () => {
    await loadQueue();
    renderQueue();
    updateQueueVisibility();
  });

  // Listen for track changes: auto-remove the matching queue item, and (when
  // Auto-Play is on) advance the queue once the current song ends.
  window.__TAURI__.event.listen('track-changed', (event: any) => {
    const track = event.payload;
    if (track?.trackId) {
      checkAndRemovePlayingTrack(track.trackId);
    }
    maybeAutoAdvance();
  });
}

/**
 * Setup clear buttons (once)
 */
function setupClearButtons(): void {
  document.getElementById('btn-clear-queue')?.addEventListener('click', clearQueue);
  document.getElementById('btn-clear-queue-standalone')?.addEventListener('click', clearQueue);
}

/**
 * Check if currently playing track is in queue and remove it
 */
async function checkAndRemovePlayingTrack(trackId: string): Promise<void> {
  const uri = `spotify:track:${trackId}`;
  const item = queueItems.find((q) => q.spotify_uri === uri);

  if (item) {
    console.log('[Queue] Auto-removing playing track:', trackId);
    await removeSong(item.id);
  }
}

/**
 * Load queue from backend
 */
async function loadQueue(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    queueItems = await invoke('get_song_request_queue') || [];

    // Fetch track info for items without cached info
    for (const item of queueItems) {
      if (!trackInfoCache.has(item.spotify_uri)) {
        fetchTrackInfo(item.spotify_uri);
      }
    }
  } catch (e) {
    console.error('[Queue] Load error:', e);
    queueItems = [];
  }
}

/**
 * Fetch track info from Spotify API
 */
async function fetchTrackInfo(spotifyUri: string): Promise<any> {
  const invoke = getTauriInvoke();
  if (!invoke) return null;

  // YouTube-only items: metadata is primed when the request is added.
  if (isYouTubeUri(spotifyUri)) {
    if (!trackInfoCache.has(spotifyUri)) {
      const videoId = youTubeVideoId(spotifyUri);
      try {
        const res = await invoke('resolve_song_request', { input: `https://www.youtube.com/watch?v=${videoId}` });
        trackInfoCache.set(spotifyUri, {
          track: res?.title || 'YouTube',
          artist: res?.artist || '',
          albumCover: res?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationMs: 0,
          source: 'youtube',
        });
        renderQueue();
      } catch (e) { /* keep showing the raw item */ }
    }
    return trackInfoCache.get(spotifyUri) || null;
  }

  const trackId = spotifyUri.replace('spotify:track:', '');

  try {
    const info = await invoke('get_track_info', { trackId });
    if (info) {
      trackInfoCache.set(spotifyUri, info);
      // Remember the requester now that we know its title/artist.
      const item = queueItems.find((q) => q.spotify_uri === spotifyUri);
      if (item) {
        registerRequester({ trackId, track: info.track, artist: info.artist, user: item.user_name, source: item.source });
      }
      renderQueue();
    }
    return info;
  } catch (e) {
    return null;
  }
}

/**
 * Get track info (for external use)
 */
export async function getTrackInfo(spotifyUri: string): Promise<any> {
  if (trackInfoCache.has(spotifyUri)) {
    return trackInfoCache.get(spotifyUri);
  }
  return await fetchTrackInfo(spotifyUri);
}

/**
 * Clear entire queue
 */
async function clearQueue(): Promise<void> {
  if (!confirm('Queue wirklich leeren?')) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('clear_song_request_queue');
    queueItems = [];
    // Stop a running YouTube request and hand playback back to Spotify.
    await stopYouTubePlayback({ resume: true });
    renderQueue();
    updateQueueVisibility();
  } catch (e) {
    console.error('[Queue] Clear error:', e);
  }
}

/**
 * Play a song from queue (skip to it)
 */
export async function playSong(requestId: string | undefined, spotifyUri: string | undefined): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke || !spotifyUri) return;

  // YouTube-only item: play it via the hidden YouTube player.
  if (isYouTubeUri(spotifyUri)) {
    const item = queueItems.find((q) => q.id === requestId) || { id: requestId, spotify_uri: spotifyUri };
    await startYouTubeTakeover(item);
    return;
  }

  // Skipping to a Spotify song while a YouTube request is playing: stop YT first.
  await stopYouTubePlayback({ resume: false });

  try {
    await invoke('play_track', { uri: spotifyUri });
    await invoke('remove_song_request', { requestId });
  } catch (e) {
    console.error('[Queue] Play error:', e);
  }
}

/**
 * Remove song from queue
 */
export async function removeSong(requestId: string | undefined): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('remove_song_request', { requestId });
  } catch (e) {
    console.error('[Queue] Remove error:', e);
  }
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'gerade eben';
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

/**
 * Update queue container visibility based on queue content
 */
function updateQueueVisibility(): void {
  const playerQueue = document.getElementById('player-queue-container');
  if (!playerQueue) return;

  const settings = JSON.parse(localStorage.getItem('displaysong-settings') || '{}');
  const playerTabEnabled = settings.showPlayerTab !== false;
  const hasItems = queueItems.length > 0;

  playerQueue.classList.toggle('hidden', !(playerTabEnabled && hasItems));
}

/**
 * Render queue UI
 */
function renderQueue(): void {
  // Resolve the next YouTube song's audio stream ahead of time.
  const next = queueItems[0];
  if (next && isYouTubeUri(next.spotify_uri)) {
    const vid = youTubeVideoId(next.spotify_uri);
    if (vid) prefetchYouTube(vid);
  }

  // Counts live outside the Svelte-managed list containers.
  [document.getElementById('queue-count'), document.getElementById('queue-count-standalone')]
    .forEach((el) => { if (el) el.textContent = String(queueItems.length); });

  // Publish a plain display snapshot; the Queue.svelte instances re-render.
  const display: QueueDisplayItem[] = queueItems.map((item, index) => {
    const info = trackInfoCache.get(item.spotify_uri);
    const hasInfo = !!(info?.track && info?.artist);
    return {
      id: item.id,
      uri: item.spotify_uri,
      position: index + 1,
      hasInfo,
      track: info?.track || '',
      artist: info?.artist || '',
      coverUrl: info?.albumCover || null,
      uriShort: String(item.spotify_uri).substring(14, 30),
      isPoints: item.source === 'points',
      user: item.user_name || '',
      timeAgo: formatTimeAgo(item.timestamp),
    };
  });
  queueDisplay.set(display);
}

/**
 * Called when player tab visibility changes
 */
export function onPlayerTabVisibilityChange(): void {
  updateQueueVisibility();
}

/**
 * Called when track changes - check if it's in queue
 */
export function onTrackChange(trackId: string): void {
  if (trackId) {
    checkAndRemovePlayingTrack(trackId);
  }
}

export { queueItems, loadQueue, renderQueue, trackInfoCache };

/**
 * Queue Feature - Song Request Queue with Track Info
 */

import { getTauriInvoke } from '../../core/tauri';
import { state } from '../../core/state';
import { escapeAttr } from '../../utils/format';
import { prefetchYouTube } from './youtube-player';
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

// SVG Icons
const ICONS: Record<string, string> = {
  music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  chat: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  inbox: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
};

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
  setupQueueDelegation();
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

/**
 * Attach delegated click handlers to the queue containers.
 */
function setupQueueDelegation(): void {
  ['queue-list', 'queue-list-standalone'].forEach((id) => {
    const container = document.getElementById(id);
    if (!container || containerListenersSetup.has(id)) return;
    containerListenersSetup.add(id);

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.queue-item') as HTMLElement | null;
      if (!item) return;
      const { id: requestId, uri } = item.dataset;

      if (target.closest('.queue-btn-play')) {
        playSong(requestId, uri);
      } else if (target.closest('.queue-btn-remove')) {
        removeSong(requestId);
      }
    });
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
async function playSong(requestId: string | undefined, spotifyUri: string | undefined): Promise<void> {
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
async function removeSong(requestId: string | undefined): Promise<void> {
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

  const containers = [
    document.getElementById('queue-list'),
    document.getElementById('queue-list-standalone'),
  ];

  const counts = [
    document.getElementById('queue-count'),
    document.getElementById('queue-count-standalone'),
  ];

  // Update counts
  counts.forEach((el) => {
    if (el) el.textContent = String(queueItems.length);
  });

  // Render each container
  containers.forEach((container) => {
    if (!container) return;

    if (queueItems.length === 0) {
      container.innerHTML = `
        <div class="queue-empty">
          <div class="queue-empty-icon">${ICONS.inbox}</div>
          <p class="queue-empty-text">Queue ist leer</p>
          <p class="queue-empty-hint">Nutze !sr im Chat um Songs hinzuzufügen</p>
        </div>
      `;
      return;
    }

    container.innerHTML = queueItems.map((item, index) => {
      const trackInfo = trackInfoCache.get(item.spotify_uri);
      const hasInfo = trackInfo?.track && trackInfo?.artist;
      const sourceIcon = item.source === 'points' ? ICONS.star : ICONS.chat;
      const coverUrl = trackInfo?.albumCover || null;

      return `
        <div class="queue-item" data-id="${escapeAttr(item.id)}" data-uri="${escapeAttr(item.spotify_uri)}">
          <div class="queue-item-position">${index + 1}</div>

          <div class="queue-item-cover">
            ${coverUrl
              ? `<img src="${escapeAttr(coverUrl)}" alt="Cover">`
              : `<div class="queue-item-cover-placeholder">${ICONS.music}</div>`
            }
          </div>

          <div class="queue-item-info">
            <div class="queue-item-track">
              ${hasInfo
                ? `<span class="queue-item-title">${escapeAttr(trackInfo.track)}</span>`
                : `<span class="queue-item-title loading">Lädt...</span>`
              }
            </div>
            <div class="queue-item-meta">
              ${hasInfo
                ? `<span class="queue-item-artist">${escapeAttr(trackInfo.artist)}</span>`
                : `<span class="queue-item-uri">${escapeAttr(item.spotify_uri.substring(14, 30))}...</span>`
              }
            </div>
            <div class="queue-item-requester">
              <span class="queue-item-source" title="${item.source === 'points' ? 'Channel Points' : 'Chat Command'}">${sourceIcon}</span>
              <span class="queue-item-user">${escapeAttr(item.user_name)}</span>
              <span class="queue-item-time">${formatTimeAgo(item.timestamp)}</span>
            </div>
          </div>

          <div class="queue-item-actions">
            <button class="queue-btn queue-btn-play" title="Jetzt abspielen">
              ${ICONS.play}
            </button>
            <button class="queue-btn queue-btn-remove" title="Entfernen">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');
  });
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

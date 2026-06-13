/**
 * Queue Feature - Song Request Queue with Track Info
 */

import { getTauriInvoke } from '../../core/tauri.js';
import { state } from '../../core/state.js';
import { showNotification } from '../../ui/notifications.js';
import { playYouTube, stopYouTube, pauseYouTube, resumeYouTube, getYouTubeProgressMs } from '../youtube-player.js';

// State
let queueItems = [];
let trackInfoCache = new Map();
let queueEventListenerSetup = false;
let containerListenersSetup = new Set();

// Auto-advance: play queued requests one after another (track-changed driven).
let autoPlayQueue = false;
let lastAutoPlayAt = 0;

// While a YouTube-only request plays (hidden IFrame), Spotify is paused and the
// frontend drives the now-playing display. The YouTube player's onEnded handles
// advancing, so the normal near-end auto-advance must stand down meanwhile.
let youtubePlaying = false;
let currentYtTrack = null; // the now-playing track object for the active YouTube song
let ytProgressTimer = null; // periodic now-playing emit while a YouTube song plays

/** Periodically push the YouTube now-playing (with live position) to player +
 *  widgets. The Windows poll is suppressed during YouTube, so without this the
 *  timeline wouldn't move and widgets opened mid-song would show nothing. */
function startYtProgressTimer() {
  stopYtProgressTimer();
  ytProgressTimer = setInterval(() => {
    if (!currentYtTrack) return;
    currentYtTrack = { ...currentYtTrack, progressMs: getYouTubeProgressMs() };
    emitNowPlaying(currentYtTrack);
  }, 1000);
}

function stopYtProgressTimer() {
  if (ytProgressTimer) { clearInterval(ytProgressTimer); ytProgressTimer = null; }
}

const YT_URI_PREFIX = 'youtube:';
function isYouTubeUri(uri) { return typeof uri === 'string' && uri.startsWith(YT_URI_PREFIX); }
function youTubeVideoId(uri) { return isYouTubeUri(uri) ? uri.slice(YT_URI_PREFIX.length) : null; }

/** Whether a YouTube-only request is currently playing. */
export function isYouTubePlaying() { return youtubePlaying; }

/** Prime the track-info cache (used by the request flow for YouTube items). */
export function cacheTrackInfo(uri, info) { trackInfoCache.set(uri, info); }

/** Push a now-playing track to the player tab + widgets (same event the backend
 *  poll uses). Used to show a YouTube request like a normal Spotify song. */
function emitNowPlaying(track) {
  try { window.__TAURI__?.event?.emit('track-update', track); } catch (e) { /* widgets optional */ }
}

// Requester memory: who requested a track. Survives the song's removal from the
// queue, so "requested by X" can still be shown while it plays. Keyed by Spotify
// track id AND by normalized "artist|title" (the Windows-media source has no
// track id). Capped so it can't grow unbounded.
const requesterMemory = new Map();

function reqNormKey(artist, title) {
  return 'k:' + String(artist || '').toLowerCase().trim() + '|' + String(title || '').toLowerCase().trim();
}

/** Remember who requested a track (called when a request is added / loaded). */
export function registerRequester({ trackId, track, artist, user, source }) {
  if (!user) return;
  const entry = { user, source: source || 'chat' };
  if (trackId) requesterMemory.set('id:' + trackId, entry);
  if (track) requesterMemory.set(reqNormKey(artist, track), entry);
  while (requesterMemory.size > 300) {
    requesterMemory.delete(requesterMemory.keys().next().value);
  }
}

/** Look up the requester for the currently playing track (by id, then title). */
export function getRequesterForTrack(track) {
  if (!track) return null;
  if (track.trackId && requesterMemory.has('id:' + track.trackId)) {
    return requesterMemory.get('id:' + track.trackId);
  }
  const k = reqNormKey(track.artist, track.track);
  return requesterMemory.has(k) ? requesterMemory.get(k) : null;
}

// SVG Icons
const ICONS = {
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
export async function initQueue() {
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
 * Auto-advance setup: load the persisted toggle, wire the checkbox and start
 * the monitor. When enabled, the next queued request is played automatically
 * once nothing is playing — so the request queue is what gets played, not the
 * next song from the streamer's own playlist.
 */
function setupAutoPlay() {
  autoPlayQueue = localStorage.getItem('queue-autoplay') === 'true';
  // The toggle lives in the queue header (player view + standalone queue view),
  // so there can be two checkboxes — keep them in sync.
  const toggles = document.querySelectorAll('.js-queue-autoplay');
  toggles.forEach((cb) => {
    cb.checked = autoPlayQueue;
    cb.addEventListener('change', (e) => {
      autoPlayQueue = e.target.checked;
      localStorage.setItem('queue-autoplay', String(autoPlayQueue));
      toggles.forEach((other) => { if (other !== e.target) other.checked = autoPlayQueue; });
      // If turned on while truly nothing is playing, start the queue right away.
      if (autoPlayQueue && !state.currentTrack) maybeAutoAdvance();
    });
  });
}

/**
 * Hand the next queued request over to Spotify's native queue shortly before the
 * current song ends (triggered from the player's progress loop and as a fallback
 * on track-changed). Using add_to_queue (instead of play_track) is important:
 * it plays the request right after the current song AND keeps the streamer's
 * playlist context, so music keeps going once the request queue is empty —
 * play_track would replace the context with a single track and leave silence.
 * A cooldown prevents queueing the same item repeatedly.
 */
export async function maybeAutoAdvance() {
  if (!autoPlayQueue || queueItems.length === 0) return;
  if (youtubePlaying) return; // the YouTube player drives its own advance
  if (Date.now() - lastAutoPlayAt < 6000) return; // one hand-over per song
  const next = queueItems[0];
  if (!next) return;
  lastAutoPlayAt = Date.now();

  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    if (isYouTubeUri(next.spotify_uri)) {
      await startYouTubeTakeover(next);
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
 * Play a YouTube-only request: pause Spotify, play the audio via the hidden
 * IFrame, and show it like a normal now-playing song (cover + timeline) on the
 * player tab and widgets. When it ends, hand back to Spotify (or chain to the
 * next YouTube request).
 */
async function startYouTubeTakeover(item) {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  const videoId = youTubeVideoId(item.spotify_uri);
  if (!videoId) return;

  youtubePlaying = true;
  console.log('[Queue] YouTube takeover start:', item.spotify_uri, 'videoId', videoId);
  const info = trackInfoCache.get(item.spotify_uri) || {};
  const cover = info.albumCover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Play at the same volume Spotify uses (so YouTube isn't a blast). Falls back
  // to a safe low default when Spotify has no active device.
  let volume = 50;
  try {
    const v = await invoke('spotify_get_volume');
    if (typeof v === 'number' && v >= 0) volume = v;
    console.log('[Queue] Spotify volume for YouTube:', v);
  } catch (e) { console.warn('[Queue] spotify_get_volume failed:', e); }

  try {
    await invoke('set_external_playback', { active: true });
    try { await invoke('spotify_pause'); console.log('[Queue] Spotify paused for YouTube'); } catch (e) { console.warn('[Queue] spotify_pause failed:', e); }
    await invoke('remove_song_request', { requestId: item.id });
    queueItems = queueItems.filter((q) => q.id !== item.id);
    renderQueue();
    updateQueueVisibility();
  } catch (e) {
    console.error('[Queue] YouTube takeover setup error:', e);
  }

  currentYtTrack = {
    track: info.track || 'YouTube',
    artist: info.artist || '',
    album: '',
    albumCover: cover,
    isPlaying: true,
    durationMs: info.durationMs || 0,
    progressMs: 0,
    source: 'youtube',
    trackId: null,
    color: null,
  };
  showYouTubeControls(true);
  // Show the song immediately (duration filled in once playback reports it).
  emitNowPlaying(currentYtTrack);
  startYtProgressTimer();

  // Save the played YouTube song to the history (the Windows-Media poll is
  // suppressed during YouTube playback, so it won't record it otherwise).
  try {
    await invoke('save_track_to_history', {
      track: currentYtTrack.track,
      artist: currentYtTrack.artist,
      album: '',
      albumCover: cover,
      source: 'YouTube',
      trackId: videoId,
      durationMs: 0,
    });
    import('../history.js').then(({ refreshHistory }) => refreshHistory()).catch(() => {});
  } catch (e) { /* history is best-effort */ }

  const requester = item.user_name || '';
  playYouTube(videoId, {
    volume,
    onPlaying: (durationMs, title) => {
      if (!currentYtTrack) return;
      const patch = {
        durationMs: durationMs || currentYtTrack.durationMs || 0,
        isPlaying: true,
      };
      // Fill in a real title from yt-dlp if we only had a placeholder.
      if (title && (!currentYtTrack.track || currentYtTrack.track === 'YouTube')) {
        patch.track = title;
      }
      currentYtTrack = { ...currentYtTrack, ...patch };
      emitNowPlaying(currentYtTrack);
    },
    onError: (code) => {
      notifyYouTubeError(requester, code);
      onYouTubeEnded();
    },
    onEnded: () => { onYouTubeEnded(); },
  });
}

/** Tell the streamer (and the requester in chat) a YouTube request couldn't play. */
function notifyYouTubeError(user, code) {
  const embedBlocked = code === 101 || code === 150;
  const reason = embedBlocked
    ? 'erlaubt kein Einbetten und kann nicht abgespielt werden'
    : 'konnte nicht abgespielt werden';
  try {
    showNotification(
      embedBlocked
        ? 'YouTube-Video erlaubt kein Einbetten – übersprungen.'
        : 'YouTube-Video konnte nicht abgespielt werden – übersprungen.',
      { type: 'warning' }
    );
  } catch (e) {}
  const invoke = getTauriInvoke();
  if (invoke && user) {
    invoke('twitch_send_chat', { message: `@${user} Dein YouTube-Video ${reason} und wurde übersprungen.` })
      .catch(() => {});
  }
}

/** Show/hide the YouTube playback controls (pause/skip) in the player tab. */
function showYouTubeControls(show) {
  const el = document.getElementById('youtube-controls');
  if (el) el.classList.toggle('hidden', !show);
  if (show) syncYouTubePauseButton();
}

/** Wire the YouTube pause/skip buttons (shown only while a YouTube song plays). */
function setupYouTubeControls() {
  document.getElementById('btn-youtube-pause')?.addEventListener('click', () => toggleYouTubePause());
  document.getElementById('btn-youtube-skip')?.addEventListener('click', () => skipYouTube());
}

/** Pause/resume the currently playing YouTube request. */
export function toggleYouTubePause() {
  if (!youtubePlaying || !currentYtTrack) return;
  if (currentYtTrack.isPlaying) {
    pauseYouTube();
    currentYtTrack = { ...currentYtTrack, isPlaying: false };
  } else {
    resumeYouTube();
    currentYtTrack = { ...currentYtTrack, isPlaying: true };
  }
  emitNowPlaying(currentYtTrack);
  syncYouTubePauseButton();
}

/** Skip the currently playing YouTube request (advance the queue). */
export function skipYouTube() {
  if (!youtubePlaying) return;
  stopYouTube();
  onYouTubeEnded();
}

/**
 * Play a Spotify request immediately WITHOUT destroying the streamer's playlist
 * context: add it to Spotify's queue, then skip to it. After the request (and any
 * further queued requests) the streamer's playlist continues natively. Falls back
 * to play_track only if there's no active device/context to queue into.
 */
async function playSpotifyRequestNow(invoke, uri) {
  let queued = false;
  try {
    await invoke('add_to_queue', { uri });
    queued = true;
  } catch (e) {
    // No active device to queue into -> play it directly.
    try { await invoke('play_track', { uri }); } catch (e2) { console.error('[Queue] play_track failed:', e2); }
    return;
  }
  if (queued) {
    // Give Spotify a moment to register the queued item before skipping to it.
    await new Promise((r) => setTimeout(r, 600));
    try { await invoke('spotify_next'); } catch (e) { console.warn('[Queue] spotify_next failed:', e); }
    try { await invoke('spotify_resume'); } catch (e) {}
  }
}

/** Called when a YouTube request finishes (or errors): chain or hand back. */
async function onYouTubeEnded() {
  const invoke = getTauriInvoke();
  const next = queueItems[0];
  console.log('[Queue] YouTube ended. next:', next ? next.spotify_uri : '(none)', 'autoPlay', autoPlayQueue);

  // Auto-play on with another request queued: play it back-to-back.
  if (autoPlayQueue && next) {
    if (isYouTubeUri(next.spotify_uri)) {
      await startYouTubeTakeover(next); // keep Spotify paused, play the next YT
      return;
    }
    // Next is a Spotify request: play it now but KEEP the streamer's context so
    // the playlist resumes after the request queue empties. We add it to Spotify's
    // queue and skip to it, instead of play_track (which would replace the context
    // and leave silence once the queue runs out).
    youtubePlaying = false;
    currentYtTrack = null;
    showYouTubeControls(false);
    stopYtProgressTimer();
    lastAutoPlayAt = Date.now(); // don't let maybeAutoAdvance double-fire
    if (invoke) {
      try { await invoke('set_external_playback', { active: false }); } catch (e) {}
      await playSpotifyRequestNow(invoke, next.spotify_uri);
      try { await invoke('remove_song_request', { requestId: next.id }); } catch (e) {}
    }
    return;
  }

  // Nothing queued: hand playback back to the streamer's Spotify.
  youtubePlaying = false;
  currentYtTrack = null;
  showYouTubeControls(false);
  stopYtProgressTimer();
  lastAutoPlayAt = 0;
  if (invoke) {
    try { await invoke('set_external_playback', { active: false }); } catch (e) {}
    try { await invoke('spotify_resume'); } catch (e) {}
  }
}

/** Update the pause button's icon/label to match the current play state. */
function syncYouTubePauseButton() {
  const btn = document.getElementById('btn-youtube-pause');
  if (!btn) return;
  const playing = currentYtTrack ? currentYtTrack.isPlaying : true;
  btn.dataset.state = playing ? 'playing' : 'paused';
  btn.title = playing ? 'Pausieren' : 'Fortsetzen';
}

/**
 * Attach delegated click handlers to the queue containers.
 *
 * The list HTML is re-rendered on every update, so we listen on the (stable)
 * container instead of the buttons. This replaces the old inline `onclick`
 * handlers, which were brittle (broke on quotes in URIs and depended on
 * globals) and are the reason the queue buttons did nothing when clicked.
 */
function setupQueueDelegation() {
  ['queue-list', 'queue-list-standalone'].forEach((id) => {
    const container = document.getElementById(id);
    if (!container || containerListenersSetup.has(id)) return;
    containerListenersSetup.add(id);

    container.addEventListener('click', (e) => {
      const item = e.target.closest('.queue-item');
      if (!item) return;
      const { id: requestId, uri } = item.dataset;

      if (e.target.closest('.queue-btn-play')) {
        playSong(requestId, uri);
      } else if (e.target.closest('.queue-btn-remove')) {
        removeSong(requestId);
      }
    });
  });
}

/**
 * Setup Tauri event listener for queue updates (only once)
 */
function setupQueueEventListener() {
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
  window.__TAURI__.event.listen('track-changed', (event) => {
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
function setupClearButtons() {
  document.getElementById('btn-clear-queue')?.addEventListener('click', clearQueue);
  document.getElementById('btn-clear-queue-standalone')?.addEventListener('click', clearQueue);
}

/**
 * Check if currently playing track is in queue and remove it
 */
async function checkAndRemovePlayingTrack(trackId) {
  const uri = `spotify:track:${trackId}`;
  const item = queueItems.find(q => q.spotify_uri === uri);
  
  if (item) {
    console.log('[Queue] Auto-removing playing track:', trackId);
    await removeSong(item.id);
  }
}

/**
 * Load queue from backend
 */
async function loadQueue() {
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
async function fetchTrackInfo(spotifyUri) {
  const invoke = getTauriInvoke();
  if (!invoke) return null;

  // YouTube-only items: metadata is primed when the request is added. If it's
  // missing (e.g. queue restored from DB after a restart), re-resolve it from
  // the video id instead of asking Spotify.
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
      // Remember the requester for this track now that we know its title/artist,
      // so "requested by X" works even after it leaves the queue.
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
export async function getTrackInfo(spotifyUri) {
  if (trackInfoCache.has(spotifyUri)) {
    return trackInfoCache.get(spotifyUri);
  }
  return await fetchTrackInfo(spotifyUri);
}

/**
 * Clear entire queue
 */
async function clearQueue() {
  if (!confirm('Queue wirklich leeren?')) return;
  
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('clear_song_request_queue');
    queueItems = [];
    // Stop a running YouTube request and hand playback back to Spotify.
    if (youtubePlaying) {
      youtubePlaying = false;
      currentYtTrack = null;
      showYouTubeControls(false);
      stopYtProgressTimer();
      stopYouTube();
      try { await invoke('set_external_playback', { active: false }); } catch (e) {}
      try { await invoke('spotify_resume'); } catch (e) {}
    }
    renderQueue();
    updateQueueVisibility();
  } catch (e) {
    console.error('[Queue] Clear error:', e);
  }
}

/**
 * Play a song from queue (skip to it)
 */
async function playSong(requestId, spotifyUri) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // YouTube-only item: play it via the hidden YouTube player (pauses Spotify,
  // shows it like a now-playing song) instead of Spotify's play_track.
  if (isYouTubeUri(spotifyUri)) {
    const item = queueItems.find((q) => q.id === requestId) || { id: requestId, spotify_uri: spotifyUri };
    await startYouTubeTakeover(item);
    return;
  }

  // Skipping to a Spotify song while a YouTube request is playing: stop the
  // YouTube audio first so they don't overlap.
  if (youtubePlaying) {
    youtubePlaying = false;
    currentYtTrack = null;
    showYouTubeControls(false);
    stopYtProgressTimer();
    stopYouTube();
    try { await invoke('set_external_playback', { active: false }); } catch (e) {}
  }

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
async function removeSong(requestId) {
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
function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return 'gerade eben';
  if (seconds < 3600) return `vor ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)}h`;
  return `vor ${Math.floor(seconds / 86400)}d`;
}

/**
 * Update queue container visibility based on queue content
 */
function updateQueueVisibility() {
  // The standalone Queue tab itself is shown/hidden by updateTabVisibility()
  // (tied to the Player tab setting). Here we only toggle the mini-queue that
  // lives inside the Player tab: visible when the Player tab is on and the
  // queue has items.
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
function renderQueue() {
  const containers = [
    document.getElementById('queue-list'),
    document.getElementById('queue-list-standalone')
  ];

  const counts = [
    document.getElementById('queue-count'),
    document.getElementById('queue-count-standalone')
  ];

  // Update counts
  counts.forEach(el => {
    if (el) el.textContent = queueItems.length;
  });

  // Render each container
  containers.forEach(container => {
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
        <div class="queue-item" data-id="${item.id}" data-uri="${item.spotify_uri}">
          <div class="queue-item-position">${index + 1}</div>
          
          <div class="queue-item-cover">
            ${coverUrl 
              ? `<img src="${coverUrl}" alt="Cover">` 
              : `<div class="queue-item-cover-placeholder">${ICONS.music}</div>`
            }
          </div>
          
          <div class="queue-item-info">
            <div class="queue-item-track">
              ${hasInfo 
                ? `<span class="queue-item-title">${trackInfo.track}</span>` 
                : `<span class="queue-item-title loading">Lädt...</span>`
              }
            </div>
            <div class="queue-item-meta">
              ${hasInfo 
                ? `<span class="queue-item-artist">${trackInfo.artist}</span>` 
                : `<span class="queue-item-uri">${item.spotify_uri.substring(14, 30)}...</span>`
              }
            </div>
            <div class="queue-item-requester">
              <span class="queue-item-source" title="${item.source === 'points' ? 'Channel Points' : 'Chat Command'}">${sourceIcon}</span>
              <span class="queue-item-user">${item.user_name}</span>
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
export function onPlayerTabVisibilityChange() {
  updateQueueVisibility();
}

/**
 * Called when track changes - check if it's in queue
 */
export function onTrackChange(trackId) {
  if (trackId) {
    checkAndRemovePlayingTrack(trackId);
  }
}

export { queueItems, loadQueue, renderQueue, trackInfoCache };

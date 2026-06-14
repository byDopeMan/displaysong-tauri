/**
 * YouTube-request playback orchestration (split out of queue.js).
 *
 * Plays YouTube-only requests via the hidden <audio> player (yt-dlp stream),
 * shows them like a normal now-playing song, syncs volume to Spotify, drives the
 * timeline, and chains/hands back to Spotify when a song ends. Queue access is
 * injected via initYouTube() so there is no circular import with queue.js.
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import {
  playYouTube,
  stopYouTube,
  pauseYouTube,
  resumeYouTube,
  getYouTubeProgressMs,
  setYouTubeVolume,
} from './youtube-player';

// Injected queue accessors (set by initYouTube).
let Q = {
  getQueueItems: () => [],
  removeQueueItem: () => {},
  isAutoPlay: () => false,
  setLastAutoPlayAt: () => {},
  renderQueue: () => {},
  updateQueueVisibility: () => {},
  getCachedTrackInfo: () => undefined,
};

/** Wire up the queue accessors this module needs. Call once from initQueue. */
export function initYouTube(deps) {
  Q = { ...Q, ...deps };
}

// ── State ───────────────────────────────────────────────────────────────────
let youtubePlaying = false;
let currentYtTrack = null; // now-playing track object for the active YouTube song
let ytProgressTimer = null; // periodic now-playing emit while a YouTube song plays
let ytVolumeTimer = null;   // live-syncs YouTube volume to the Spotify device volume

// YouTube streams aren't loudness-normalized like Spotify, so at the same percent
// they sound louder. YouTube plays at this fraction of the Spotify volume; the
// user can lower it further via the dropdown in the YouTube controls.
let ytVolumeFactor = parseFloat(localStorage.getItem('yt-volume-factor'));
if (!(ytVolumeFactor > 0 && ytVolumeFactor <= 1)) ytVolumeFactor = 0.7;
let lastSpotifyVolume = 50; // last known Spotify device volume (0-100)

const YT_URI_PREFIX = 'youtube:';
export function isYouTubeUri(uri) { return typeof uri === 'string' && uri.startsWith(YT_URI_PREFIX); }
export function youTubeVideoId(uri) { return isYouTubeUri(uri) ? uri.slice(YT_URI_PREFIX.length) : null; }

/** Whether a YouTube-only request is currently playing. */
export function isYouTubePlaying() { return youtubePlaying; }

/** Push a now-playing track to the player tab + widgets (via the backend, so it
 *  reliably reaches all windows incl. widgets). */
function emitNowPlaying(track) {
  const invoke = getTauriInvoke();
  if (invoke) {
    invoke('push_track_update', { track }).catch(() => {});
  } else {
    try { window.__TAURI__?.event?.emit('track-update', track); } catch (e) {}
  }
}

// ── Volume ───────────────────────────────────────────────────────────────────
function applyYtVolume() {
  setYouTubeVolume(Math.round(lastSpotifyVolume * ytVolumeFactor));
}

/** Set the user's YouTube volume factor (0-1), persist it and apply immediately. */
export function setYtVolumeFactor(factor) {
  ytVolumeFactor = Math.max(0.05, Math.min(1, factor));
  try { localStorage.setItem('yt-volume-factor', String(ytVolumeFactor)); } catch (e) {}
  console.log('[Queue] YT volume factor ->', ytVolumeFactor, 'playing:', youtubePlaying);
  if (youtubePlaying) applyYtVolume();
}

function startYtVolumeSync() {
  stopYtVolumeSync();
  ytVolumeTimer = setInterval(async () => {
    if (!youtubePlaying) return;
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      const v = await invoke('spotify_get_volume');
      if (typeof v === 'number' && v >= 0) { lastSpotifyVolume = v; applyYtVolume(); }
    } catch (e) { /* keep last volume */ }
  }, 2500);
}

function stopYtVolumeSync() {
  if (ytVolumeTimer) { clearInterval(ytVolumeTimer); ytVolumeTimer = null; }
}

// ── Now-playing timeline ─────────────────────────────────────────────────────
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
  stopYtVolumeSync(); // the two always run together during YouTube playback
}

// ── Controls (floating pause/skip + volume dropdown) ─────────────────────────
function showYouTubeControls(show) {
  const el = document.getElementById('youtube-controls');
  if (el) el.classList.toggle('hidden', !show);
  if (show) syncYouTubePauseButton();
}

/** Wire the YouTube pause/skip buttons + volume dropdown. Call once from initQueue. */
export function setupYouTubeControls() {
  document.getElementById('btn-youtube-pause')?.addEventListener('click', () => toggleYouTubePause());
  document.getElementById('btn-youtube-skip')?.addEventListener('click', () => skipYouTube());

  const vol = document.getElementById('yt-volume-select');
  if (vol) {
    vol.value = String(Math.round(ytVolumeFactor * 10) / 10);
    vol.addEventListener('change', () => setYtVolumeFactor(parseFloat(vol.value)));
  }
}

function syncYouTubePauseButton() {
  const btn = document.getElementById('btn-youtube-pause');
  if (!btn) return;
  const playing = currentYtTrack ? currentYtTrack.isPlaying : true;
  btn.dataset.state = playing ? 'playing' : 'paused';
  btn.title = playing ? 'Pausieren' : 'Fortsetzen';
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

/**
 * Play a Spotify request immediately WITHOUT destroying the streamer's playlist
 * context: add it to Spotify's queue, then skip to it. Falls back to play_track
 * only if there's no active device/context to queue into.
 */
async function playSpotifyRequestNow(invoke, uri) {
  let queued = false;
  try {
    await invoke('add_to_queue', { uri });
    queued = true;
  } catch (e) {
    try { await invoke('play_track', { uri }); } catch (e2) { console.error('[Queue] play_track failed:', e2); }
    return;
  }
  if (queued) {
    await new Promise((r) => setTimeout(r, 600));
    try { await invoke('spotify_next'); } catch (e) { console.warn('[Queue] spotify_next failed:', e); }
    try { await invoke('spotify_resume'); } catch (e) {}
  }
}

/**
 * Play a YouTube-only request: pause Spotify, play the audio via the hidden
 * player, show it like a normal now-playing song. When it ends, hand back to
 * Spotify (or chain to the next request).
 */
export async function startYouTubeTakeover(item) {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  const videoId = youTubeVideoId(item.spotify_uri);
  if (!videoId) return;

  // Was a YouTube song already playing? (chaining YouTube -> YouTube means
  // Spotify is already paused, so we must not pause it again.)
  const alreadyExternal = youtubePlaying;
  youtubePlaying = true;
  console.log('[Queue] YouTube takeover start:', item.spotify_uri, 'videoId', videoId);
  const info = Q.getCachedTrackInfo(item.spotify_uri) || {};
  const cover = info.albumCover || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Play at the same volume Spotify uses. Falls back to a safe low default.
  let volume = Math.round(lastSpotifyVolume * ytVolumeFactor);
  try {
    const v = await invoke('spotify_get_volume');
    if (typeof v === 'number' && v >= 0) { lastSpotifyVolume = v; volume = Math.round(v * ytVolumeFactor); }
    console.log('[Queue] Spotify volume for YouTube:', v, '-> yt', volume);
  } catch (e) { console.warn('[Queue] spotify_get_volume failed:', e); }

  try {
    // Only pause Spotify on the FIRST takeover; when chaining YouTube -> YouTube
    // it's already paused (pausing again returns a harmless 403).
    if (!alreadyExternal) {
      await invoke('set_external_playback', { active: true });
      try { await invoke('spotify_pause'); console.log('[Queue] Spotify paused for YouTube'); } catch (e) { console.warn('[Queue] spotify_pause failed:', e); }
    }
    await invoke('remove_song_request', { requestId: item.id });
    Q.removeQueueItem(item.id);
    Q.renderQueue();
    Q.updateQueueVisibility();
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
  emitNowPlaying(currentYtTrack);
  startYtProgressTimer();
  startYtVolumeSync();

  // Tint the widgets from the thumbnail (mqdefault is 16:9, no letterbox black).
  invoke('get_dominant_color', { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` })
    .then((c) => {
      if (c && currentYtTrack && youtubePlaying) {
        currentYtTrack = { ...currentYtTrack, color: c };
        emitNowPlaying(currentYtTrack);
      }
    })
    .catch(() => {});

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
    import('../history/history.js').then(({ refreshHistory }) => refreshHistory()).catch(() => {});
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

/** Called when a YouTube request finishes (or errors): chain or hand back. */
async function onYouTubeEnded() {
  const invoke = getTauriInvoke();
  const next = Q.getQueueItems()[0];
  console.log('[Queue] YouTube ended. next:', next ? next.spotify_uri : '(none)', 'autoPlay', Q.isAutoPlay());

  // Auto-play on with another request queued: play it back-to-back.
  if (Q.isAutoPlay() && next) {
    if (isYouTubeUri(next.spotify_uri)) {
      await startYouTubeTakeover(next); // keep Spotify paused, play the next YT
      return;
    }
    // Next is a Spotify request: play it now but KEEP the streamer's context so
    // the playlist resumes after the request queue empties.
    youtubePlaying = false;
    currentYtTrack = null;
    showYouTubeControls(false);
    stopYtProgressTimer();
    Q.setLastAutoPlayAt(Date.now()); // don't let maybeAutoAdvance double-fire
    if (invoke) {
      try { await invoke('set_external_playback', { active: false }); } catch (e) {}
      await playSpotifyRequestNow(invoke, next.spotify_uri);
      try { await invoke('remove_song_request', { requestId: next.id }); } catch (e) {}
    }
    return;
  }

  // Nothing queued: hand playback back to the streamer's Spotify. YouTube took
  // over near the end of the paused track, so skip its leftover and play the next
  // playlist track fresh, then ensure it's actually playing.
  youtubePlaying = false;
  currentYtTrack = null;
  showYouTubeControls(false);
  stopYtProgressTimer();
  Q.setLastAutoPlayAt(0);
  if (invoke) {
    try { await invoke('set_external_playback', { active: false }); } catch (e) {}
    try { await invoke('spotify_next'); } catch (e) {}
    try { await invoke('spotify_resume'); } catch (e) {}
  }
}

/**
 * Stop a running YouTube request (skip-to-Spotify / clear-queue). With
 * resume=true, hand playback back to the streamer's Spotify.
 */
export async function stopYouTubePlayback({ resume = false } = {}) {
  if (!youtubePlaying) return;
  youtubePlaying = false;
  currentYtTrack = null;
  showYouTubeControls(false);
  stopYtProgressTimer();
  stopYouTube();
  const invoke = getTauriInvoke();
  if (invoke) {
    try { await invoke('set_external_playback', { active: false }); } catch (e) {}
    if (resume) { try { await invoke('spotify_resume'); } catch (e) {} }
  }
}

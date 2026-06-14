/**
 * Track Display & Progress
 * Simple requestAnimationFrame-based progress interpolation
 */

import { state, elements } from '../core/state';
import { formatTime } from '../utils/format';
import { t } from '../utils/i18n';
import { getRequesterForTrack, maybeAutoAdvance } from '../features/queue/index';

/**
 * Show "requested by X" in the player when the current track was a song request,
 * and broadcast it to the widgets (which show it if their design enables it).
 */
function updateRequester(track: any): void {
  const el = document.getElementById('track-requester');
  const nameEl = document.getElementById('track-requester-name');
  const req = track ? getRequesterForTrack(track) : null;
  const user = req?.user || null;
  if (el) {
    if (user) {
      if (nameEl) nameEl.textContent = user;
      el.classList.remove('hidden');
    } else {
      if (nameEl) nameEl.textContent = '';
      el.classList.add('hidden');
    }
  }
  try { window.__TAURI__?.event?.emit('requester-update', { user }); } catch (e) { /* widgets optional */ }
}

/**
 * Set an element's text and, if it overflows, scroll it left-to-right (marquee).
 */
export function setMarqueeText(el: HTMLElement | null, text: string): void {
  if (!el) return;
  el.classList.add('mq-host');
  let span = el.querySelector('.mq-text') as HTMLElement | null;
  if (!span) {
    el.textContent = '';
    span = document.createElement('span');
    span.className = 'mq-text';
    el.appendChild(span);
  }
  if (span.dataset.text === text) return; // unchanged
  span.dataset.text = text;
  span.textContent = text;
  span.classList.remove('mq-run');
  span.style.removeProperty('--mq-shift');
  requestAnimationFrame(() => {
    if (!span) return;
    const overflow = span.scrollWidth - el.clientWidth;
    if (overflow > 4) {
      span.style.setProperty('--mq-shift', `-${overflow + 12}px`);
      span.classList.add('mq-run');
    }
  });
}

let animationFrameId: number | null = null;
let lastFrameTime = 0;

// Separate progress tracking - NOT in state.currentTrack
let interpolatedProgress = 0;
let isInterpolating = false;

/**
 * Update track display with current track info.
 * @param syncProgress If true, sync progress from backend. If false, keep interpolated.
 */
export function updateTrackDisplay(track: any, syncProgress = true): void {
  if (!elements.trackTitle) return;

  if (!track || !track.track) {
    setMarqueeText(elements.trackTitle, t('player.nothingPlaying', {}, 'Nichts läuft'));
    if (elements.trackArtist) elements.trackArtist.textContent = '—';
    if (elements.trackAlbum) elements.trackAlbum.textContent = '';
    if (elements.statusBadge) {
      elements.statusBadge.classList.add('paused');
      const statusText = elements.statusBadge.querySelector('.status-text');
      if (statusText) statusText.textContent = t('player.paused', {}, 'Pausiert');
    }
    // Reset progress bar
    if (elements.progressBar) elements.progressBar.style.width = '0%';
    if (elements.progressCurrent) elements.progressCurrent.textContent = '0:00';
    if (elements.progressTotal) elements.progressTotal.textContent = '0:00';
    interpolatedProgress = 0;
    state.currentTrack = null;
    updateRequester(null);
    return;
  }

  const isNewTrack = !state.currentTrack ||
    state.currentTrack.track !== track.track ||
    state.currentTrack.artist !== track.artist;

  setMarqueeText(elements.trackTitle, track.track);
  if (elements.trackArtist) elements.trackArtist.textContent = track.artist;
  if (elements.trackAlbum) elements.trackAlbum.textContent = track.album;

  // Global Background immer updaten
  if (track.albumCover) {
    const globalBg = document.getElementById('global-cover-bg');
    if (globalBg && globalBg.style.backgroundImage !== `url("${track.albumCover}")`) {
      globalBg.style.backgroundImage = `url('${track.albumCover}')`;
    }
  }

  if (isNewTrack && track.albumCover && elements.coverImage) {
    elements.coverImage.style.opacity = '0';
    if (elements.coverBg) elements.coverBg.style.opacity = '0';

    setTimeout(() => {
      if (!elements.coverImage) return;
      elements.coverImage.style.backgroundImage = `url('${track.albumCover}')`;
      if (elements.coverBg) elements.coverBg.style.backgroundImage = `url('${track.albumCover}')`;
      elements.coverImage.style.opacity = '1';
      if (elements.coverBg) elements.coverBg.style.opacity = '0.35';
    }, 150);
  }

  if (elements.statusBadge) {
    elements.statusBadge.classList.toggle('paused', !track.isPlaying);
    const statusText = elements.statusBadge.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = track.isPlaying
        ? t('player.nowPlaying', {}, 'Läuft jetzt')
        : t('player.paused', {}, 'Pausiert');
    }
  }

  // Handle progress
  if (isNewTrack || syncProgress) {
    interpolatedProgress = track.progressMs || 0;
    lastFrameTime = performance.now();
  }

  // Update progress bar with interpolated value
  if (track.durationMs > 0 && elements.progressBar) {
    const progress = (interpolatedProgress / track.durationMs) * 100;
    elements.progressBar.style.width = `${Math.min(100, progress)}%`;
    if (elements.progressCurrent) elements.progressCurrent.textContent = formatTime(interpolatedProgress);
    if (elements.progressTotal) elements.progressTotal.textContent = formatTime(track.durationMs);
  }

  // Store track metadata (but NOT progressMs - we track that separately)
  state.currentTrack = {
    track: track.track,
    artist: track.artist,
    album: track.album,
    albumCover: track.albumCover,
    isPlaying: track.isPlaying,
    durationMs: track.durationMs,
    source: track.source,
    trackId: track.trackId,
  };

  updateRequester(track);

  isInterpolating = track.isPlaying;
}

/** Update only metadata without touching progress */
export function updateTrackMetadata(track: any): void {
  if (!track || !state.currentTrack) return;

  state.currentTrack.isPlaying = track.isPlaying;
  state.currentTrack.durationMs = track.durationMs;
  isInterpolating = track.isPlaying;

  // Update status badge
  if (elements.statusBadge) {
    elements.statusBadge.classList.toggle('paused', !track.isPlaying);
    const statusText = elements.statusBadge.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = track.isPlaying
        ? t('player.nowPlaying', {}, 'Läuft jetzt')
        : t('player.paused', {}, 'Pausiert');
    }
  }
}

/** Get current interpolated progress */
export function getInterpolatedProgress(): number {
  return interpolatedProgress;
}

/** Start progress bar interpolation using requestAnimationFrame */
export function startProgressInterpolation(): void {
  if (animationFrameId !== null) return;

  lastFrameTime = performance.now();

  function animate(currentTime: number): void {
    const delta = currentTime - lastFrameTime;
    lastFrameTime = currentTime;

    // Only interpolate if playing
    if (isInterpolating && state.currentTrack?.durationMs > 0) {
      interpolatedProgress += delta;

      // Clamp to duration
      if (interpolatedProgress > state.currentTrack.durationMs) {
        interpolatedProgress = state.currentTrack.durationMs;
      }

      // Update UI
      if (elements.progressBar) {
        const progress = (interpolatedProgress / state.currentTrack.durationMs) * 100;
        elements.progressBar.style.width = `${Math.min(100, progress)}%`;
      }
      if (elements.progressCurrent) {
        elements.progressCurrent.textContent = formatTime(interpolatedProgress);
      }

      // Auto-Play: hand over to the queue near the end of the song.
      const remainingMs = state.currentTrack.durationMs - interpolatedProgress;
      if (remainingMs <= 12000) {
        maybeAutoAdvance(remainingMs);
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  animationFrameId = requestAnimationFrame(animate);
}

/** Stop progress interpolation */
export function stopProgressInterpolation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/** Copy current song info to clipboard */
export async function copySongInfo(): Promise<void> {
  const { showNotification } = await import('./notifications');

  if (!state.currentTrack || !state.currentTrack.track) {
    showNotification(t('player.nothingPlaying', {}, 'Kein Song zum Kopieren'));
    return;
  }

  const text = `${state.currentTrack.artist} - ${state.currentTrack.track}`;
  navigator.clipboard.writeText(text).then(() => {
    showNotification(t('notifications.copied', {}, 'Kopiert!'));
    const btn = document.getElementById('btn-copy-song');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  }).catch((err) => {
    console.error('Copy failed:', err);
    showNotification(t('common.error', {}, 'Fehler'));
  });
}

/**
 * Track Display & Progress
 *
 * Owns the now-playing polling/interpolation logic and publishes snapshots to
 * the player stores (features/player/store). Player.svelte renders reactively;
 * this module no longer touches the player DOM directly. Progress is advanced
 * with a requestAnimationFrame loop between backend syncs.
 */

import { state } from '../core/state';
import { t } from '../utils/i18n';
import { getRequesterForTrack, maybeAutoAdvance } from '../features/queue/index';
import { playerSnapshot, playerProgressMs, resetPlayer } from '../features/player/store';

/**
 * Resolve the "requested by X" name for a track (when it was a song request),
 * and broadcast it to the widgets (which show it if their design enables it).
 */
function resolveRequester(track: any): string | null {
  const req = track ? getRequesterForTrack(track) : null;
  const user = req?.user || null;
  try { window.__TAURI__?.event?.emit('requester-update', { user }); } catch (e) { /* widgets optional */ }
  return user;
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
  if (!track || !track.track) {
    resetPlayer();
    interpolatedProgress = 0;
    isInterpolating = false;
    state.currentTrack = null;
    resolveRequester(null);
    return;
  }

  const isNewTrack = !state.currentTrack ||
    state.currentTrack.track !== track.track ||
    state.currentTrack.artist !== track.artist;

  // Global background (app-wide element, outside the player view).
  if (track.albumCover) {
    const globalBg = document.getElementById('global-cover-bg');
    if (globalBg && globalBg.style.backgroundImage !== `url("${track.albumCover}")`) {
      globalBg.style.backgroundImage = `url('${track.albumCover}')`;
    }
  }

  // Handle progress
  if (isNewTrack || syncProgress) {
    interpolatedProgress = track.progressMs || 0;
    lastFrameTime = performance.now();
    playerProgressMs.set(interpolatedProgress);
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

  playerSnapshot.set({
    hasTrack: true,
    title: track.track,
    artist: track.artist || '',
    album: track.album || '',
    albumCover: track.albumCover || '',
    isPlaying: !!track.isPlaying,
    requester: resolveRequester(track),
    durationMs: track.durationMs || 0,
  });

  isInterpolating = track.isPlaying;
}

/** Update only metadata without touching progress */
export function updateTrackMetadata(track: any): void {
  if (!track || !state.currentTrack) return;

  state.currentTrack.isPlaying = track.isPlaying;
  state.currentTrack.durationMs = track.durationMs;
  isInterpolating = track.isPlaying;

  playerSnapshot.update((s) => ({
    ...s,
    isPlaying: !!track.isPlaying,
    durationMs: track.durationMs || s.durationMs,
  }));
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

      playerProgressMs.set(interpolatedProgress);

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

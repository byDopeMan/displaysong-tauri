/**
 * Track Display & Progress
 * Nutzt zentralen Timer für Progress-Interpolation
 */

import { state, elements } from '../core/state.js';
import { timer } from '../core/timer.js';
import { formatTime } from '../utils/format.js';

let progressTimerId = null;

/**
 * Update track display with current track info
 */
export function updateTrackDisplay(track) {
  if (!elements.trackTitle) return;
  
  if (!track || !track.track) {
    elements.trackTitle.textContent = 'Nichts läuft';
    elements.trackArtist.textContent = '—';
    if (elements.trackAlbum) elements.trackAlbum.textContent = '';
    if (elements.statusBadge) {
      elements.statusBadge.classList.add('paused');
      const statusText = elements.statusBadge.querySelector('.status-text');
      if (statusText) statusText.textContent = 'Pausiert';
    }
    return;
  }

  const isNewTrack = !state.currentTrack || state.currentTrack.track !== track.track;

  elements.trackTitle.textContent = track.track;
  elements.trackArtist.textContent = track.artist;
  if (elements.trackAlbum) elements.trackAlbum.textContent = track.album;

  if (isNewTrack && track.albumCover && elements.coverImage) {
    elements.coverImage.style.opacity = '0';
    if (elements.coverBg) elements.coverBg.style.opacity = '0';
    
    setTimeout(() => {
      elements.coverImage.style.backgroundImage = `url('${track.albumCover}')`;
      if (elements.coverBg) elements.coverBg.style.backgroundImage = `url('${track.albumCover}')`;
      elements.coverImage.style.opacity = '1';
      if (elements.coverBg) elements.coverBg.style.opacity = '0.35';
    }, 150);
  }

  if (elements.statusBadge) {
    elements.statusBadge.classList.toggle('paused', !track.isPlaying);
    const statusText = elements.statusBadge.querySelector('.status-text');
    if (statusText) statusText.textContent = track.isPlaying ? 'Läuft jetzt' : 'Pausiert';
  }

  if (track.durationMs > 0 && elements.progressBar) {
    const progress = (track.progressMs / track.durationMs) * 100;
    elements.progressBar.style.width = `${progress}%`;
    if (elements.progressCurrent) elements.progressCurrent.textContent = formatTime(track.progressMs);
    if (elements.progressTotal) elements.progressTotal.textContent = formatTime(track.durationMs);
  }

  state.currentTrack = track;
}

/**
 * Start progress bar interpolation using central timer
 */
export function startProgressInterpolation() {
  // Wenn bereits registriert, nicht nochmal
  if (progressTimerId !== null) return;
  
  progressTimerId = timer.subscribe((now, delta) => {
    if (state.currentTrack?.isPlaying && state.currentTrack.durationMs > 0) {
      // Delta-basiert für genauere Interpolation
      state.currentTrack.progressMs = Math.min(
        state.currentTrack.progressMs + delta, 
        state.currentTrack.durationMs
      );
      
      if (elements.progressBar) {
        const progress = (state.currentTrack.progressMs / state.currentTrack.durationMs) * 100;
        elements.progressBar.style.width = `${progress}%`;
        if (elements.progressCurrent) {
          elements.progressCurrent.textContent = formatTime(state.currentTrack.progressMs);
        }
      }
    }
  }, 'progress-interpolation');
}

/**
 * Stop progress interpolation
 */
export function stopProgressInterpolation() {
  if (progressTimerId !== null) {
    timer.unsubscribe(progressTimerId);
    progressTimerId = null;
  }
}

/**
 * Copy current song info to clipboard
 */
export async function copySongInfo() {
  const { showNotification } = await import('../ui/notifications.js');
  
  if (!state.currentTrack || !state.currentTrack.track) {
    showNotification('Kein Song zum Kopieren');
    return;
  }
  
  const text = `${state.currentTrack.artist} - ${state.currentTrack.track}`;
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Kopiert: ' + text);
    const btn = document.getElementById('btn-copy-song');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  }).catch(err => {
    console.error('Copy failed:', err);
    showNotification('Kopieren fehlgeschlagen');
  });
}

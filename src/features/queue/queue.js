/**
 * Queue Feature - Song Request Queue with Track Info
 */

import { getTauriInvoke } from '../../core/tauri.js';

// State
let queueItems = [];
let trackInfoCache = new Map();
let queueEventListenerSetup = false;
let containerListenersSetup = new Set();

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
  await loadQueue();
  renderQueue();
  updateQueueVisibility();
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
  
  // Listen for track changes to auto-remove from queue
  window.__TAURI__.event.listen('track-changed', (event) => {
    const track = event.payload;
    if (track?.trackId) {
      checkAndRemovePlayingTrack(track.trackId);
    }
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

  const trackId = spotifyUri.replace('spotify:track:', '');
  
  try {
    const info = await invoke('get_track_info', { trackId });
    if (info) {
      trackInfoCache.set(spotifyUri, info);
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
  const playerQueue = document.getElementById('player-queue-container');
  const queueTab = document.getElementById('queue-tab');
  
  const settings = JSON.parse(localStorage.getItem('displaysong-settings') || '{}');
  const playerTabEnabled = settings.showPlayerTab !== false;
  const hasItems = queueItems.length > 0;
  
  if (playerTabEnabled) {
    if (playerQueue) {
      if (hasItems) {
        playerQueue.classList.remove('hidden');
      } else {
        playerQueue.classList.add('hidden');
      }
    }
    if (queueTab) queueTab.style.display = 'none';
  } else {
    if (playerQueue) playerQueue.classList.add('hidden');
    if (queueTab) queueTab.style.display = hasItems ? '' : 'none';
  }
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
            <button class="queue-btn queue-btn-play" title="Jetzt abspielen" onclick="window.__queuePlay__('${item.id}', '${item.spotify_uri}')">
              ${ICONS.play}
            </button>
            <button class="queue-btn queue-btn-remove" title="Entfernen" onclick="window.__queueRemove__('${item.id}')">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');
  });
}

// Global handlers for queue buttons (inline onclick)
window.__queuePlay__ = playSong;
window.__queueRemove__ = removeSong;

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

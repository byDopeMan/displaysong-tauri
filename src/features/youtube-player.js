/**
 * YouTube Player for Song Requests (without Spotify connection)
 * Uses YouTube IFrame API for auto-play functionality
 */

import { getTauriInvoke } from '../core/tauri.js';
import { state } from '../core/state.js';

let ytPlayer = null;
let isPlayerReady = false;
let currentRequest = null;
let autoPlayEnabled = false;

// Queue of songs to play
let playQueue = [];

let apiLoaded = false;

/**
 * Initialize YouTube Player API (lazy - only when needed)
 */
export function initYouTubePlayer() {
  // Setup skip button
  const skipBtn = document.getElementById('btn-skip-youtube');
  if (skipBtn) {
    skipBtn.addEventListener('click', skipCurrentSong);
  }
  
  // YouTube API callback (will be called when API loads)
  window.onYouTubeIframeAPIReady = () => {
    console.log('[YouTube] API ready');
    createPlayer();
  };
}

/**
 * Load YouTube API (called only when first song request comes in)
 */
function loadYouTubeAPI() {
  if (apiLoaded || window.YT) return;
  
  console.log('[YouTube] Loading API...');
  apiLoaded = true;
  
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

/**
 * Create YouTube player instance
 */
function createPlayer() {
  const container = document.getElementById('youtube-player');
  if (!container) return;
  
  ytPlayer = new YT.Player('youtube-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      fs: 0
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
}

/**
 * Player ready callback
 */
function onPlayerReady(event) {
  console.log('[YouTube] Player ready');
  isPlayerReady = true;
  
  // If there are queued songs, play the first one
  if (playQueue.length > 0) {
    playNextFromQueue();
  }
}

/**
 * Player state change callback
 */
function onPlayerStateChange(event) {
  // YT.PlayerState.ENDED = 0
  if (event.data === 0) {
    console.log('[YouTube] Song ended');
    playNextFromQueue();
  }
}

/**
 * Player error callback
 */
function onPlayerError(event) {
  console.error('[YouTube] Player error:', event.data);
  // Try next song on error
  playNextFromQueue();
}

/**
 * Add a song request to the YouTube play queue
 */
export async function addToYouTubeQueue(request) {
  console.log('[YouTube] Adding to queue:', request);
  
  // Load YouTube API on first use
  loadYouTubeAPI();
  
  // Get YouTube link from Songlink API
  const invoke = getTauriInvoke();
  if (!invoke) return false;
  
  try {
    let youtubeUrl = null;
    
    // If we have a Spotify track ID, convert to YouTube
    if (request.trackId) {
      const links = await invoke('get_all_streaming_links', { query: request.trackId });
      youtubeUrl = links?.youtube;
    }
    
    if (!youtubeUrl) {
      console.log('[YouTube] No YouTube link found for:', request.track);
      return false;
    }
    
    // Extract video ID from YouTube URL
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      console.error('[YouTube] Could not extract video ID from:', youtubeUrl);
      return false;
    }
    
    // Add to queue
    playQueue.push({
      videoId,
      title: `${request.artist} - ${request.track}`,
      requester: request.requester || 'Unknown',
      request
    });
    
    console.log('[YouTube] Added to queue, total:', playQueue.length);
    
    // If player is ready and nothing is playing, start playback
    if (isPlayerReady && !currentRequest) {
      playNextFromQueue();
    }
    
    return true;
  } catch (e) {
    console.error('[YouTube] Failed to add to queue:', e);
    return false;
  }
}

/**
 * Play next song from queue
 */
function playNextFromQueue() {
  if (playQueue.length === 0) {
    console.log('[YouTube] Queue empty, hiding player');
    hidePlayer();
    currentRequest = null;
    return;
  }
  
  const next = playQueue.shift();
  currentRequest = next;
  
  console.log('[YouTube] Playing:', next.title);
  
  // Update UI
  showPlayer();
  updatePlayerInfo(next.title, next.requester);
  
  // Play video
  if (ytPlayer && isPlayerReady) {
    ytPlayer.loadVideoById(next.videoId);
  }
}

/**
 * Skip current song
 */
export function skipCurrentSong() {
  console.log('[YouTube] Skipping current song');
  if (ytPlayer && isPlayerReady) {
    ytPlayer.stopVideo();
  }
  playNextFromQueue();
}

/**
 * Show YouTube player container
 */
function showPlayer() {
  const container = document.getElementById('youtube-player-container');
  if (container) {
    container.classList.remove('hidden');
  }
}

/**
 * Hide YouTube player container
 */
function hidePlayer() {
  const container = document.getElementById('youtube-player-container');
  if (container) {
    container.classList.add('hidden');
  }
}

/**
 * Update player info display
 */
function updatePlayerInfo(title, requester) {
  const titleEl = document.getElementById('youtube-player-title');
  const requesterEl = document.getElementById('youtube-player-requester');
  
  if (titleEl) titleEl.textContent = title;
  if (requesterEl) requesterEl.textContent = `Requested by ${requester}`;
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;
  
  // youtube.com/watch?v=ID
  let match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  
  // youtu.be/ID
  match = url.match(/youtu\.be\/([^?&]+)/);
  if (match) return match[1];
  
  // youtube.com/embed/ID
  match = url.match(/embed\/([^?&]+)/);
  if (match) return match[1];
  
  return null;
}

/**
 * Check if YouTube auto-play should be used
 * (when Spotify is not connected)
 */
export function shouldUseYouTubeAutoPlay() {
  return autoPlayEnabled && !state.isSpotifyConnected;
}

/**
 * Enable/disable YouTube auto-play
 */
export function setYouTubeAutoPlay(enabled) {
  autoPlayEnabled = enabled;
  console.log('[YouTube] Auto-play:', enabled ? 'enabled' : 'disabled');
}

/**
 * Get current queue length
 */
export function getQueueLength() {
  return playQueue.length;
}

/**
 * Clear the YouTube queue
 */
export function clearQueue() {
  playQueue = [];
  if (ytPlayer && isPlayerReady) {
    ytPlayer.stopVideo();
  }
  hidePlayer();
  currentRequest = null;
}

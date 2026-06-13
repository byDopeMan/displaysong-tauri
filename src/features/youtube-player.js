/**
 * Hidden YouTube audio player for YouTube-only song requests.
 *
 * Plays a YouTube video's AUDIO off-screen (no video UI). The song is presented
 * like any other now-playing track (cover + timeline) by the queue/track-display
 * code, which drives the player tab and the OBS widgets. This module only owns
 * the IFrame lifecycle and reports playing/ended back via callbacks.
 */

let ytPlayer = null;
let isPlayerReady = false;
let apiLoaded = false;
let pendingVideoId = null;
let callbacks = {};
let announcedPlayingFor = null; // videoId we already reported onPlaying for
let currentVolume = 50; // 0-100; kept low by default so YouTube is never a blast

function applyVolume() {
  // Persisted on the player across loadVideoById calls.
  safeCall(() => ytPlayer?.setVolume?.(Math.max(0, Math.min(100, currentVolume))));
}

/**
 * Wire the global YouTube IFrame API ready callback. Safe to call once at startup;
 * the API script itself is only injected on first playback (loadYouTubeAPI).
 */
export function initYouTubePlayer() {
  window.onYouTubeIframeAPIReady = () => {
    createPlayer();
  };
}

function loadYouTubeAPI() {
  if (apiLoaded || window.YT) {
    // API already present but player not built yet (e.g. re-entry) -> build it.
    if (window.YT && window.YT.Player && !ytPlayer) createPlayer();
    return;
  }
  apiLoaded = true;
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const first = document.getElementsByTagName('script')[0];
  first.parentNode.insertBefore(tag, first);
}

function createPlayer() {
  const mount = document.getElementById('youtube-player');
  if (!mount || ytPlayer) return;

  ytPlayer = new YT.Player('youtube-player', {
    height: '180',
    width: '320',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      fs: 0,
    },
    events: {
      onReady: () => {
        isPlayerReady = true;
        applyVolume(); // set the (low) volume before the first video can play
        if (pendingVideoId) {
          const v = pendingVideoId;
          pendingVideoId = null;
          loadVideo(v);
        }
      },
      onStateChange: onStateChange,
      onError: onError,
    },
  });
}

function onStateChange(event) {
  // 1 = PLAYING, 0 = ENDED
  if (event.data === 1) {
    applyVolume(); // enforce the configured volume (never the default 100)
    const id = currentVideoId();
    if (id && announcedPlayingFor !== id) {
      announcedPlayingFor = id;
      const durationMs = Math.round((safeCall(() => ytPlayer.getDuration()) || 0) * 1000);
      callbacks.onPlaying?.(durationMs);
    }
  } else if (event.data === 0) {
    callbacks.onEnded?.();
  }
}

function onError() {
  // Unplayable/embedding-disabled video: treat like "ended" so the queue advances.
  console.warn('[YouTube] Player error, advancing.');
  callbacks.onEnded?.();
}

function currentVideoId() {
  return safeCall(() => {
    const data = ytPlayer.getVideoData?.();
    return data?.video_id || null;
  }) || null;
}

function safeCall(fn) {
  try { return fn(); } catch (e) { return null; }
}

function loadVideo(videoId) {
  announcedPlayingFor = null;
  if (ytPlayer && isPlayerReady) {
    ytPlayer.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

/**
 * Start playing a YouTube video's audio.
 * @param {string} videoId
 * @param {{onPlaying?:(durationMs:number)=>void, onEnded?:()=>void, volume?:number}} cb
 */
export function playYouTube(videoId, cb) {
  callbacks = cb || {};
  if (typeof cb?.volume === 'number') currentVolume = cb.volume;
  loadYouTubeAPI();
  applyVolume();
  loadVideo(videoId);
}

/** Stop playback (used on skip / clear). Does not fire onEnded. */
export function stopYouTube() {
  callbacks = {};
  announcedPlayingFor = null;
  safeCall(() => ytPlayer?.stopVideo?.());
}

/** Pause the current YouTube audio. */
export function pauseYouTube() {
  safeCall(() => ytPlayer?.pauseVideo?.());
}

/** Resume the current YouTube audio. */
export function resumeYouTube() {
  safeCall(() => ytPlayer?.playVideo?.());
}

/** Whether the YouTube player is currently paused (state 2). */
export function isYouTubePaused() {
  return safeCall(() => ytPlayer?.getPlayerState?.()) === 2;
}

/** Set the YouTube playback volume (0-100). Persists across videos. */
export function setYouTubeVolume(volume) {
  currentVolume = Math.max(0, Math.min(100, Math.round(volume)));
  applyVolume();
}

/** Current playback position in ms (for progress sync). */
export function getYouTubeProgressMs() {
  return Math.round((safeCall(() => ytPlayer?.getCurrentTime?.()) || 0) * 1000);
}

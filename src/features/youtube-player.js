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
 * @param {{onPlaying?:(durationMs:number)=>void, onEnded?:()=>void}} cb
 */
export function playYouTube(videoId, cb) {
  callbacks = cb || {};
  loadYouTubeAPI();
  loadVideo(videoId);
}

/** Stop playback (used on skip / clear). Does not fire onEnded. */
export function stopYouTube() {
  callbacks = {};
  announcedPlayingFor = null;
  safeCall(() => ytPlayer?.stopVideo?.());
}

/** Current playback position in ms (for progress sync). */
export function getYouTubeProgressMs() {
  return Math.round((safeCall(() => ytPlayer?.getCurrentTime?.()) || 0) * 1000);
}

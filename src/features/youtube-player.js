/**
 * Hidden YouTube audio player for YouTube-only song requests.
 *
 * The YouTube IFrame is hosted by a tiny local server (http://127.0.0.1:8890)
 * rather than directly in the Tauri webview, because YouTube rejects embeds from
 * the webview's custom-protocol origin (error 150 for nearly every video). We
 * load that page in a hidden iframe and control it via postMessage; it reports
 * player events back the same way. Audio only — the song is shown like a normal
 * now-playing track by the queue/track-display code.
 */

const YT_ORIGIN = 'http://127.0.0.1:8890';

let frame = null;
let frameReady = false;
let pendingPlay = null;
let callbacks = {};
let currentVolume = 50; // 0-100; kept low by default so YouTube is never a blast
let lastState = -1;     // last YouTube player state (2 = paused)

/** Wire the message listener once at startup. The iframe is created on first play. */
export function initYouTubePlayer() {
  window.addEventListener('message', onMessage);
}

function ensureFrame() {
  if (frame) return;
  const mount = document.getElementById('youtube-player');
  if (!mount) return;
  frame = document.createElement('iframe');
  frame.id = 'yt-frame';
  frame.allow = 'autoplay; encrypted-media';
  frame.setAttribute('style', 'width:100%;height:100%;border:none;');
  frame.src = `${YT_ORIGIN}/`;
  mount.appendChild(frame);
}

function post(msg) {
  try {
    frame?.contentWindow?.postMessage({ target: 'yt', ...msg }, YT_ORIGIN);
  } catch (e) { /* frame not ready */ }
}

function onMessage(ev) {
  const d = ev.data || {};
  if (d.source !== 'yt') return;
  switch (d.type) {
    case 'ready':
      frameReady = true;
      console.log('[YouTube] player ready');
      if (pendingPlay) {
        const p = pendingPlay;
        pendingPlay = null;
        doPlay(p.videoId, p.volume);
      }
      break;
    case 'state':
      lastState = d.state;
      console.log('[YouTube] state change:', d.state); // -1 unstarted,0 ended,1 playing,2 paused,3 buffering,5 cued
      break;
    case 'playing':
      callbacks.onPlaying?.(d.durationMs);
      break;
    case 'ended':
      callbacks.onEnded?.();
      break;
    case 'error':
      // 2 invalid id, 5 HTML5 error, 100 removed/private, 101/150 embedding disabled.
      console.warn('[YouTube] player error code:', d.code, '- advancing.');
      if (callbacks.onError) callbacks.onError(d.code);
      else callbacks.onEnded?.();
      break;
  }
}

function doPlay(videoId, volume) {
  console.log('[YouTube] play ->', videoId, 'volume', volume);
  post({ type: 'play', videoId, volume });
}

/**
 * Start playing a YouTube video's audio.
 * @param {string} videoId
 * @param {{onPlaying?:(durationMs:number)=>void, onEnded?:()=>void, onError?:(code:number)=>void, volume?:number}} cb
 */
export function playYouTube(videoId, cb) {
  callbacks = cb || {};
  if (typeof cb?.volume === 'number') currentVolume = cb.volume;
  ensureFrame();
  if (frameReady) doPlay(videoId, currentVolume);
  else pendingPlay = { videoId, volume: currentVolume };
}

/** Stop playback (used on skip / clear). Does not fire onEnded. */
export function stopYouTube() {
  callbacks = {};
  post({ type: 'stop' });
}

/** Pause the current YouTube audio. */
export function pauseYouTube() {
  post({ type: 'pause' });
}

/** Resume the current YouTube audio. */
export function resumeYouTube() {
  post({ type: 'resume' });
}

/** Whether the YouTube player is currently paused (state 2). */
export function isYouTubePaused() {
  return lastState === 2;
}

/** Set the YouTube playback volume (0-100). */
export function setYouTubeVolume(volume) {
  currentVolume = Math.max(0, Math.min(100, Math.round(volume)));
  post({ type: 'volume', value: currentVolume });
}

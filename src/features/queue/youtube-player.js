/**
 * Hidden YouTube audio player for YouTube-only song requests.
 *
 * Plays the video's direct audio stream (resolved by yt-dlp in the backend) in a
 * plain <audio> element — NOT a YouTube embed. This is the only way to play
 * videos whose owners disabled embedding (which return error 150 in any embedded
 * player). It also gives a real timeline, volume and pause control. The song is
 * shown like a normal now-playing track by the queue/track-display code.
 */

import { getTauriInvoke } from '../../core/tauri.js';

let audio = null;
let callbacks = {};
let currentVolume = 50;     // 0-100; kept low by default so it's never a blast
let pendingDurationMs = 0;  // duration reported by yt-dlp (fallback for the UI)
let pendingTitle = '';      // title reported by yt-dlp
let playToken = 0;          // guards against out-of-order async resolutions

// Cache of resolved stream URLs so a prefetched song starts instantly instead of
// waiting ~5s for yt-dlp at takeover time.
const urlCache = new Map(); // videoId -> { url, duration, title, ts }
const URL_TTL = 30 * 60 * 1000; // googlevideo URLs stay valid for a few hours

/** Nothing to wire up front; the <audio> element is created on first play. */
export function initYouTubePlayer() {}

/** Resolve a video's audio stream (via cache when fresh). */
async function resolveStream(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.ts < URL_TTL) return cached;
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error('Tauri not available');
  const info = await invoke('youtube_audio_url', { videoId });
  const entry = {
    url: info?.url || '',
    duration: info?.duration || 0,
    title: info?.title || '',
    ts: Date.now(),
  };
  if (entry.url) urlCache.set(videoId, entry);
  return entry;
}

/** Resolve + cache a video's stream ahead of time (called when it's next up). */
export function prefetchYouTube(videoId) {
  if (!videoId) return;
  const cached = urlCache.get(videoId);
  if (cached && Date.now() - cached.ts < URL_TTL) return;
  resolveStream(videoId).catch(() => {}); // best-effort
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('playing', () => {
    const durMs = (audio.duration && isFinite(audio.duration))
      ? Math.round(audio.duration * 1000)
      : pendingDurationMs;
    callbacks.onPlaying?.(durMs, pendingTitle);
  });
  audio.addEventListener('ended', () => { callbacks.onEnded?.(); });
  audio.addEventListener('error', () => {
    const code = audio.error?.code || 0;
    console.warn('[YouTube] audio element error code:', code);
    if (callbacks.onError) callbacks.onError(code);
    else callbacks.onEnded?.();
  });
  return audio;
}

/**
 * Start playing a YouTube video's audio.
 * @param {string} videoId
 * @param {{onPlaying?:(durationMs:number,title?:string)=>void, onEnded?:()=>void, onError?:(code:number)=>void, volume?:number}} cb
 */
export async function playYouTube(videoId, cb) {
  callbacks = cb || {};
  if (typeof cb?.volume === 'number') currentVolume = cb.volume;
  const token = ++playToken;

  const a = ensureAudio();
  a.volume = clampVol(currentVolume) / 100;

  console.log('[YouTube] resolving audio stream for', videoId);
  try {
    const info = await resolveStream(videoId);
    if (token !== playToken) return; // a newer play superseded this one
    const url = info?.url;
    if (!url) { console.warn('[YouTube] no audio url'); callbacks.onError?.(0); return; }

    pendingDurationMs = info.duration ? Math.round(info.duration * 1000) : 0;
    pendingTitle = info.title || '';
    console.log('[YouTube] playing audio stream, duration', info.duration, 'title', pendingTitle);

    a.src = url;
    a.volume = clampVol(currentVolume) / 100;
    try {
      await a.play();
    } catch (e) {
      console.warn('[YouTube] audio play() rejected:', e);
      callbacks.onError?.(0);
    }
  } catch (e) {
    if (token !== playToken) return;
    console.warn('[YouTube] audio stream resolution failed:', e);
    callbacks.onError?.(0);
  }
}

/** Stop playback (used on skip / clear). Does not fire onEnded. */
export function stopYouTube() {
  callbacks = {};
  playToken++; // cancel any pending resolution
  if (audio) {
    try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {}
  }
}

/** Pause the current audio. */
export function pauseYouTube() {
  try { audio?.pause(); } catch (e) {}
}

/** Resume the current audio. */
export function resumeYouTube() {
  try { audio?.play()?.catch(() => {}); } catch (e) {}
}

/** Set the playback volume (0-100). */
export function setYouTubeVolume(volume) {
  const v = clampVol(Math.round(volume));
  const changed = v !== currentVolume;
  currentVolume = v;
  if (audio) audio.volume = currentVolume / 100;
  if (changed) {
    console.log('[YouTube] volume set to', currentVolume + '%', '- audio.volume =', audio ? audio.volume : 'no audio element');
  }
}

/** Current playback position in ms. */
export function getYouTubeProgressMs() {
  return Math.round((audio?.currentTime || 0) * 1000);
}

function clampVol(v) { return Math.max(0, Math.min(100, v)); }

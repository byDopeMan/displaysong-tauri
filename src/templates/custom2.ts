// @ts-nocheck
/* Widget logic for templates/custom2. Authored as TS; inlined back into the .html at build. */
const { listen } = window.__TAURI__.event;
    const { invoke } = window.__TAURI__.tauri;
    const appWindow = window.__TAURI__.window?.appWindow || window.__TAURI__.window?.getCurrent?.();

    if (appWindow) {
      document.addEventListener('mousedown', async (e) => {
        if (e.buttons === 1) {
          try { await appWindow.startDragging(); } catch(e) {}
        }
      });
    }

    const $ = (id) => document.getElementById(id);
    let currentTrack = null;

    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }

    function update(track) {
      const widget = $('widget');
      const idle = $('idle');
      const cover = $('cover');
      const title = $('title');
      const artist = $('artist');
      const progress = $('progress');
      const timeCurrent = $('time-current');
      const timeTotal = $('time-total');

      if (!track?.track) {
        widget?.classList.add('hidden');
        idle?.classList.remove('hidden');
        return;
      }

      idle?.classList.add('hidden');
      widget?.classList.remove('hidden');
      widget?.classList.toggle('paused', !track.isPlaying);

      if (track.albumCover && track.albumCover !== currentTrack?.albumCover) {
        if (cover) cover.style.backgroundImage = `url('${track.albumCover}')`;
      }

      if (title) title.textContent = track.track;
      if (artist) artist.textContent = track.artist;

      if (track.color) {
        document.documentElement.style.setProperty('--r', track.color.r);
        document.documentElement.style.setProperty('--g', track.color.g);
        document.documentElement.style.setProperty('--b', track.color.b);
      }

      if (track.durationMs > 0) {
        if (progress) progress.style.width = `${(track.progressMs / track.durationMs) * 100}%`;
        if (timeCurrent) timeCurrent.textContent = formatTime(track.progressMs);
        if (timeTotal) timeTotal.textContent = formatTime(track.durationMs);
      }

      currentTrack = track;
    }

    listen('track-update', (e) => update(e.payload));
    invoke('get_track').then(update);

    setInterval(() => {
      if (currentTrack?.isPlaying && currentTrack.durationMs > 0) {
        currentTrack.progressMs = Math.min(currentTrack.progressMs + 1000, currentTrack.durationMs);
        const progress = $('progress');
        const timeCurrent = $('time-current');
        if (progress) progress.style.width = `${(currentTrack.progressMs / currentTrack.durationMs) * 100}%`;
        if (timeCurrent) timeCurrent.textContent = formatTime(currentTrack.progressMs);
      }
    }, 1000);

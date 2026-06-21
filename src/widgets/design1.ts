// @ts-nocheck
/* Widget logic for design1. Authored as TS; inlined back into design1.html at build
   (the widget windows must stay self-contained — see vite.config.mjs). */
async function waitForTauri() {
      let attempts = 0;
      while (!window.__TAURI__ && attempts < 100) {
        await new Promise(r => setTimeout(r, 50));
        attempts++;
      }
      return window.__TAURI__;
    }

    (async () => {
      const tauri = await waitForTauri();
      if (!tauri) { console.error('Tauri API nicht verfügbar'); return; }

      const listen = tauri.event?.listen || tauri.listen;
      const invoke = tauri.tauri?.invoke || tauri.invoke;
      const appWindow = tauri.window?.appWindow || tauri.window?.getCurrent?.() || tauri.appWindow;

      if (!listen || !invoke) { console.error('Tauri listen/invoke nicht gefunden'); return; }

      if (appWindow) {
        document.addEventListener('mousedown', async (e) => {
          if (e.buttons === 1) {
            try { await appWindow.startDragging(); } catch(e) {}
          }
        });
      }

      const $ = (id) => document.getElementById(id);
      let currentTrack = null;
      let useAccentColor = false;
      let accentColor = null;
      let isTransitioning = false;
      let progressInterval = null;
      let isPageVisible = true;
      let autoHideEnabled = false;
      try { autoHideEnabled = localStorage.getItem('widget-autohide') === 'true'; } catch (e) {}
      let requesterUser = null;
      let requesterEnabled = false;
      try { requesterEnabled = localStorage.getItem('widget-show-requester') === 'true'; } catch (e) {}

      function renderRequester() {
        const el = $('requester');
        const name = $('requester-name');
        if (!el) return;
        if (requesterEnabled && requesterUser) {
          if (name) name.textContent = requesterUser;
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      }

      // ===== PAGE VISIBILITY API - Timer pausieren wenn nicht sichtbar =====
      document.addEventListener('visibilitychange', () => {
        isPageVisible = !document.hidden;
        if (isPageVisible && currentTrack?.isPlaying) {
          startProgressTimer();
        } else {
          stopProgressTimer();
        }
      });

      function startProgressTimer() {
        if (progressInterval) return;
        progressInterval = setInterval(() => {
          if (currentTrack?.isPlaying && currentTrack.durationMs > 0 && isPageVisible) {
            currentTrack.progressMs = Math.min(currentTrack.progressMs + 1000, currentTrack.durationMs);
            const progress = $('progress');
            if (progress) progress.style.width = `${(currentTrack.progressMs / currentTrack.durationMs) * 100}%`;
          }
        }, 1000);
      }

      function stopProgressTimer() {
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }

      // Akzentfarbe Event Listener
      window.addEventListener('accent-color-change', (e) => {
        useAccentColor = true;
        accentColor = e.detail;
        setColor(accentColor.r, accentColor.g, accentColor.b);
      });

      window.addEventListener('accent-color-reset', () => {
        useAccentColor = false;
        accentColor = null;
        if (currentTrack?.color) {
          setColor(currentTrack.color.r, currentTrack.color.g, currentTrack.color.b);
        }
      });

      function setColor(r, g, b) {
        document.documentElement.style.setProperty('--r', r);
        document.documentElement.style.setProperty('--g', g);
        document.documentElement.style.setProperty('--b', b);
      }

      // Set text in an inner span and scroll it (marquee) if it overflows.
      function mqText(el, text) {
        if (!el) return;
        let span = el.querySelector('.mq-text');
        if (!span) { el.textContent = ''; span = document.createElement('span'); span.className = 'mq-text'; el.appendChild(span); }
        span.textContent = text;
        span.classList.remove('mq-run');
        span.style.removeProperty('--mq-shift');
        requestAnimationFrame(() => {
          const ov = span.scrollWidth - el.clientWidth;
          if (ov > 4) { span.style.setProperty('--mq-shift', `-${ov + 12}px`); span.classList.add('mq-run'); }
        });
      }

      // Preload an image URL so the crossfade reveals the real cover, not a
      // blank layer that pops in once the download finishes.
      function preloadImage(url) {
        return new Promise((resolve) => {
          if (!url) { resolve(); return; }
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = url;
          setTimeout(resolve, 1500); // safety net for slow/broken URLs
        });
      }

      async function transitionToNewTrack(track) {
        if (isTransitioning) return;
        isTransitioning = true;

        await preloadImage(track.albumCover);

        const cover = $('cover');
        const coverOld = $('cover-old');
        const title = $('title');
        const titleOld = $('title-old');
        const artist = $('artist');
        const artistOld = $('artist-old');

        if (currentTrack) {
          // Back layer instantly shows the OLD cover (no fade).
          coverOld.style.transition = 'none';
          coverOld.style.backgroundImage = cover.style.backgroundImage;
          coverOld.classList.remove('old');
          coverOld.classList.add('new');

          // Front layer instantly goes hidden, then receives the NEW cover so it
          // can genuinely fade in from opacity 0 (instead of snapping in at full
          // opacity, which looked like a hard cut).
          cover.style.transition = 'none';
          cover.classList.remove('new');
          cover.classList.add('old');
          cover.style.backgroundImage = `url('${track.albumCover}')`;

          // Commit the instant state, then re-enable transitions for the fade.
          void cover.offsetWidth;
          coverOld.style.transition = '';
          cover.style.transition = '';

          mqText(titleOld, title.textContent);
          mqText(artistOld, artist.textContent);

          titleOld.classList.remove('old');
          titleOld.classList.add('new');
          title.classList.add('entering');
          title.classList.remove('new');

          artistOld.classList.remove('old');
          artistOld.classList.add('new');
          artist.classList.add('entering');
          artist.classList.remove('new');
        } else {
          cover.style.backgroundImage = `url('${track.albumCover}')`;
        }

        mqText(title, track.track);
        mqText(artist, track.artist);

        if (track.color && !useAccentColor) {
          setColor(track.color.r, track.color.g, track.color.b);
        }

        await new Promise(r => setTimeout(r, 50));

        cover.classList.remove('old');
        cover.classList.add('new');
        coverOld.classList.remove('new');
        coverOld.classList.add('old');

        title.classList.remove('entering');
        title.classList.add('new');
        titleOld.classList.remove('new');
        titleOld.classList.add('old');

        artist.classList.remove('entering');
        artist.classList.add('new');
        artistOld.classList.remove('new');
        artistOld.classList.add('old');

        await new Promise(r => setTimeout(r, 400));
        isTransitioning = false;
      }

      function update(track) {
        const widget = $('widget');
        const idle = $('idle');
        const badge = $('badge');
        const progress = $('progress');

        // Auto-hide ("Ausblenden wenn pausiert"): hide the widget when nothing
        // is playing OR when playback is paused.
        if (autoHideEnabled && (!track?.track || !track.isPlaying)) {
          widget?.classList.add('hidden');
          idle?.classList.add('hidden');
          currentTrack = track?.track ? { ...track } : null;
          stopProgressTimer();
          return;
        }

        if (!track?.track) {
          widget?.classList.add('hidden');
          idle?.classList.remove('hidden');
          currentTrack = null;
          stopProgressTimer();
          return;
        }

        idle?.classList.add('hidden');
        widget?.classList.remove('hidden');

        const isNewTrack = !currentTrack || 
          currentTrack.track !== track.track || 
          currentTrack.artist !== track.artist;

        if (isNewTrack) {
          transitionToNewTrack(track);
        }

        if (badge) {
          badge.classList.toggle('paused', !track.isPlaying);
          badge.textContent = track.isPlaying ? 'Läuft jetzt' : 'Pausiert';
        }

        if (track.durationMs > 0 && progress) {
          progress.style.width = `${(track.progressMs / track.durationMs) * 100}%`;
        }

        currentTrack = { ...track };

        // Progress Timer starten/stoppen basierend auf Play-Status
        if (track.isPlaying && isPageVisible) {
          startProgressTimer();
        } else {
          stopProgressTimer();
        }
      }

      await listen('track-update', (e) => update(e.payload));

      // Requester display (song requests): who requested the current track, and
      // whether the "show requester" design option is enabled.
      await listen('requester-update', (e) => {
        requesterUser = e.payload?.user || null;
        renderRequester();
      });
      await listen('requester-visibility-change', (e) => {
        requesterEnabled = !!e.payload?.enabled;
        renderRequester();
      });

      // Global auto-hide ("Ausblenden wenn pausiert"): re-evaluate visibility.
      await listen('autohide-change', (e) => {
        autoHideEnabled = !!e.payload?.enabled;
        update(currentTrack || null);
      });
      renderRequester();

      try { const track = await invoke('get_track'); update(track); } catch (e) {}
    })();

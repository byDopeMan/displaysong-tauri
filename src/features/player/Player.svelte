<script lang="ts">
  // Now-playing player as a Svelte component (replaces the manual DOM-poking in
  // ui/track-display.ts). Renders reactively from playerSnapshot + playerProgressMs;
  // the polling/interpolation logic lives in ui/track-display.ts and just publishes
  // to those stores.
  import { formatTime } from '../../utils/format';
  import { t } from '../../utils/i18n';
  import { copySongInfo } from '../../ui/track-display';
  import { playerSnapshot, playerProgressMs } from './store';

  $: snap = $playerSnapshot;
  $: progressMs = $playerProgressMs;
  $: progressPct = snap.durationMs > 0 ? Math.min(100, (progressMs / snap.durationMs) * 100) : 0;
  $: statusText = !snap.hasTrack
    ? t('player.paused', {}, 'Pausiert')
    : snap.isPlaying
      ? t('player.nowPlaying', {}, 'Läuft jetzt')
      : t('player.paused', {}, 'Pausiert');
  $: titleText = snap.hasTrack ? snap.title : t('player.nothingPlaying', {}, 'Nichts läuft');

  // Cover crossfade — mirrors the original 150ms fade-out/swap/fade-in so we keep
  // the exact look (background-image can't be CSS-transitioned directly).
  let coverEl: HTMLDivElement | null = null;
  let coverBgEl: HTMLDivElement | null = null;
  let shownCover = '';
  $: maybeCrossfade(snap.albumCover);
  function maybeCrossfade(url: string): void {
    if (!url || url === shownCover) return;
    shownCover = url;
    if (coverEl) coverEl.style.opacity = '0';
    if (coverBgEl) coverBgEl.style.opacity = '0';
    setTimeout(() => {
      if (coverEl) {
        coverEl.style.backgroundImage = `url('${url}')`;
        coverEl.style.opacity = '1';
      }
      if (coverBgEl) {
        coverBgEl.style.backgroundImage = `url('${url}')`;
        coverBgEl.style.opacity = '0.35';
      }
    }, 150);
  }

  // Marquee: scroll the title left-to-right when it overflows its container.
  // Re-measures via a ResizeObserver so it also kicks in when the player tab
  // becomes visible (the view is display:none at first, where width reads 0).
  function marquee(node: HTMLElement, text: string) {
    let span: HTMLElement;
    let current = '';

    function ensureSpan(): void {
      if (span) return;
      node.classList.add('mq-host');
      node.textContent = '';
      span = document.createElement('span');
      span.className = 'mq-text';
      node.appendChild(span);
    }

    function measure(): void {
      if (!span) return;
      span.classList.remove('mq-run');
      span.style.removeProperty('--mq-shift');
      const overflow = span.scrollWidth - node.clientWidth;
      if (node.clientWidth > 0 && overflow > 4) {
        span.style.setProperty('--mq-shift', `-${overflow + 12}px`);
        span.classList.add('mq-run');
      }
    }

    function apply(value: string): void {
      ensureSpan();
      if (current !== value) {
        current = value;
        span.textContent = value;
      }
      requestAnimationFrame(measure);
    }

    apply(text);
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);

    return {
      update: apply,
      destroy() { ro.disconnect(); },
    };
  }
</script>

<div class="cover-bg" id="cover-bg" bind:this={coverBgEl}></div>
<div class="cover-image" id="cover-image" bind:this={coverEl}></div>

<div class="track-info">
  <div class="status-badge" id="status-badge" class:paused={!snap.isPlaying || !snap.hasTrack}>
    <span class="status-dot"></span>
    <span class="status-text">{statusText}</span>
  </div>
  <!-- svelte-ignore a11y-missing-content -->
  <h2 class="track-title" id="track-title" use:marquee={titleText}></h2>
  <p class="track-artist" id="track-artist">{snap.hasTrack ? snap.artist : '—'}</p>
  <p class="track-album" id="track-album">{snap.hasTrack ? snap.album : ''}</p>
  <div class="track-requester" id="track-requester" class:hidden={!snap.requester}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
    <span id="track-requester-name">{snap.requester || ''}</span>
  </div>
  <button id="btn-copy-song" class="btn-copy" title="Song-Info kopieren" on:click={copySongInfo}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  </button>
</div>

<div class="progress-container">
  <div class="progress-bar-bg">
    <div class="progress-bar" id="progress-bar" style="width: {progressPct}%"></div>
  </div>
  <div class="progress-times">
    <span id="progress-current">{formatTime(progressMs)}</span>
    <span id="progress-total">{formatTime(snap.durationMs)}</span>
  </div>
</div>

<script lang="ts">
  // History list as a Svelte component (replaces the manual innerHTML rendering
  // in history.ts). Renders the list from the historyDisplay store, with the
  // per-item "open on platform" radial menu and a right-click block/unblock menu.
  import { getTauriInvoke } from '../../core/tauri';
  import { openExternal } from '../../ui/navigation';
  import { showNotification } from '../../ui/notifications';
  import { t } from '../../utils/i18n';
  import { isBlocked, blockSong, unblockSong } from './blocklist';
  import type { SongRef } from './blocklist';
  import { historyDisplay } from './store';
  import type { HistoryItem } from './store';

  const PLATFORM_ICONS: Record<string, string> = {
    spotify: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
    youtube: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    apple: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>`,
    soundcloud: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.084-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.054-.092-.078-.092zm1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.059-.104-.121-.104zm.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.225-2.544-.225-2.64c-.015-.075-.06-.135-.166-.135zm.96-.106c-.074 0-.149.06-.164.15l-.18 2.73.18 2.535c.015.09.09.15.164.15.091 0 .166-.06.166-.15l.195-2.535-.195-2.73c0-.09-.075-.15-.166-.15zm.976-.14c-.09 0-.165.075-.18.165l-.165 2.865.18 2.519c.015.09.075.165.165.165.09 0 .165-.074.181-.165l.18-2.52-.195-2.864c-.015-.09-.09-.165-.166-.165zm1.02-.15c-.104 0-.194.09-.194.194l-.15 3 .165 2.506c0 .12.09.194.194.194.104 0 .194-.09.194-.194l.165-2.506-.165-3c0-.105-.09-.195-.209-.195zm.976-.14c-.12 0-.209.09-.225.21l-.135 3.135.15 2.49c.015.12.105.21.225.21.12 0 .21-.09.225-.21l.165-2.49-.165-3.135c-.015-.12-.105-.21-.24-.21zm.99-.136c-.135 0-.239.105-.239.24l-.12 3.27.135 2.46c0 .135.104.24.239.24.135 0 .24-.105.24-.24l.149-2.46-.149-3.27c0-.135-.105-.24-.255-.24zm1.006-.15c-.135 0-.255.12-.255.255l-.12 3.42.12 2.446c0 .149.12.254.255.254.15 0 .255-.105.27-.254l.135-2.446-.135-3.42c-.015-.135-.135-.255-.27-.255zm2.49 1.5c-.42 0-.81.12-1.155.33-.09-1.65-1.455-2.94-3.135-2.94-.345 0-.69.06-1.005.165-.12.045-.165.09-.165.195v6.15c0 .12.09.225.21.24h5.25c1.29 0 2.34-1.05 2.34-2.34 0-1.29-1.05-2.34-2.34-2.34z"/></svg>`,
    link: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  };

  interface PlatformLink { key: string; name: string; url: string; direct: boolean; }

  let expandedIndex: number | null = null;
  let linksByIndex: Record<number, PlatformLink[]> = {};

  // Right-click block/unblock menu state.
  let ctx: { x: number; y: number; song: SongRef; blocked: boolean } | null = null;

  function getSearchUrl(platform: string, query: string): string {
    switch (platform) {
      case 'spotify': return `https://open.spotify.com/search/${query}`;
      case 'youtube': return `https://www.youtube.com/results?search_query=${query}`;
      case 'apple': return `https://music.apple.com/search?term=${query}`;
      case 'soundcloud': return `https://soundcloud.com/search?q=${query}`;
      default: return '';
    }
  }

  async function toggleRadial(index: number, item: HistoryItem) {
    if (expandedIndex === index) {
      expandedIndex = null;
      return;
    }
    expandedIndex = index;
    if (!linksByIndex[index]) {
      linksByIndex = { ...linksByIndex, [index]: await loadLinks(item) };
    }
  }

  async function loadLinks(item: HistoryItem): Promise<PlatformLink[]> {
    const invoke = getTauriInvoke();
    let links: any = null;
    if (item.trackId && invoke) {
      try { links = await invoke('get_all_streaming_links', { query: item.trackId }); } catch (e) { /* search fallback */ }
    }
    const q = encodeURIComponent(`${item.artist} ${item.track}`);
    const platforms = [
      { key: 'spotify', name: 'Spotify', url: links?.spotify },
      { key: 'youtube', name: 'YouTube', url: links?.youtube },
      { key: 'apple', name: 'Apple Music', url: links?.apple_music },
      { key: 'soundcloud', name: 'SoundCloud', url: links?.soundcloud },
    ];
    return platforms.map((p) => ({
      key: p.key,
      name: p.name,
      url: p.url || getSearchUrl(p.key, q),
      direct: !!p.url,
    }));
  }

  function open(url: string) {
    if (url) openExternal(url);
    expandedIndex = null;
  }

  function onContextMenu(e: MouseEvent, item: HistoryItem) {
    e.preventDefault();
    const song: SongRef = { id: item.trackId || null, artist: item.artist || '', title: item.track || '' };
    ctx = { x: e.clientX, y: e.clientY, song, blocked: isBlocked(song) };
  }

  function toggleBlock() {
    if (!ctx) return;
    if (ctx.blocked) {
      unblockSong(ctx.song);
      showNotification(t('notifications.songUnblocked', {}, 'Song entsperrt'));
    } else {
      blockSong(ctx.song);
      showNotification(t('notifications.songBlocked', {}, 'Song blockiert – kann nicht mehr angefragt werden'));
    }
    ctx = null;
  }

  function onWindowClick() {
    // Any click outside the open radial / context menu closes them.
    expandedIndex = null;
    ctx = null;
  }
</script>

<svelte:window on:click={onWindowClick} />

{#if $historyDisplay.length === 0}
  <div class="history-empty">
    <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
    <p data-i18n="history.empty">Noch keine Songs gespielt</p>
  </div>
{:else}
  {#each $historyDisplay as item, index (index)}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="history-item" on:contextmenu={(e) => onContextMenu(e, item)}>
      <span class="history-index">{index + 1}</span>
      <div class="history-cover" style="background-image: url('{item.albumCover || ''}')"></div>
      <div class="history-info">
        <div class="history-title">{item.track}</div>
        <div class="history-artist">{item.artist}</div>
      </div>
      <div class="platform-radial" class:expanded={expandedIndex === index}>
        <button class="platform-radial-trigger" title="Öffnen auf..." on:click|stopPropagation={() => toggleRadial(index, item)}>
          {@html PLATFORM_ICONS.link}
        </button>
        <div class="platform-radial-menu">
          {#each linksByIndex[index] || [] as link}
            <button class="platform-radial-item {link.key}" title="{link.name}{link.direct ? '' : ' (Suche)'}" on:click|stopPropagation={() => open(link.url)}>
              {@html PLATFORM_ICONS[link.key]}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/each}
{/if}

{#if ctx}
  <div class="context-menu" style="left: {ctx.x}px; top: {ctx.y}px;">
    <button class="context-menu-item" on:click|stopPropagation={toggleBlock}>
      {ctx.blocked ? 'Blockierung aufheben' : 'Song blockieren'}
    </button>
  </div>
{/if}

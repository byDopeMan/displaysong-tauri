/**
 * Song History Management
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { escapeHtml, escapeAttr } from '../../utils/format';
import { openExternal } from '../../ui/navigation.js';
import { settings } from '../settings.js';
import { isBlocked, blockSong, unblockSong, getBlocklist, removeBlockAt } from './blocklist';
import { showNotification } from '../../ui/notifications.js';
// Note: getHistorySourceFilter is imported dynamically to avoid circular dependency issues

// History design is now always 'simple' with platform links menu

// Listen for history filter changes
window.addEventListener('history-filter-change', () => {
  refreshHistory();
});

/**
 * Load history from backend (uses local DB for all providers)
 */
export async function loadHistory() {
  // Don't load if history tab is disabled
  if (settings.showHistoryTab === false) {
    console.log('[History] Tab disabled, skipping load');
    return;
  }
  
  try {
    const invoke = getTauriInvoke();
    if (!invoke) {
      console.error('[History] No invoke available');
      return;
    }
    
    console.log('[History] Loading from local DB...');
    
    // Always use local track history (works for both Windows Audio and Spotify)
    const history = await invoke('get_local_track_history', { limit: 100 });
    
    console.log('[History] Got', (history || []).length, 'entries from DB');
    
    // Transform to expected format
    const formattedHistory = (history || []).map(entry => ({
      track: entry.track,
      artist: entry.artist,
      album: entry.album,
      albumCover: entry.album_cover,
      trackId: entry.track_id,
      source: entry.source,
      playedAt: entry.played_at
    }));
    
    updateHistoryDisplay(formattedHistory);
  } catch (e) {
    console.error('[History] Load failed:', e);
  }
}

/**
 * Refresh history (called on new track)
 */
export async function refreshHistory() {
  // Don't refresh if history tab is disabled
  if (settings.showHistoryTab === false) {
    return;
  }
  
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    
    const history = await invoke('get_local_track_history', { limit: 100 });
    
    const formattedHistory = (history || []).map(entry => ({
      track: entry.track,
      artist: entry.artist,
      album: entry.album,
      albumCover: entry.album_cover,
      trackId: entry.track_id,
      source: entry.source,
      playedAt: entry.played_at
    }));
    
    updateHistoryDisplay(formattedHistory);
  } catch (e) {
    console.error('Refresh history failed:', e);
  }
}

/**
 * Update history display
 */
function updateHistoryDisplay(history) {
  const simpleList = document.getElementById('history-simple');
  
  if (!simpleList) return;
  
  // Always update cached history (even if empty array)
  state.cachedHistory = history || [];
  
  console.log('[History] Updating display with', state.cachedHistory.length, 'tracks');
  
  if (state.cachedHistory.length === 0) {
    simpleList.innerHTML = `
      <div class="history-empty">
        <svg class="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"></path>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <p data-i18n="history.empty">Noch keine Songs gespielt</p>
      </div>
    `;
    return;
  }
  
  // Limit history to maxItems
  const maxItems = settings.historyLength || 20;
  const limitedHistory = state.cachedHistory.slice(0, maxItems);
  
  updateSimpleList(simpleList, limitedHistory);
}

/**
 * Platform icons SVG
 */
const PLATFORM_ICONS = {
  spotify: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  youtube: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  apple: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>`,
  soundcloud: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.084-.1zm-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.054-.092-.078-.092zm1.83-1.229c-.061 0-.12.045-.12.104l-.21 2.563.225 2.458c0 .06.045.104.106.104.061 0 .12-.044.12-.104l.24-2.458-.24-2.563c0-.06-.059-.104-.121-.104zm.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.225-2.544-.225-2.64c-.015-.075-.06-.135-.166-.135zm.96-.106c-.074 0-.149.06-.164.15l-.18 2.73.18 2.535c.015.09.09.15.164.15.091 0 .166-.06.166-.15l.195-2.535-.195-2.73c0-.09-.075-.15-.166-.15zm.976-.14c-.09 0-.165.075-.18.165l-.165 2.865.18 2.519c.015.09.075.165.165.165.09 0 .165-.074.181-.165l.18-2.52-.195-2.864c-.015-.09-.09-.165-.166-.165zm1.02-.15c-.104 0-.194.09-.194.194l-.15 3 .165 2.506c0 .12.09.194.194.194.104 0 .194-.09.194-.194l.165-2.506-.165-3c0-.105-.09-.195-.209-.195zm.976-.14c-.12 0-.209.09-.225.21l-.135 3.135.15 2.49c.015.12.105.21.225.21.12 0 .21-.09.225-.21l.165-2.49-.165-3.135c-.015-.12-.105-.21-.24-.21zm.99-.136c-.135 0-.239.105-.239.24l-.12 3.27.135 2.46c0 .135.104.24.239.24.135 0 .24-.105.24-.24l.149-2.46-.149-3.27c0-.135-.105-.24-.255-.24zm1.006-.15c-.135 0-.255.12-.255.255l-.12 3.42.12 2.446c0 .149.12.254.255.254.15 0 .255-.105.27-.254l.135-2.446-.135-3.42c-.015-.135-.135-.255-.27-.255zm2.49 1.5c-.42 0-.81.12-1.155.33-.09-1.65-1.455-2.94-3.135-2.94-.345 0-.69.06-1.005.165-.12.045-.165.09-.165.195v6.15c0 .12.09.225.21.24h5.25c1.29 0 2.34-1.05 2.34-2.34 0-1.29-1.05-2.34-2.34-2.34z"/></svg>`,
  deezer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38h-5.19zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027h-5.19zm6.271 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03h-5.19zm6.271 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19z"/></svg>`,
  tidal: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996 4.004 12l4.004-4.004L12.012 12l-4.004 4.004 4.004 4.004 4.004-4.004L12.012 12l4.004-4.004-4.004-4.004zm4.004 4.004l4.004 4.004L24.024 7.996l-4.004-4.004-4.004 4.004z"/></svg>`,
  amazon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.093.045-.122zm6.221-1.996c1.263-1.623 2.644-2.96 5.022-2.96 2.378 0 4.326 1.337 5.589 2.96.313.4.313.747-.156 1.091l-1.175.78c-.312.22-.625.22-.938-.06-.547-.467-1.015-.78-1.484-.935-.312-.156-.703-.156-1.25-.156-.625 0-1.172.156-1.641.467-.312.22-.547.467-.703.747-.156.28-.234.56-.234.84 0 .56.234 1.027.703 1.404.47.374 1.172.654 2.109.84 1.954.374 3.438.934 4.454 1.684 1.015.747 1.523 1.776 1.523 3.086 0 1.404-.547 2.524-1.641 3.364-1.094.84-2.5 1.26-4.22 1.26-1.25 0-2.422-.187-3.515-.56-1.094-.374-2.031-.934-2.813-1.684-.312-.28-.312-.56 0-.84l1.094-1.027c.313-.28.625-.28.938 0 .469.374.938.654 1.406.84.47.187 1.016.28 1.641.28.625 0 1.133-.093 1.523-.28.39-.187.586-.467.586-.84 0-.467-.312-.84-.938-1.12-.625-.28-1.562-.56-2.813-.84-1.25-.28-2.265-.747-3.047-1.404-.78-.654-1.172-1.59-1.172-2.804 0-.934.273-1.776.82-2.524z"/></svg>`,
  link: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
};

/**
 * Update simple list view
 */
function updateSimpleList(container, history) {
  container.innerHTML = history.map((track, index) => `
    <div class="history-item" data-track-id="${escapeAttr(track.trackId || '')}" data-track="${escapeAttr(track.track)}" data-artist="${escapeAttr(track.artist)}">
      <span class="history-index">${index + 1}</span>
      <div class="history-cover" style="background-image: url('${escapeAttr(track.albumCover || '')}')"></div>
      <div class="history-info">
        <div class="history-title">${escapeHtml(track.track)}</div>
        <div class="history-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="platform-radial" id="platform-radial-${index}" data-track-id="${escapeAttr(track.trackId || '')}" data-track="${escapeAttr(track.track)}" data-artist="${escapeAttr(track.artist)}">
        <button class="platform-radial-trigger" title="Öffnen auf...">
          ${PLATFORM_ICONS.link}
        </button>
        <div class="platform-radial-menu"></div>
      </div>
    </div>
  `).join('');
  
  // Setup radial menu triggers
  container.querySelectorAll('.platform-radial').forEach((radial) => {
    const trigger = radial.querySelector('.platform-radial-trigger');
    const menu = radial.querySelector('.platform-radial-menu');
    
    trigger.addEventListener('click', async (e) => {
      e.stopPropagation();
      
      // Close all other radials first
      document.querySelectorAll('.platform-radial.expanded').forEach(r => {
        if (r !== radial) r.classList.remove('expanded');
      });
      
      // Toggle this radial
      const isExpanded = radial.classList.toggle('expanded');
      
      if (isExpanded && !radial.dataset.loaded) {
        await loadPlatformLinks(radial, menu);
      }
    });
  });
  
  // Close radial when clicking outside. Bound once at module level — the list is
  // re-rendered on every track change, so binding here per render would leak a
  // new document listener each time.
  ensureRadialOutsideClose();

  // Right-click a history entry -> block / unblock the song.
  container.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showBlockMenu(e.clientX, e.clientY, {
        id: item.dataset.trackId || null,
        artist: item.dataset.artist || '',
        title: item.dataset.track || '',
      });
    });
  });
}

// Bind the radial outside-click handler exactly once (see updateSimpleList).
let radialOutsideBound = false;
function ensureRadialOutsideClose() {
  if (radialOutsideBound) return;
  radialOutsideBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.platform-radial')) {
      document.querySelectorAll('.platform-radial.expanded').forEach(r => r.classList.remove('expanded'));
    }
  });
}

let blockMenuEl = null;
function closeBlockMenu() {
  if (blockMenuEl) { blockMenuEl.remove(); blockMenuEl = null; }
  document.removeEventListener('click', closeBlockMenu);
}

/** Show the right-click block/unblock menu for a history entry. */
function showBlockMenu(x, y, song) {
  closeBlockMenu();
  const blocked = isBlocked(song);
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const btn = document.createElement('button');
  btn.className = 'context-menu-item';
  btn.textContent = blocked ? 'Blockierung aufheben' : 'Song blockieren';
  menu.appendChild(btn);
  document.body.appendChild(menu);
  blockMenuEl = menu;

  // Keep it on screen.
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = `${window.innerWidth - r.width - 8}px`;
  if (r.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - r.height - 8}px`;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (blocked) {
      unblockSong(song);
      showNotification('Song entsperrt');
    } else {
      blockSong(song);
      showNotification('Song blockiert – kann nicht mehr angefragt werden');
    }
    closeBlockMenu();
  });

  // Close on the next outside click.
  setTimeout(() => document.addEventListener('click', closeBlockMenu), 0);
}

/** Wire the "Blockiert" button to open the management modal. Call once at init. */
export function setupBlocklistUI() {
  const btn = document.getElementById('btn-open-blocklist');
  if (btn) {
    btn.addEventListener('click', () => {
      renderBlocklistModal();
      document.getElementById('blocklist-modal')?.classList.remove('hidden');
    });
  }
  // Keep the modal in sync if the list changes while it's open.
  window.addEventListener('blocklist-change', () => {
    const modal = document.getElementById('blocklist-modal');
    if (modal && !modal.classList.contains('hidden')) renderBlocklistModal();
  });
}

/** Render the blocklist management modal contents and wire its buttons. */
export function renderBlocklistModal() {
  const listEl = document.getElementById('blocklist-items');
  if (!listEl) return;
  const list = getBlocklist();
  if (list.length === 0) {
    listEl.innerHTML = `<p class="blocklist-empty">Keine blockierten Songs.</p>`;
    return;
  }
  listEl.innerHTML = list.map((e, i) => `
    <div class="blocklist-row">
      <div class="blocklist-info">
        <span class="blocklist-title">${escapeHtml(e.title || '—')}</span>
        <span class="blocklist-artist">${escapeHtml(e.artist || '')}</span>
      </div>
      <button class="blocklist-remove" data-index="${i}" title="Entsperren">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `).join('');
  listEl.querySelectorAll('.blocklist-remove').forEach((b) => {
    b.addEventListener('click', () => {
      removeBlockAt(parseInt(b.dataset.index));
      renderBlocklistModal();
    });
  });
}

/**
 * Load platform links for a track (radial menu)
 */
async function loadPlatformLinks(radial, menu) {
  const trackId = radial.dataset.trackId;
  const trackName = radial.dataset.track;
  const artistName = radial.dataset.artist;
  
  try {
    const invoke = getTauriInvoke();
    if (!invoke) {
      return;
    }
    
    let links = null;
    
    // Try to get links via Songlink API if we have a track ID
    if (trackId) {
      try {
        links = await invoke('get_all_streaming_links', { query: trackId });
      } catch (e) {
        console.log('[History] Songlink API failed:', e);
      }
    }
    
    // Build radial menu items (4 platforms only)
    const platforms = [
      { key: 'spotify', name: 'Spotify', url: links?.spotify },
      { key: 'youtube', name: 'YouTube', url: links?.youtube },
      { key: 'apple', name: 'Apple Music', url: links?.apple_music },
      { key: 'soundcloud', name: 'SoundCloud', url: links?.soundcloud },
    ];
    
    // If no links from API, create search links
    const searchQuery = encodeURIComponent(`${artistName} ${trackName}`);
    
    const menuHtml = platforms.map(p => {
      const url = p.url || getSearchUrl(p.key, searchQuery);
      const hasDirectLink = !!p.url;
      return `
        <button class="platform-radial-item ${p.key}"
                data-url="${escapeAttr(url)}"
                title="${p.name}${hasDirectLink ? '' : ' (Suche)'}">
          ${PLATFORM_ICONS[p.key]}
        </button>
      `;
    }).join('');
    
    menu.innerHTML = menuHtml;
    radial.dataset.loaded = 'true';
    
    // Add click handlers
    menu.querySelectorAll('.platform-radial-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = item.dataset.url;
        if (url) openExternal(url);
        radial.classList.remove('expanded');
      });
    });
    
  } catch (e) {
    console.error('[History] Failed to load platform links:', e);
  }
}

/**
 * Get search URL for a platform
 */
function getSearchUrl(platform, query) {
  switch (platform) {
    case 'spotify': return `https://open.spotify.com/search/${query}`;
    case 'youtube': return `https://www.youtube.com/results?search_query=${query}`;
    case 'apple': return `https://music.apple.com/search?term=${query}`;
    case 'soundcloud': return `https://soundcloud.com/search?q=${query}`;
    case 'deezer': return `https://www.deezer.com/search/${query}`;
    case 'tidal': return `https://listen.tidal.com/search?q=${query}`;
    case 'amazon': return `https://music.amazon.com/search/${query}`;
    default: return '';
  }
}

// Note: Embedded list and design toggle have been removed in favor of
// the platform links menu which provides direct links to all streaming platforms

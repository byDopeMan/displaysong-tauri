/**
 * Song History Management
 *
 * Fetches the local play/request history and publishes it to the historyDisplay
 * store; History.svelte renders the list + per-item platform menu + right-click
 * block menu. The blocklist management modal is still rendered here.
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { settings } from '../settings';
import { historyDisplay, blocklistModalOpen, type HistoryItem } from './store';
import History from './History.svelte';

// Listen for history filter changes
window.addEventListener('history-filter-change', () => {
  refreshHistory();
});

function formatEntries(history: any[]): any[] {
  return (history || []).map((entry) => ({
    track: entry.track,
    artist: entry.artist,
    album: entry.album,
    albumCover: entry.album_cover,
    trackId: entry.track_id,
    source: entry.source,
    playedAt: entry.played_at,
  }));
}

/** Load history from backend (uses local DB for all providers) */
export async function loadHistory(): Promise<void> {
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
    const history = await invoke('get_local_track_history', { limit: 100 });
    console.log('[History] Got', (history || []).length, 'entries from DB');
    updateHistoryDisplay(formatEntries(history));
  } catch (e) {
    console.error('[History] Load failed:', e);
  }
}

/** Refresh history (called on new track) */
export async function refreshHistory(): Promise<void> {
  if (settings.showHistoryTab === false) return;

  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const history = await invoke('get_local_track_history', { limit: 100 });
    updateHistoryDisplay(formatEntries(history));
  } catch (e) {
    console.error('Refresh history failed:', e);
  }
}

/** Publish the latest history snapshot to the store (the Svelte view renders it). */
function updateHistoryDisplay(history: any[]): void {
  // Keep the full cached history (used elsewhere); the view gets a slim slice.
  state.cachedHistory = history || [];
  console.log('[History] Updating display with', state.cachedHistory.length, 'tracks');

  const maxItems = settings.historyLength || 20;
  const items: HistoryItem[] = state.cachedHistory.slice(0, maxItems).map((t: any) => ({
    track: t.track,
    artist: t.artist,
    albumCover: t.albumCover || null,
    trackId: t.trackId || null,
  }));
  historyDisplay.set(items);
}

// Mount the Svelte history list into its container exactly once.
let historyMounted = false;
function mountHistoryView(): void {
  if (historyMounted) return;
  const el = document.getElementById('history-simple');
  if (el) {
    historyMounted = true;
    el.innerHTML = '';
    new History({ target: el });
  }
}

/** Wire the "Blockiert" button to open the management modal. Call once at init. */
export function setupBlocklistUI(): void {
  mountHistoryView();

  // The modal itself is BlocklistModal.svelte; just open it via the store.
  document.getElementById('btn-open-blocklist')?.addEventListener('click', () => {
    blocklistModalOpen.set(true);
  });
}

/**
 * Reactive view-model for the play/request history list.
 *
 * history.ts fetches + formats the entries and publishes a snapshot here;
 * History.svelte renders it reactively (auto-escaped).
 */

import { writable } from 'svelte/store';

export interface HistoryItem {
  track: string;
  artist: string;
  albumCover: string | null;
  trackId: string | null;
}

export const historyDisplay = writable<HistoryItem[]>([]);

/** Whether the blocklist management modal is open (BlocklistModal.svelte). */
export const blocklistModalOpen = writable(false);

/**
 * Reactive view-model for the song-request queue.
 *
 * queue/index.ts owns the real state (queueItems + trackInfoCache) and the
 * logic; whenever the list changes it publishes a plain display snapshot here.
 * The Queue.svelte component subscribes and re-renders automatically — no manual
 * innerHTML, and Svelte auto-escapes all interpolated values.
 */

import { writable } from 'svelte/store';

export interface QueueDisplayItem {
  id: string;
  uri: string;
  position: number;
  hasInfo: boolean;
  track: string;
  artist: string;
  coverUrl: string | null;
  uriShort: string;
  isPoints: boolean;
  user: string;
  timeAgo: string;
}

export const queueDisplay = writable<QueueDisplayItem[]>([]);

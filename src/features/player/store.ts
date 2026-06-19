/**
 * Reactive view-model for the now-playing player.
 *
 * ui/track-display.ts owns the polling/interpolation logic and publishes
 * snapshots here; Player.svelte renders them reactively (auto-escaped). The
 * progress is a separate store because the requestAnimationFrame loop updates
 * it ~60×/s, independently of the (rarer) track-metadata changes.
 */

import { writable } from 'svelte/store';

export interface PlayerSnapshot {
  hasTrack: boolean;
  title: string;
  artist: string;
  album: string;
  albumCover: string;
  isPlaying: boolean;
  requester: string | null;
  durationMs: number;
}

const EMPTY: PlayerSnapshot = {
  hasTrack: false,
  title: '',
  artist: '',
  album: '',
  albumCover: '',
  isPlaying: false,
  requester: null,
  durationMs: 0,
};

export const playerSnapshot = writable<PlayerSnapshot>({ ...EMPTY });

/** Current playback position in ms (driven by the rAF interpolation loop). */
export const playerProgressMs = writable<number>(0);

export function resetPlayer(): void {
  playerSnapshot.set({ ...EMPTY });
  playerProgressMs.set(0);
}

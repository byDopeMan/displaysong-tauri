/**
 * Which app-info modal is open (changelog / licenses), opened from the About
 * block in the Settings tab; rendered by InfoModals.svelte.
 */

import { writable } from 'svelte/store';

export type InfoModal = 'changelog' | 'licenses' | null;

export const infoModal = writable<InfoModal>(null);

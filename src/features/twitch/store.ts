/**
 * Whether the Twitch settings panel is open. The gear button in the Connections
 * block opens it; Settings.svelte renders the Twitch section as a panel (with a
 * back button) instead of inline.
 */

import { writable } from 'svelte/store';

export const twitchPanelOpen = writable(false);

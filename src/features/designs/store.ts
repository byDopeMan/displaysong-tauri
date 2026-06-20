/**
 * Reactive list of currently-visible widgets.
 *
 * features/widgets.ts owns the show/hide logic and publishes the active set here
 * (via updateWidgetList); Designs.svelte renders the "Aktive Widgets" tags from it.
 */

import { writable } from 'svelte/store';

export const activeWidgets = writable<string[]>([]);

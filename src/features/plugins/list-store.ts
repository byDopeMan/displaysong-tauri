/**
 * Reactive view-model for the plugin management list.
 *
 * plugins/index.ts fetches the plugin list and publishes it here; PluginList.svelte
 * renders it reactively (auto-escaped).
 */

import { writable } from 'svelte/store';

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  enabled: boolean;
  has_error: boolean;
  error_message?: string;
}

export const pluginList = writable<PluginInfo[]>([]);

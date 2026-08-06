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
  /** Absolute path to the plugin's folder (from the backend). */
  path?: string;
  /** Permissions declared in the manifest — gate the api surface. */
  permissions?: string[];
  has_error: boolean;
  error_message?: string;
}

export const pluginList = writable<PluginInfo[]>([]);

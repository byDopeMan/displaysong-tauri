/**
 * Plugin System – public entry point.
 *
 * Loads enabled plugins, renders the management list, and wires up the
 * plugins-tab toolbar. The supporting concerns live in sibling modules:
 *   - api.ts      the `api` object passed to each plugin
 *   - window.ts   plugin-created floating windows
 *   - settings.ts plugin settings modal/panel
 *   - storage.ts  per-plugin localStorage helpers
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { createPluginAPI } from './api';
import { closePluginWindows } from './window';
import { closePluginSettings, dropPluginSettings, setPluginSettingsStyle } from './settings';
import { pluginList, type PluginInfo } from './list-store';
import PluginList from './PluginList.svelte';

// Re-export the settings style setter (used by features/settings).
export { setPluginSettingsStyle };

// Loaded plugin instances, keyed by pluginId.
const loadedPlugins = new Map<string, any>();

// ============================================================================
// PLUGIN LOADING
// ============================================================================

export async function loadEnabledPlugins(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const plugins = await invoke('list_plugins');
    for (const plugin of plugins) {
      if (plugin.enabled && !plugin.has_error) {
        await loadPlugin(plugin.id, plugin.name);
      }
    }
  } catch (e) {
    console.error('Plugin loading failed:', e);
  }
}

async function loadPlugin(pluginId: string, pluginName: string): Promise<void> {
  if (loadedPlugins.has(pluginId)) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const code = await invoke('load_plugin_code', { pluginId });

    if (!code || code.trim().length === 0) {
      console.error('[Plugin Loader] No code loaded for:', pluginId);
      return;
    }

    const api = createPluginAPI(pluginId);

    // Einfaches Format: Plugin hat Zugriff auf 'api' und 'pluginId'
    // und gibt { init, cleanup } zurück
    const fn = new Function('api', 'pluginId', code);
    const instance = fn(api, pluginId);

    if (instance?.init) {
      await instance.init();
    } else {
      console.warn('[Plugin Loader] No init() function found');
    }

    loadedPlugins.set(pluginId, instance);
  } catch (e: any) {
    console.error(`[Plugin Loader] ${pluginId} Fehler:`, e);
    console.error('[Plugin Loader] Stack:', e?.stack);
  }
}

async function unloadPlugin(pluginId: string): Promise<void> {
  const instance = loadedPlugins.get(pluginId);
  if (instance?.cleanup) {
    try { await instance.cleanup(); } catch {}
  }
  loadedPlugins.delete(pluginId);
  // Tear down anything the plugin left behind so a disable/uninstall is clean.
  closePluginWindows(pluginId);
  dropPluginSettings(pluginId);
}

// ============================================================================
// UI RENDERING
// ============================================================================

export async function renderPluginList(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    pluginList.set([]);
    return;
  }
  try {
    const plugins = await invoke('list_plugins');
    pluginList.set(plugins || []);
  } catch (e) {
    console.error('Plugin list failed:', e);
    pluginList.set([]);
  }
}

// Mount the Svelte plugin list into its container exactly once.
let pluginListMounted = false;
function mountPluginList(): void {
  if (pluginListMounted) return;
  const el = document.getElementById('plugin-list');
  if (el) {
    pluginListMounted = true;
    el.innerHTML = '';
    new PluginList({ target: el });
  }
}

/** Enable/disable a plugin (called from the Svelte list). */
export async function togglePlugin(plugin: PluginInfo, enabled: boolean): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('set_plugin_enabled', { pluginId: plugin.id, enabled });
    if (enabled) {
      await loadPlugin(plugin.id, plugin.name);
      showNotification(`${plugin.name} aktiviert`);
    } else {
      await unloadPlugin(plugin.id);
      showNotification(`${plugin.name} deaktiviert`);
    }
  } catch (e) {
    showNotification('Fehler: ' + e);
  }
  // Refresh the store (also reverts the checkbox if the toggle failed).
  await renderPluginList();
}

/** Uninstall a plugin (called from the Svelte list). */
export async function deletePlugin(plugin: PluginInfo): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await unloadPlugin(plugin.id);
    await invoke('uninstall_plugin', { pluginId: plugin.id });
    showNotification(`${plugin.name} gelöscht`);
  } catch (e) {
    showNotification('Fehler: ' + e);
  }
  await renderPluginList();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

export function setupPluginListeners(): void {
  mountPluginList();

  // Open Folder
  document.getElementById('btn-plugins-folder')?.addEventListener('click', async () => {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_plugins_folder');
        showNotification('Plugin-Ordner geöffnet');
      } catch (e) { showNotification('Fehler: ' + e); }
    }
  });

  // Import ZIP
  document.getElementById('btn-import-plugin')?.addEventListener('click', async () => {
    if (!window.__TAURI__?.dialog) {
      showNotification('Dialog nicht verfügbar');
      return;
    }
    try {
      const path = await window.__TAURI__.dialog.open({
        multiple: false,
        filters: [{ name: 'Plugin', extensions: ['zip'] }],
      });
      if (path) {
        const invoke = getTauriInvoke();
        await invoke('install_plugin_from_zip', { zipPath: path });
        showNotification('Plugin installiert!');
        await renderPluginList();
      }
    } catch (e) { showNotification('Import fehlgeschlagen: ' + e); }
  });

  // Refresh
  document.getElementById('btn-refresh-plugins')?.addEventListener('click', async () => {
    await renderPluginList();
    showNotification('Liste aktualisiert');
  });

  // Modal Close
  document.querySelector('#plugin-settings-modal .modal-close')?.addEventListener('click', closePluginSettings);
  document.getElementById('plugin-settings-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'plugin-settings-modal') closePluginSettings();
  });

  // Panel Close
  document.getElementById('btn-close-plugin-panel')?.addEventListener('click', closePluginSettings);
}

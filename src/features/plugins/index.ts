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
import { t } from '../../utils/i18n';
import { createPluginAPI } from './api';
import { closePluginWindows, closePluginModals } from './window';
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
    const plugins = await invoke('list_plugins') as PluginInfo[];
    for (const plugin of plugins) {
      if (plugin.enabled && !plugin.has_error) {
        await loadPlugin(plugin);
      }
    }
  } catch (e) {
    console.error('Plugin loading failed:', e);
  }
}

async function loadPlugin(plugin: PluginInfo): Promise<void> {
  const pluginId = plugin.id;
  if (loadedPlugins.has(pluginId)) return;

  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const code = await invoke('load_plugin_code', { pluginId });

    if (!code || code.trim().length === 0) {
      console.error('[Plugin Loader] No code loaded for:', pluginId);
      return;
    }

    // Gate the API by the manifest permissions and hand the plugin its folder
    // path (for bundled files like a server.py it wants to pythonSpawn).
    const api = createPluginAPI(pluginId, {
      permissions: plugin.permissions,
      path: plugin.path,
    });

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
    // Surface the failure in the UI (not just the log) and keep it contained to
    // this plugin — a throwing plugin must not take down the manager.
    console.error(`[Plugin Loader] ${pluginId} Fehler:`, e);
    console.error('[Plugin Loader] Stack:', e?.stack);
    showNotification(
      t('notifications.pluginError', { name: pluginId, error: String(e?.message || e) },
        `Plugin "${pluginId}" Fehler: ${e?.message || e}`),
      { type: 'error' },
    );
  }
}

async function unloadPlugin(pluginId: string): Promise<void> {
  const instance = loadedPlugins.get(pluginId);
  if (instance?.cleanup) {
    try { await instance.cleanup(); } catch (e: any) {
      console.error(`[Plugin Loader] ${pluginId} cleanup Fehler:`, e);
    }
  }
  loadedPlugins.delete(pluginId);
  // Tear down anything the plugin left behind so a disable/uninstall is clean.
  closePluginWindows(pluginId);
  closePluginModals(pluginId);
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

// Human-readable labels for the sensitive permissions shown in the consent
// dialog when enabling a plugin.
const SENSITIVE_PERMISSIONS: Record<string, string> = {
  python: 'Python-Code ausführen (beliebige Programme)',
  http: 'Netzwerk-/HTTP-Zugriff',
  secrets: 'Zugriff auf gespeicherte Secrets',
  twitch: 'Twitch (Chat & Events lesen/senden)',
  window: 'Eigene Fenster/Modals öffnen',
};

/**
 * Ask the user to confirm a plugin's requested permissions before enabling it.
 * Only prompts for sensitive ones; returns true if there's nothing to confirm
 * or the dialog API is unavailable. Guards against malicious third-party plugins.
 */
async function confirmPluginPermissions(plugin: PluginInfo): Promise<boolean> {
  const sensitive = (plugin.permissions || []).filter((p) => p in SENSITIVE_PERMISSIONS);
  if (sensitive.length === 0) return true;

  const confirm = window.__TAURI__?.dialog?.confirm;
  if (!confirm) return true;

  const list = sensitive.map((p) => `• ${SENSITIVE_PERMISSIONS[p]}`).join('\n');
  const msg = `„${plugin.name}" fordert folgende Berechtigungen an:\n\n${list}\n\nJetzt aktivieren?`;
  try {
    return await confirm(msg, { title: 'Plugin aktivieren', type: 'warning' });
  } catch {
    return true;
  }
}

/** Enable/disable a plugin (called from the Svelte list). */
export async function togglePlugin(plugin: PluginInfo, enabled: boolean): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Consent gate: confirm sensitive permissions before enabling.
  if (enabled && !(await confirmPluginPermissions(plugin))) {
    await renderPluginList(); // revert the checkbox
    return;
  }

  try {
    await invoke('set_plugin_enabled', { pluginId: plugin.id, enabled });
    if (enabled) {
      await loadPlugin(plugin);
      showNotification(t('notifications.pluginEnabled', { name: plugin.name }, `${plugin.name} aktiviert`));
    } else {
      await unloadPlugin(plugin.id);
      showNotification(t('notifications.pluginDisabled', { name: plugin.name }, `${plugin.name} deaktiviert`));
    }
  } catch (e) {
    showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e));
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
    showNotification(t('notifications.pluginDeleted', { name: plugin.name }, `${plugin.name} gelöscht`));
  } catch (e) {
    showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e));
  }
  await renderPluginList();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Best-effort: run every loaded plugin's cleanup() when the window is tearing
// down (app close / reload). cleanup() may be async, but beforeunload can't
// await — the backend additionally kills any pythonSpawn'd daemons on exit.
let cleanupRegistered = false;
function registerCleanupOnExit(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  window.addEventListener('beforeunload', () => {
    for (const inst of loadedPlugins.values()) {
      try { inst?.cleanup?.(); } catch {}
    }
  });
}

export function setupPluginListeners(): void {
  mountPluginList();
  registerCleanupOnExit();

  // Open Folder
  document.getElementById('btn-plugins-folder')?.addEventListener('click', async () => {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_plugins_folder');
        showNotification(t('notifications.pluginFolderOpened', {}, 'Plugin-Ordner geöffnet'));
      } catch (e) { showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e)); }
    }
  });

  // Import ZIP
  document.getElementById('btn-import-plugin')?.addEventListener('click', async () => {
    if (!window.__TAURI__?.dialog) {
      showNotification(t('errors.dialogUnavailable', {}, 'Dialog nicht verfügbar'));
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
        showNotification(t('notifications.pluginInstalled', {}, 'Plugin installiert!'));
        await renderPluginList();
      }
    } catch (e) { showNotification(t('notifications.pluginImportFailed', { error: String(e) }, 'Import fehlgeschlagen: ' + e)); }
  });

  // Refresh
  document.getElementById('btn-refresh-plugins')?.addEventListener('click', async () => {
    await renderPluginList();
    showNotification(t('notifications.listRefreshed', {}, 'Liste aktualisiert'));
  });

  // Modal Close
  document.querySelector('#plugin-settings-modal .modal-close')?.addEventListener('click', closePluginSettings);
  document.getElementById('plugin-settings-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'plugin-settings-modal') closePluginSettings();
  });

  // Panel Close
  document.getElementById('btn-close-plugin-panel')?.addEventListener('click', closePluginSettings);
}

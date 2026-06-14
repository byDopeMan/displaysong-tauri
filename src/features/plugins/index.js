/**
 * Plugin System – public entry point.
 *
 * Loads enabled plugins, renders the management list, and wires up the
 * plugins-tab toolbar. The supporting concerns live in sibling modules:
 *   - api.js      the `api` object passed to each plugin
 *   - window.js   plugin-created floating windows
 *   - settings.js plugin settings modal/panel
 *   - storage.js  per-plugin localStorage helpers
 */

import { getTauriInvoke } from '../../core/tauri.js';
import { showNotification } from '../../ui/notifications.js';
import { escapeAttr } from '../../utils/format.js';
import { createPluginAPI } from './api.js';
import { closePluginWindows } from './window.js';
import {
  openPluginSettings,
  closePluginSettings,
  dropPluginSettings,
  setPluginSettingsStyle
} from './settings.js';

// Re-export the settings style setter (used by features/settings.js).
export { setPluginSettingsStyle };

// Loaded plugin instances, keyed by pluginId.
const loadedPlugins = new Map();

// ============================================================================
// PLUGIN LOADING
// ============================================================================

export async function loadEnabledPlugins() {
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

async function loadPlugin(pluginId, pluginName) {
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
  } catch (e) {
    console.error(`[Plugin Loader] ${pluginId} Fehler:`, e);
    console.error('[Plugin Loader] Stack:', e.stack);
  }
}

async function unloadPlugin(pluginId) {
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

export async function renderPluginList() {
  const container = document.getElementById('plugin-list');

  const invoke = getTauriInvoke();
  if (!invoke) {
    if (container) container.innerHTML = '<p class="hint">Plugins nicht verfügbar</p>';
    return;
  }

  try {
    const plugins = await invoke('list_plugins');

    if (!container) return;

    if (plugins.length === 0) {
      container.innerHTML = `
        <div class="plugins-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"></path>
          </svg>
          <p>Keine Plugins installiert</p>
          <p class="hint">Plugins in den Plugin-Ordner kopieren oder ZIP importieren</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    for (const plugin of plugins) {
      const card = document.createElement('div');
      card.className = `plugin-card ${plugin.enabled ? 'enabled' : ''} ${plugin.has_error ? 'error' : ''}`;

      card.innerHTML = `
        <div class="plugin-main">
          <div class="plugin-info">
            <span class="plugin-name">${escapeAttr(plugin.name)}</span>
            <span class="plugin-version">v${escapeAttr(plugin.version)}</span>
          </div>
          <div class="plugin-actions">
            <button class="plugin-btn plugin-settings" title="Einstellungen" ${!plugin.enabled ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button class="plugin-btn plugin-delete" title="Löschen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <label class="toggle-switch">
              <input type="checkbox" ${plugin.enabled ? 'checked' : ''} ${plugin.has_error ? 'disabled' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
        ${plugin.author ? `<div class="plugin-meta"><span class="plugin-author">von ${escapeAttr(plugin.author)}</span></div>` : ''}
        ${plugin.description ? `<div class="plugin-desc">${escapeAttr(plugin.description)}</div>` : ''}
        ${plugin.has_error ? `<div class="plugin-error">${escapeAttr(plugin.error_message)}</div>` : ''}
      `;

      // Settings Button
      card.querySelector('.plugin-settings')?.addEventListener('click', () => {
        openPluginSettings(plugin.id, plugin.name);
      });

      // Toggle
      const toggle = card.querySelector('input[type="checkbox"]');
      toggle?.addEventListener('change', async () => {
        try {
          await invoke('set_plugin_enabled', { pluginId: plugin.id, enabled: toggle.checked });
          if (toggle.checked) {
            await loadPlugin(plugin.id, plugin.name);
            showNotification(`${plugin.name} aktiviert`);
          } else {
            await unloadPlugin(plugin.id);
            showNotification(`${plugin.name} deaktiviert`);
          }
          card.classList.toggle('enabled', toggle.checked);
          const settingsBtn = card.querySelector('.plugin-settings');
          if (settingsBtn) settingsBtn.disabled = !toggle.checked;
        } catch (e) {
          toggle.checked = !toggle.checked;
          showNotification('Fehler: ' + e);
        }
      });

      // Delete
      card.querySelector('.plugin-delete')?.addEventListener('click', async () => {
        if (!confirm(`"${plugin.name}" wirklich löschen?`)) return;
        try {
          await unloadPlugin(plugin.id);
          await invoke('uninstall_plugin', { pluginId: plugin.id });
          showNotification(`${plugin.name} gelöscht`);
          await renderPluginList();
        } catch (e) {
          showNotification('Fehler: ' + e);
        }
      });

      container.appendChild(card);
    }
  } catch (e) {
    if (container) container.innerHTML = `<p class="error-text">Fehler: ${escapeAttr(String(e))}</p>`;
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

export function setupPluginListeners() {
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
        filters: [{ name: 'Plugin', extensions: ['zip'] }]
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
    if (e.target.id === 'plugin-settings-modal') closePluginSettings();
  });

  // Panel Close
  document.getElementById('btn-close-plugin-panel')?.addEventListener('click', closePluginSettings);
}

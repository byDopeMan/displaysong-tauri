/**
 * Plugin System - Manager, Loader & API
 */

import { getTauriInvoke } from '../core/tauri.js';
import { showNotification } from '../ui/notifications.js';

// Geladene Plugin-Instanzen
const loadedPlugins = new Map();

// Plugin-Anzahl für Tab-Sichtbarkeit
let pluginCount = 0;

// Registrierte Plugin-Settings Konfigurationen
const pluginSettingsConfigs = new Map();

// Aktuell geöffnetes Plugin im Modal
let currentModalPluginId = null;

// ============================================================================
// PLUGIN API - Was Plugins nutzen können
// ============================================================================

function createPluginAPI(pluginId) {
  const invoke = getTauriInvoke();
  
  return {
    // ==================== TRACK ====================
    async getTrack() {
      if (invoke) return await invoke('get_track');
      return null;
    },
    
    async getHistory() {
      if (invoke) return await invoke('get_track_history');
      return [];
    },
    
    onTrackChange(callback) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('track-update', (e) => callback(e.payload));
      }
      return () => {};
    },
    
    // ==================== UI ====================
    showNotification(msg) {
      showNotification(msg);
    },
    
    // ==================== DATA STORAGE ====================
    async storeData(key, value) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_store_data', { pluginId, key, value });
    },
    
    async getData(key) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_get_data', { pluginId, key });
    },
    
    async deleteData(key) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_delete_data', { pluginId, key });
    },
    
    // ==================== SECRETS (Keyring) ====================
    async storeSecret(key, value) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_store_secret', { pluginId, key, value });
    },
    
    async getSecret(key) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_get_secret', { pluginId, key });
    },
    
    async deleteSecret(key) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_delete_secret', { pluginId, key });
    },
    
    // ==================== HTTP REQUESTS ====================
    async httpRequest(method, url, options = {}) {
      if (!invoke) throw new Error('Backend not available');
      
      const result = await invoke('plugin_http_request', {
        pluginId,
        method,
        url,
        headers: options.headers || null,
        body: options.body || null
      });
      
      return {
        status: result.status,
        headers: result.headers,
        body: result.body,
        json() {
          return JSON.parse(result.body);
        }
      };
    },
    
    // ==================== EVENTS ====================
    on(event, callback) {
      window.addEventListener(`plugin:${event}`, (e) => callback(e.detail));
    },
    
    emit(event, data) {
      window.dispatchEvent(new CustomEvent(`plugin:${event}`, { detail: data }));
    },
    
    // ==================== UTILITIES ====================
    createElement(tag, attrs = {}, children = []) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v);
      }
      for (const child of children) {
        el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
      return el;
    },
    
    getLocalSetting(key, defaultValue = null) {
      try {
        const data = JSON.parse(localStorage.getItem(`plugin:${pluginId}`) || '{}');
        return data[key] ?? defaultValue;
      } catch {
        return defaultValue;
      }
    },
    
    setLocalSetting(key, value) {
      try {
        const data = JSON.parse(localStorage.getItem(`plugin:${pluginId}`) || '{}');
        data[key] = value;
        localStorage.setItem(`plugin:${pluginId}`, JSON.stringify(data));
      } catch (e) {
        console.error('Plugin setting save failed:', e);
      }
    },
    
    getPluginId() {
      return pluginId;
    },
    
    getAppVersion() {
      return '2.2.0';
    },
    
    // ==================== SETTINGS UI ====================
    /**
     * Registriert Settings für das Plugin (erscheinen im Settings-Modal)
     * 
     * config = {
     *   title: 'Plugin Name',
     *   icon: '<svg>...</svg>',  // optional
     *   fields: [
     *     { type: 'text', key: 'name', label: 'Name', placeholder: '...' },
     *     { type: 'password', key: 'token', label: 'Token' },
     *     { type: 'toggle', key: 'enabled', label: 'Aktiv', default: false },
     *     { type: 'select', key: 'mode', label: 'Modus', options: [{value, label}] },
     *     { type: 'button', label: 'Aktion', buttonText: 'Klick', onClick: () => {} },
     *     { type: 'info', label: 'Status', id: 'status', text: 'OK' }
     *   ]
     * }
     */
    registerSettings(config) {
      console.log('[Plugin API] registerSettings called for:', pluginId, config);
      pluginSettingsConfigs.set(pluginId, { ...config, pluginId });
      // Wenn Modal gerade offen ist für dieses Plugin, neu rendern
      if (currentModalPluginId === pluginId) {
        renderPluginSettingsModal(pluginId);
      }
    },
    
    updateSettingsInfo(fieldId, text) {
      const el = document.querySelector(`#plugin-modal-body [data-field="${fieldId}"]`);
      if (el) el.textContent = text;
    },
    
    unregisterSettings() {
      pluginSettingsConfigs.delete(pluginId);
      if (currentModalPluginId === pluginId) {
        closePluginSettingsModal();
      }
    }
  };
}

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
    
    console.log(`Plugins: ${loadedPlugins.size} geladen`);
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
    const api = createPluginAPI(pluginId);
    const fn = new Function('DisplaySong', code);
    const instance = fn({ api, pluginId });
    
    if (instance?.init) await instance.init();
    
    loadedPlugins.set(pluginId, instance);
    console.log(`Plugin geladen: ${pluginName}`);
  } catch (e) {
    console.error(`Plugin ${pluginId} Fehler:`, e);
  }
}

async function unloadPlugin(pluginId) {
  const instance = loadedPlugins.get(pluginId);
  if (instance?.cleanup) {
    try { await instance.cleanup(); } catch {}
  }
  loadedPlugins.delete(pluginId);
  pluginSettingsConfigs.delete(pluginId);
}

// ============================================================================
// PLUGIN SETTINGS MODAL
// ============================================================================

function openPluginSettingsModal(pluginId, pluginName) {
  currentModalPluginId = pluginId;
  
  const modal = document.getElementById('plugin-settings-modal');
  const title = document.getElementById('plugin-modal-title');
  
  if (title) title.textContent = `${pluginName} - Einstellungen`;
  
  renderPluginSettingsModal(pluginId);
  
  if (modal) modal.classList.remove('hidden');
}

function closePluginSettingsModal() {
  const modal = document.getElementById('plugin-settings-modal');
  if (modal) modal.classList.add('hidden');
  currentModalPluginId = null;
}

function renderPluginSettingsModal(pluginId) {
  const body = document.getElementById('plugin-modal-body');
  if (!body) return;
  
  const config = pluginSettingsConfigs.get(pluginId);
  
  if (!config || !config.fields || config.fields.length === 0) {
    body.innerHTML = `
      <div class="plugin-no-settings">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 16v-4M12 8h.01"></path>
        </svg>
        <p>Dieses Plugin hat keine Einstellungen</p>
      </div>
    `;
    return;
  }
  
  // Icon aktualisieren wenn vorhanden
  const iconEl = document.getElementById('plugin-modal-icon');
  if (iconEl && config.icon) {
    iconEl.innerHTML = config.icon;
  }
  
  // Fields rendern
  const fieldsHtml = config.fields.map(field => createSettingsFieldHtml(pluginId, field)).join('');
  body.innerHTML = `<div class="plugin-settings-fields">${fieldsHtml}</div>`;
  
  // Event Listener für Fields
  attachSettingsFieldListeners(pluginId, config.fields);
}

function createSettingsFieldHtml(pluginId, field) {
  const api = createPluginAPI(pluginId);
  
  switch (field.type) {
    case 'text':
    case 'password': {
      const savedValue = api.getLocalSetting(field.key, field.default || '');
      return `
        <div class="setting-row">
          <label>${esc(field.label)}</label>
          <input type="${field.type}" 
                 class="setting-input" 
                 data-key="${esc(field.key)}"
                 placeholder="${esc(field.placeholder || '')}"
                 value="${esc(savedValue)}">
        </div>
      `;
    }
    
    case 'toggle': {
      const checked = api.getLocalSetting(field.key, field.default || false);
      return `
        <div class="setting-row">
          <label>${esc(field.label)}</label>
          <input type="checkbox" class="setting-checkbox" data-key="${esc(field.key)}" ${checked ? 'checked' : ''}>
        </div>
      `;
    }
    
    case 'select': {
      const savedValue = api.getLocalSetting(field.key, field.default || '');
      const options = (field.options || []).map(opt => 
        `<option value="${esc(opt.value)}" ${opt.value === savedValue ? 'selected' : ''}>${esc(opt.label)}</option>`
      ).join('');
      return `
        <div class="setting-row">
          <label>${esc(field.label)}</label>
          <select class="setting-select" data-key="${esc(field.key)}">${options}</select>
        </div>
      `;
    }
    
    case 'button': {
      return `
        <div class="setting-row">
          <label>${esc(field.label || '')}</label>
          <button class="btn btn-secondary" data-action="${esc(field.key || 'button')}">${esc(field.buttonText || field.label)}</button>
        </div>
      `;
    }
    
    case 'info': {
      return `
        <div class="setting-row">
          <label>${esc(field.label || '')}</label>
          <span class="setting-info" data-field="${esc(field.id || '')}">${esc(field.text || '')}</span>
        </div>
      `;
    }
    
    default:
      return '';
  }
}

function attachSettingsFieldListeners(pluginId, fields) {
  const body = document.getElementById('plugin-modal-body');
  if (!body) return;
  
  const api = createPluginAPI(pluginId);
  
  for (const field of fields) {
    if (field.type === 'text' || field.type === 'password') {
      const input = body.querySelector(`input[data-key="${field.key}"]`);
      if (input) {
        input.addEventListener('change', () => {
          api.setLocalSetting(field.key, input.value);
          if (field.onChange) field.onChange(input.value);
        });
      }
    }
    
    if (field.type === 'toggle') {
      const checkbox = body.querySelector(`input[data-key="${field.key}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          api.setLocalSetting(field.key, checkbox.checked);
          if (field.onChange) field.onChange(checkbox.checked);
        });
      }
    }
    
    if (field.type === 'select') {
      const select = body.querySelector(`select[data-key="${field.key}"]`);
      if (select) {
        select.addEventListener('change', () => {
          api.setLocalSetting(field.key, select.value);
          if (field.onChange) field.onChange(select.value);
        });
      }
    }
    
    if (field.type === 'button') {
      const btn = body.querySelector(`button[data-action="${field.key || 'button'}"]`);
      if (btn && field.onClick) {
        btn.addEventListener('click', () => field.onClick());
      }
    }
  }
}

// ============================================================================
// UI RENDERING
// ============================================================================

export async function renderPluginList() {
  const container = document.getElementById('plugin-list');
  const pluginsTab = document.getElementById('plugins-tab');
  
  const invoke = getTauriInvoke();
  if (!invoke) {
    if (container) container.innerHTML = '<p class="hint">Plugins nicht verfügbar</p>';
    return;
  }
  
  try {
    const plugins = await invoke('list_plugins');
    pluginCount = plugins.length;
    
    if (pluginsTab) {
      pluginsTab.style.display = pluginCount > 0 ? '' : 'none';
    }
    
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
      const hasSettings = pluginSettingsConfigs.has(plugin.id);
      const card = document.createElement('div');
      card.className = `plugin-card ${plugin.enabled ? 'enabled' : ''} ${plugin.has_error ? 'error' : ''}`;
      
      card.innerHTML = `
        <div class="plugin-main">
          <div class="plugin-info">
            <span class="plugin-name">${esc(plugin.name)}</span>
            <span class="plugin-version">v${esc(plugin.version)}</span>
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
        ${plugin.author ? `<div class="plugin-meta"><span class="plugin-author">von ${esc(plugin.author)}</span></div>` : ''}
        ${plugin.description ? `<div class="plugin-desc">${esc(plugin.description)}</div>` : ''}
        ${plugin.has_error ? `<div class="plugin-error">${esc(plugin.error_message)}</div>` : ''}
      `;
      
      // Settings Button Handler
      card.querySelector('.plugin-settings')?.addEventListener('click', () => {
        openPluginSettingsModal(plugin.id, plugin.name);
      });
      
      // Toggle Handler
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
          
          // Settings button aktivieren/deaktivieren
          const settingsBtn = card.querySelector('.plugin-settings');
          if (settingsBtn) settingsBtn.disabled = !toggle.checked;
        } catch (e) {
          toggle.checked = !toggle.checked;
          showNotification('Fehler: ' + e);
        }
      });
      
      // Delete Handler
      card.querySelector('.plugin-delete')?.addEventListener('click', async () => {
        if (!confirm(`"${plugin.name}" wirklich löschen?`)) return;
        
        try {
          await unloadPlugin(plugin.id);
          await invoke('uninstall_plugin', { pluginId: plugin.id });
          card.remove();
          showNotification(`${plugin.name} gelöscht`);
          await renderPluginList();
        } catch (e) {
          showNotification('Fehler: ' + e);
        }
      });
      
      container.appendChild(card);
    }
  } catch (e) {
    if (container) container.innerHTML = `<p class="error-text">Fehler: ${e}</p>`;
  }
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
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
      } catch (e) {
        showNotification('Fehler: ' + e);
      }
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
    } catch (e) {
      showNotification('Import fehlgeschlagen: ' + e);
    }
  });
  
  // Refresh
  document.getElementById('btn-refresh-plugins')?.addEventListener('click', async () => {
    await renderPluginList();
    showNotification('Liste aktualisiert');
  });
  
  // Modal Close Button
  document.querySelector('#plugin-settings-modal .modal-close')?.addEventListener('click', () => {
    closePluginSettingsModal();
  });
  
  // Modal Backdrop Click
  document.getElementById('plugin-settings-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'plugin-settings-modal') {
      closePluginSettingsModal();
    }
  });
}

export function getPluginCount() {
  return pluginCount;
}

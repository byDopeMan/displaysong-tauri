/**
 * Plugin System - Manager, Loader & API
 */

import { getTauriInvoke } from '../core/tauri.js';
import { showNotification } from '../ui/notifications.js';

// Geladene Plugin-Instanzen
const loadedPlugins = new Map();

// Plugin Windows
const pluginWindows = new Map();
let windowIdCounter = 0;

// Plugin-Anzahl für Tab-Sichtbarkeit
let pluginCount = 0;

// Registrierte Plugin-Settings Konfigurationen
const pluginSettingsConfigs = new Map();

// Aktuell geöffnetes Plugin
let currentPluginId = null;

// Settings Style: 'modal' oder 'panel'
let settingsStyle = 'panel';


// ============================================================================
// PLUGIN WINDOW CLASS
// ============================================================================

/**
 * PluginWindow - Allows plugins to create their own windows
 * Uses a floating div with customizable content
 */
class PluginWindow {
  constructor(pluginId, options = {}) {
    this.pluginId = pluginId;
    this.windowId = `plugin-window-${pluginId}-${++windowIdCounter}`;
    this.options = {
      title: options.title || pluginId,
      width: options.width || 400,
      height: options.height || 300,
      html: options.html || '',
      resizable: options.resizable !== false,
      alwaysOnTop: options.alwaysOnTop || false,
      transparent: options.transparent || false,
      x: options.x || null,
      y: options.y || null,
      minWidth: options.minWidth || 200,
      minHeight: options.minHeight || 100,
    };
    
    this.element = null;
    this.contentElement = null;
    this.isVisible = false;
    this.isDragging = false;
    this.isResizing = false;
    
    pluginWindows.set(this.windowId, this);
  }
  
  /**
   * Show the window
   */
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
      return;
    }
    
    this._create();
    this.isVisible = true;
  }
  
  /**
   * Hide the window
   */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }
  
  /**
   * Close and destroy the window
   */
  close() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.contentElement = null;
      this.isVisible = false;
      pluginWindows.delete(this.windowId);
    }
  }
  
  /**
   * Set HTML content
   */
  setContent(html) {
    this.options.html = html;
    if (this.contentElement) {
      this.contentElement.innerHTML = html;
    }
  }
  
  /**
   * Get the content element for direct DOM manipulation
   */
  getContentElement() {
    return this.contentElement;
  }
  
  /**
   * Set window title
   */
  setTitle(title) {
    this.options.title = title;
    const titleEl = this.element?.querySelector('.plugin-window-title');
    if (titleEl) titleEl.textContent = title;
  }
  
  /**
   * Resize the window
   */
  setSize(width, height) {
    this.options.width = width;
    this.options.height = height;
    if (this.element) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';
    }
  }
  
  /**
   * Move the window
   */
  setPosition(x, y) {
    this.options.x = x;
    this.options.y = y;
    if (this.element) {
      this.element.style.left = x + 'px';
      this.element.style.top = y + 'px';
    }
  }
  
  /**
   * Internal: Create the window DOM
   */
  _create() {
    const win = document.createElement('div');
    win.id = this.windowId;
    win.className = 'plugin-window';
    if (this.options.transparent) win.classList.add('transparent');
    if (this.options.alwaysOnTop) win.classList.add('always-on-top');
    
    win.style.width = this.options.width + 'px';
    win.style.height = this.options.height + 'px';
    
    // Position
    if (this.options.x !== null) {
      win.style.left = this.options.x + 'px';
    } else {
      win.style.left = '50%';
      win.style.transform = 'translateX(-50%)';
    }
    if (this.options.y !== null) {
      win.style.top = this.options.y + 'px';
    } else {
      win.style.top = '100px';
    }
    
    win.innerHTML = `
      <div class="plugin-window-header" data-drag="true">
        <span class="plugin-window-title">${this._esc(this.options.title)}</span>
        <div class="plugin-window-controls">
          <button class="plugin-window-btn minimize" title="Minimieren">─</button>
          <button class="plugin-window-btn close" title="Schließen">✕</button>
        </div>
      </div>
      <div class="plugin-window-content"></div>
      ${this.options.resizable ? '<div class="plugin-window-resize"></div>' : ''}
    `;
    
    this.element = win;
    this.contentElement = win.querySelector('.plugin-window-content');
    this.contentElement.innerHTML = this.options.html;
    
    // Event handlers
    this._setupDrag(win);
    if (this.options.resizable) this._setupResize(win);
    
    win.querySelector('.plugin-window-btn.close')?.addEventListener('click', () => this.close());
    win.querySelector('.plugin-window-btn.minimize')?.addEventListener('click', () => this.hide());
    
    document.body.appendChild(win);
  }
  
  _setupDrag(win) {
    const header = win.querySelector('.plugin-window-header');
    let startX, startY, startLeft, startTop;
    
    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      win.style.left = (startLeft + dx) + 'px';
      win.style.top = (startTop + dy) + 'px';
      win.style.transform = 'none';
    };
    
    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('plugin-window-btn')) return;
      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = win.offsetLeft;
      startTop = win.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
  
  _setupResize(win) {
    const handle = win.querySelector('.plugin-window-resize');
    if (!handle) return;
    
    let startX, startY, startW, startH;
    
    const onMouseMove = (e) => {
      if (!this.isResizing) return;
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      win.style.width = Math.max(this.options.minWidth, startW + dw) + 'px';
      win.style.height = Math.max(this.options.minHeight, startH + dh) + 'px';
    };
    
    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    handle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }
  
  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}

// ============================================================================
// PLUGIN API
// ============================================================================

function createPluginAPI(pluginId) {
  const invoke = getTauriInvoke();
  
  return {
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
    
    showNotification(msg) {
      showNotification(msg);
    },
    
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
    
    async httpRequest(method, url, options = {}) {
      if (!invoke) throw new Error('Backend not available');
      const result = await invoke('plugin_http_request', {
        pluginId, method, url,
        headers: options.headers || null,
        body: options.body || null
      });
      return {
        status: result.status,
        headers: result.headers,
        body: result.body,
        json() { return JSON.parse(result.body); }
      };
    },
    
    on(event, callback) {
      window.addEventListener(`plugin:${event}`, (e) => callback(e.detail));
    },
    
    emit(event, data) {
      window.dispatchEvent(new CustomEvent(`plugin:${event}`, { detail: data }));
    },
    
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
      } catch { return defaultValue; }
    },
    
    setLocalSetting(key, value) {
      try {
        const data = JSON.parse(localStorage.getItem(`plugin:${pluginId}`) || '{}');
        data[key] = value;
        localStorage.setItem(`plugin:${pluginId}`, JSON.stringify(data));
      } catch (e) { console.error('Plugin setting save failed:', e); }
    },
    
    getPluginId() { return pluginId; },
    getAppVersion() { return '2.2.0'; },
    
    // Spotify Playback Control
    async addToQueue(spotifyUri) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('add_to_queue', { uri: spotifyUri });
    },
    
    async playTrack(spotifyUri) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('play_track', { uri: spotifyUri });
    },
    
    // ============================================================
    // PLUGIN WINDOW API
    // ============================================================
    
    /**
     * Create a plugin window/widget
     * @param {Object} options - Window configuration
     * @param {string} options.title - Window title
     * @param {number} options.width - Width in pixels (default: 400)
     * @param {number} options.height - Height in pixels (default: 300)
     * @param {string} options.html - HTML content for the window
     * @param {boolean} options.resizable - Allow resize (default: true)
     * @param {boolean} options.alwaysOnTop - Stay on top (default: false)
     * @param {boolean} options.transparent - Transparent background (default: false)
     * @returns {PluginWindow} Window controller
     */
    createWindow(options = {}) {
      return new PluginWindow(pluginId, options);
    },
    
    // ============================================================
    // TWITCH API (for plugins that want Twitch integration)
    // ============================================================
    
    /**
     * Listen for Twitch redemptions
     * @param {Function} callback - Called with redemption data
     */
    onTwitchRedemption(callback) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-redemption', (e) => callback(e.payload));
      }
      return () => {};
    },
    
    /**
     * Send a Twitch chat message
     * @param {string} message - Message to send
     */
    async sendTwitchChat(message) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('twitch_send_chat', { message });
    },
    
    /**
     * Get Twitch connection info
     */
    async getTwitchConnection() {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('twitch_get_connection');
    },
    
    // ============================================================
    // PYTHON API
    // ============================================================
    
    /**
     * Check if Python is available
     */
    async pythonAvailable() {
      if (!invoke) return false;
      return await invoke('python_available');
    },
    
    /**
     * Get Python version
     */
    async pythonVersion() {
      if (!invoke) return null;
      return await invoke('python_version');
    },
    
    /**
     * Run Python code
     * @param {string} code - Python code to execute
     * @returns {Object} { success, stdout, stderr, exit_code }
     */
    async pythonRun(code) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_run_code', { code });
    },
    
    /**
     * Run a Python script file
     * @param {string} scriptPath - Path to Python script
     * @param {string[]} args - Arguments to pass to script
     */
    async pythonRunScript(scriptPath, args = []) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_run_script', { scriptPath, args });
    },
    
    /**
     * Install a Python package via pip
     * @param {string} package - Package name to install
     */
    async pythonInstall(packageName) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_pip_install', { package: packageName });
    },
    
    /**
     * Check if a Python package is installed
     * @param {string} package - Package name to check
     */
    async pythonPackageInstalled(packageName) {
      if (!invoke) return false;
      return await invoke('python_package_installed', { package: packageName });
    },
    
    // Settings UI
    registerSettings(config) {
      pluginSettingsConfigs.set(pluginId, { ...config, pluginId });
      if (currentPluginId === pluginId) {
        renderPluginSettings(pluginId);
      }
    },
    
    updateSettingsInfo(fieldId, text) {
      const container = settingsStyle === 'modal' ? '#plugin-modal-body' : '#plugin-panel-body';
      const el = document.querySelector(`${container} [data-field="${fieldId}"]`);
      if (el) el.textContent = text;
    },
    
    unregisterSettings() {
      pluginSettingsConfigs.delete(pluginId);
      if (currentPluginId === pluginId) {
        closePluginSettings();
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
  pluginSettingsConfigs.delete(pluginId);
}

// ============================================================================
// PLUGIN SETTINGS (Modal & Panel)
// ============================================================================

export function setPluginSettingsStyle(style) {
  settingsStyle = style;
}

function openPluginSettings(pluginId, pluginName) {
  currentPluginId = pluginId;
  
  if (settingsStyle === 'modal') {
    // Modal öffnen
    const modal = document.getElementById('plugin-settings-modal');
    const title = document.getElementById('plugin-modal-title');
    if (title) title.textContent = `${pluginName} - Einstellungen`;
    renderPluginSettings(pluginId);
    if (modal) modal.classList.remove('hidden');
  } else {
    // Panel öffnen
    const panel = document.getElementById('plugin-settings-panel');
    const title = document.getElementById('plugin-panel-title');
    if (title) title.textContent = pluginName;
    renderPluginSettings(pluginId);
    if (panel) panel.classList.remove('hidden');
  }
}

function closePluginSettings() {
  if (settingsStyle === 'modal') {
    const modal = document.getElementById('plugin-settings-modal');
    if (modal) modal.classList.add('hidden');
  } else {
    const panel = document.getElementById('plugin-settings-panel');
    if (panel) panel.classList.add('hidden');
  }
  currentPluginId = null;
}

function renderPluginSettings(pluginId) {
  const bodyId = settingsStyle === 'modal' ? 'plugin-modal-body' : 'plugin-panel-body';
  const iconId = settingsStyle === 'modal' ? 'plugin-modal-icon' : 'plugin-panel-icon';
  
  const body = document.getElementById(bodyId);
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
  
  // Icon
  const iconEl = document.getElementById(iconId);
  if (iconEl && config.icon) {
    iconEl.innerHTML = config.icon;
  }
  
  // Fields
  const fieldsHtml = config.fields.map(field => createSettingsFieldHtml(pluginId, field)).join('');
  body.innerHTML = `<div class="plugin-settings-fields">${fieldsHtml}</div>`;
  
  attachSettingsFieldListeners(pluginId, config.fields, bodyId);
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
          <input type="${field.type}" class="setting-input" data-key="${esc(field.key)}"
                 placeholder="${esc(field.placeholder || '')}" value="${esc(savedValue)}">
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
    default: return '';
  }
}

function attachSettingsFieldListeners(pluginId, fields, bodyId) {
  const body = document.getElementById(bodyId);
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
    if (field.type === 'button' && field.onClick) {
      const btn = body.querySelector(`button[data-action="${field.key || 'button'}"]`);
      if (btn) btn.addEventListener('click', () => field.onClick());
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
          card.querySelector('.plugin-settings').disabled = !toggle.checked;
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

export function getPluginCount() {
  return pluginCount;
}


/**
 * The `api` object handed to every plugin's factory function. Wraps backend
 * commands, events, storage, windows and the settings UI behind a stable
 * surface so plugin code never touches Tauri internals directly.
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { PluginWindow, type PluginWindowOptions } from './window';
import { getLocalSetting, setLocalSetting } from './storage';
import {
  registerPluginSettings,
  unregisterPluginSettings,
  updateSettingsInfo,
} from './settings';

export function createPluginAPI(pluginId: string) {
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

    onTrackChange(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('track-update', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    showNotification(msg: string) {
      showNotification(msg);
    },

    async storeData(key: string, value: any) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_store_data', { pluginId, key, value });
    },

    async getData(key: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_get_data', { pluginId, key });
    },

    async deleteData(key: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_delete_data', { pluginId, key });
    },

    async storeSecret(key: string, value: any) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_store_secret', { pluginId, key, value });
    },

    async getSecret(key: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_get_secret', { pluginId, key });
    },

    async deleteSecret(key: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_delete_secret', { pluginId, key });
    },

    async httpRequest(method: string, url: string, options: any = {}) {
      if (!invoke) throw new Error('Backend not available');
      const result: any = await invoke('plugin_http_request', {
        pluginId, method, url,
        headers: options.headers || null,
        body: options.body || null,
      });
      return {
        status: result.status,
        headers: result.headers,
        body: result.body,
        json() { return JSON.parse(result.body); },
      };
    },

    on(event: string, callback: (detail: any) => void) {
      window.addEventListener(`plugin:${event}`, (e: any) => callback(e.detail));
    },

    emit(event: string, data: any) {
      window.dispatchEvent(new CustomEvent(`plugin:${event}`, { detail: data }));
    },

    createElement(tag: string, attrs: Record<string, any> = {}, children: any[] = []) {
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

    getLocalSetting(key: string, defaultValue: any = null) {
      return getLocalSetting(pluginId, key, defaultValue);
    },

    setLocalSetting(key: string, value: any) {
      setLocalSetting(pluginId, key, value);
    },

    getPluginId() { return pluginId; },
    getAppVersion() { return '2.2.0'; },

    // Spotify Playback Control
    async addToQueue(spotifyUri: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('add_to_queue', { uri: spotifyUri });
    },

    async playTrack(spotifyUri: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('play_track', { uri: spotifyUri });
    },

    // ============================================================
    // PLUGIN WINDOW API
    // ============================================================

    createWindow(options: PluginWindowOptions = {}) {
      return new PluginWindow(pluginId, options);
    },

    // ============================================================
    // TWITCH API (for plugins that want Twitch integration)
    // ============================================================

    onTwitchRedemption(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-redemption', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    async sendTwitchChat(message: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('twitch_send_chat', { message });
    },

    async getTwitchConnection() {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('twitch_get_connection');
    },

    // ============================================================
    // PYTHON API
    // ============================================================

    async pythonAvailable() {
      if (!invoke) return false;
      return await invoke('python_available');
    },

    async pythonVersion() {
      if (!invoke) return null;
      return await invoke('python_version');
    },

    async pythonRun(code: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_run_code', { code });
    },

    async pythonRunScript(scriptPath: string, args: any[] = []) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_run_script', { scriptPath, args });
    },

    async pythonInstall(packageName: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_pip_install', { package: packageName });
    },

    async pythonPackageInstalled(packageName: string) {
      if (!invoke) return false;
      return await invoke('python_package_installed', { package: packageName });
    },

    // ============================================================
    // SETTINGS UI
    // ============================================================

    registerSettings(config: any) {
      registerPluginSettings(pluginId, config);
    },

    updateSettingsInfo(fieldId: string, text: string) {
      updateSettingsInfo(fieldId, text);
    },

    unregisterSettings() {
      unregisterPluginSettings(pluginId);
    },
  };
}

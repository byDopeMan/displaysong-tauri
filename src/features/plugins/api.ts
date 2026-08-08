/**
 * The `api` object handed to every plugin's factory function. Wraps backend
 * commands, events, storage, windows and the settings UI behind a stable
 * surface so plugin code never touches Tauri internals directly.
 *
 * The surface is PERMISSION-GATED: a plugin only receives the methods its
 * manifest `permissions` allow (see PERMISSION_METHODS below). Calling a method
 * whose permission is missing throws a clear PermissionError instead of silently
 * doing nothing. Methods in ALWAYS_ALLOWED need no permission.
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { PluginWindow, PluginModal, type PluginWindowOptions, type PluginModalOptions } from './window';
import { getLocalSetting, setLocalSetting } from './storage';
import {
  registerPluginSettings,
  unregisterPluginSettings,
  updateSettingsInfo,
  registerSettingChange,
} from './settings';

/** Plugin API version (semver). Bump when the api surface changes; plugins can
 *  read api.apiVersion and use api.has(name) to degrade gracefully. */
const PLUGIN_API_VERSION = '1.2.0';

/** Global switch — set to false to hand plugins the full API ungated (dev). */
const ENFORCE_PERMISSIONS = true;

/** permission → the api methods it unlocks. */
const PERMISSION_METHODS: Record<string, string[]> = {
  track: ['getTrack', 'getHistory', 'onTrackChange', 'addToQueue', 'playTrack'],
  storage: ['storeData', 'getData', 'deleteData', 'getLocalSetting', 'setLocalSetting'],
  secrets: ['storeSecret', 'getSecret', 'deleteSecret'],
  http: ['httpRequest'],
  twitch: [
    'getTwitchConnection', 'sendTwitchChat', 'onTwitchRedemption',
    'onTwitchFollow', 'onTwitchSubscribe', 'onTwitchRaid', 'onTwitchCheer',
    'onChatMessage', 'getStreamInfo', 'onCategoryChange',
  ],
  window: ['createWindow', 'openModal'],
  python: [
    'pythonAvailable', 'pythonVersion', 'pythonRun', 'pythonRunScript',
    'pythonSpawn', 'pythonKill', 'pythonInstall', 'pythonPackageInstalled',
  ],
};

/** Methods every plugin gets regardless of declared permissions. */
const ALWAYS_ALLOWED = new Set([
  'registerSettings', 'updateSettingsInfo', 'unregisterSettings', 'onSettingChange',
  'showNotification', 'on', 'emit', 'getPluginId', 'getAppVersion', 'apiVersion', 'has',
  'createElement', 'getPluginPath', 'getDataPath', 'log', 'getFreePort', 'openExternal',
  '_devEmitTestEvent',
]);

/** Reverse map: method name → the permission it requires (built once). */
const METHOD_PERM: Record<string, string> = {};
for (const [perm, methods] of Object.entries(PERMISSION_METHODS)) {
  for (const m of methods) METHOD_PERM[m] = perm;
}

export interface PluginApiOptions {
  /** Permissions declared in the plugin's manifest. */
  permissions?: string[];
  /** Absolute path to the plugin's own folder (for bundled files). */
  path?: string;
}

export function createPluginAPI(pluginId: string, opts: PluginApiOptions = {}) {
  const invoke = getTauriInvoke();
  const pluginPath = opts.path || '';
  const dataPath = pluginPath ? `${pluginPath}/data` : '';
  const granted = new Set(opts.permissions || []);

  // Whether a given method is usable by this plugin (used by api.has()).
  const methodAllowed = (name: string): boolean =>
    !ENFORCE_PERMISSIONS || ALWAYS_ALLOWED.has(name) || !METHOD_PERM[name] || granted.has(METHOD_PERM[name]);

  const api = {
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

    // Plugin-API version + capability check, so a plugin can degrade gracefully
    // instead of crashing when a method is missing on an older build.
    apiVersion: PLUGIN_API_VERSION,
    has(name: string): boolean {
      return methodAllowed(name) && name in api;
    },

    // Write to the app log with a plugin-id prefix (visible even in release
    // builds, where DevTools/console isn't). level: 'info'|'warn'|'error'|'debug'.
    async log(level: string, message: string) {
      if (invoke) { try { await invoke('plugin_log', { pluginId, level, message }); } catch {} }
    },

    // A free localhost port for a plugin that runs its own server/daemon.
    async getFreePort() {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('get_free_port');
    },

    // Open a URL in the user's default browser (http/https only).
    async openExternal(url: string) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('plugin_open_external', { url });
    },

    // Called whenever ANY of this plugin's registered settings change.
    onSettingChange(callback: (key: string, value: any) => void) {
      registerSettingChange(pluginId, callback);
    },

    // Dev-only: fire a fake event through the real event channel (for testing
    // onTwitchFollow/Subscribe/Raid/Cheer/onChatMessage without live Twitch).
    async _devEmitTestEvent(event: string, payload: any) {
      if (invoke) return await invoke('emit_test_event', { event, payload });
    },

    // Absolute path to this plugin's folder / persistent data folder. Sync, so
    // plugins can build paths inline, e.g.
    //   api.pythonSpawn(api.getPluginPath() + '/server.py', ['--port','8777'])
    getPluginPath() { return pluginPath; },
    getDataPath() { return dataPath; },

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

    // Floating in-app window, OR — with { url } — a real OS window (call .show()).
    createWindow(options: PluginWindowOptions = {}) {
      return new PluginWindow(pluginId, options);
    },

    // Centered modal dialog (backdrop, internal scroll, ESC/X/click-outside).
    // Recommended for a plugin's own UI. Returns { getContentElement(), close() }.
    openModal(options: PluginModalOptions = {}) {
      return new PluginModal(pluginId, options);
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

    // Alert listeners — each returns an unlisten() function. Requires the
    // matching EventSub scope at Twitch authorization (Follow/Sub/Cheer);
    // check api.getTwitchConnection().scopes to tell the user what's missing.
    onTwitchFollow(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-follow', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    onTwitchSubscribe(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-subscribe', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    onTwitchRaid(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-raid', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    onTwitchCheer(callback: (payload: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-cheer', (e: any) => callback(e.payload));
      }
      return () => {};
    },

    // Read-only chat listener — reuses DisplaySong's existing chat connection so
    // plugins don't open a second IRC session. Payload: { user_id, user,
    // message, badges, is_mod, is_sub, is_vip, is_broadcaster }. Chat must be
    // connected (request mode "commands").
    onChatMessage(callback: (msg: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-chat-message', (e: any) => callback(e.payload));
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

    // Current stream category/title + live state:
    // { category_id, category_name, title, is_live }
    async getStreamInfo() {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('twitch_get_stream_info');
    },

    // Fires when the stream category/title changes (EventSub channel.update).
    // Payload: { category_id, category_name, title }.
    onCategoryChange(callback: (info: any) => void) {
      if (window.__TAURI__?.event) {
        return window.__TAURI__.event.listen('twitch-category-change', (e: any) => callback(e.payload));
      }
      return () => {};
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

    // Start a long-running Python script (daemon). Returns the pid immediately
    // (unlike pythonRunScript, which waits for the process to finish). Stop it
    // with pythonKill(pid) in cleanup(); the app also kills leftovers on exit.
    async pythonSpawn(scriptPath: string, args: any[] = []) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_spawn', { scriptPath, args });
    },

    async pythonKill(pid: number) {
      if (!invoke) throw new Error('Backend not available');
      return await invoke('python_kill', { pid });
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

  return enforcePermissions(api, pluginId, opts.permissions);
}

/**
 * Return a copy of `api` where every permission-gated method the plugin did not
 * declare is replaced by a thrower. Always-allowed methods and non-functions
 * pass through untouched.
 */
function enforcePermissions<T extends Record<string, any>>(
  api: T,
  pluginId: string,
  granted?: string[],
): T {
  if (!ENFORCE_PERMISSIONS) return api;

  const grantedSet = new Set(granted || []);

  const guarded: Record<string, any> = {};
  for (const key of Object.keys(api)) {
    const val = api[key];
    const perm = METHOD_PERM[key];
    if (typeof val !== 'function' || ALWAYS_ALLOWED.has(key) || !perm || grantedSet.has(perm)) {
      guarded[key] = val;
    } else {
      guarded[key] = () => {
        throw new Error(
          `PermissionError: Plugin "${pluginId}" nutzt api.${key}, ` +
          `aber Permission "${perm}" fehlt im manifest`,
        );
      };
    }
  }
  return guarded as T;
}

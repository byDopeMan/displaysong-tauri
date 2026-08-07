/**
 * Plugin settings UI – renders a plugin's registered settings into either a
 * modal or a side panel, and persists changes to the plugin's local bucket.
 *
 * Owns the settings-related shared state (registered configs, the currently
 * open plugin, and the modal-vs-panel style). The plugin API (api.ts) drives
 * this via registerPluginSettings / unregisterPluginSettings / updateSettingsInfo.
 */

import { escapeAttr } from '../../utils/format';
import { getLocalSetting, setLocalSetting } from './storage';

interface PluginField {
  type: 'text' | 'password' | 'toggle' | 'select' | 'button' | 'info';
  key?: string;
  label?: string;
  placeholder?: string;
  default?: any;
  options?: { value: string; label: string }[];
  buttonText?: string;
  id?: string;
  text?: string;
  onChange?: (value: any) => void;
  onClick?: () => void;
}

interface PluginSettingsConfig {
  fields?: PluginField[];
  icon?: string;
  pluginId?: string;
}

// Registered settings configs, keyed by pluginId.
const pluginSettingsConfigs = new Map<string, PluginSettingsConfig>();

// Currently open plugin's id (null when no settings are open).
let currentPluginId: string | null = null;

// Settings presentation: 'modal' (default — a centered dialog like the app's
// other modals) or 'panel' (legacy inline panel appended to the settings page).
let settingsStyle = 'modal';

export function setPluginSettingsStyle(style: string): void {
  settingsStyle = style;
}

// Per-plugin "any setting changed" callbacks (api.onSettingChange).
const settingChangeCallbacks = new Map<string, ((key: string, value: any) => void)[]>();

export function registerSettingChange(pluginId: string, cb: (key: string, value: any) => void): void {
  const list = settingChangeCallbacks.get(pluginId) || [];
  list.push(cb);
  settingChangeCallbacks.set(pluginId, list);
}

function fireSettingChange(pluginId: string, key: string, value: any): void {
  const list = settingChangeCallbacks.get(pluginId);
  if (!list) return;
  for (const cb of list) {
    try { cb(key, value); } catch (e) { console.error('[plugin onSettingChange]', e); }
  }
}

// ---------------------------------------------------------------------------
// API-facing hooks (called from createPluginAPI)
// ---------------------------------------------------------------------------

export function registerPluginSettings(pluginId: string, config: PluginSettingsConfig): void {
  pluginSettingsConfigs.set(pluginId, { ...config, pluginId });
  if (currentPluginId === pluginId) {
    renderPluginSettings(pluginId);
  }
}

export function unregisterPluginSettings(pluginId: string): void {
  pluginSettingsConfigs.delete(pluginId);
  if (currentPluginId === pluginId) {
    closePluginSettings();
  }
}

export function updateSettingsInfo(fieldId: string, text: string): void {
  const container = settingsStyle === 'modal' ? '#plugin-modal-body' : '#plugin-panel-body';
  const el = document.querySelector(`${container} [data-field="${fieldId}"]`);
  if (el) el.textContent = text;
}

/** Drop a plugin's registered config (used by the loader on unload). */
export function dropPluginSettings(pluginId: string): void {
  pluginSettingsConfigs.delete(pluginId);
  settingChangeCallbacks.delete(pluginId);
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

export function openPluginSettings(pluginId: string, pluginName: string): void {
  currentPluginId = pluginId;

  if (settingsStyle === 'modal') {
    const modal = document.getElementById('plugin-settings-modal');
    const title = document.getElementById('plugin-modal-title');
    if (title) title.textContent = `${pluginName} - Einstellungen`;
    renderPluginSettings(pluginId);
    if (modal) modal.classList.remove('hidden');
  } else {
    const panel = document.getElementById('plugin-settings-panel');
    const title = document.getElementById('plugin-panel-title');
    if (title) title.textContent = pluginName;
    renderPluginSettings(pluginId);
    if (panel) panel.classList.remove('hidden');
  }
}

export function closePluginSettings(): void {
  if (settingsStyle === 'modal') {
    const modal = document.getElementById('plugin-settings-modal');
    if (modal) modal.classList.add('hidden');
  } else {
    const panel = document.getElementById('plugin-settings-panel');
    if (panel) panel.classList.add('hidden');
  }
  currentPluginId = null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPluginSettings(pluginId: string): void {
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
  const fieldsHtml = config.fields.map((field) => createSettingsFieldHtml(pluginId, field)).join('');
  body.innerHTML = `<div class="plugin-settings-fields">${fieldsHtml}</div>`;

  attachSettingsFieldListeners(pluginId, config.fields, bodyId);
}

function createSettingsFieldHtml(pluginId: string, field: PluginField): string {
  switch (field.type) {
    case 'text':
    case 'password': {
      const savedValue = getLocalSetting(pluginId, field.key || '', field.default || '');
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label)}</label>
          <input type="${field.type}" class="setting-input" data-key="${escapeAttr(field.key)}"
                 placeholder="${escapeAttr(field.placeholder || '')}" value="${escapeAttr(savedValue)}">
        </div>
      `;
    }
    case 'toggle': {
      const checked = getLocalSetting(pluginId, field.key || '', field.default || false);
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label)}</label>
          <input type="checkbox" class="setting-checkbox" data-key="${escapeAttr(field.key)}" ${checked ? 'checked' : ''}>
        </div>
      `;
    }
    case 'select': {
      const savedValue = getLocalSetting(pluginId, field.key || '', field.default || '');
      const options = (field.options || []).map((opt) =>
        `<option value="${escapeAttr(opt.value)}" ${opt.value === savedValue ? 'selected' : ''}>${escapeAttr(opt.label)}</option>`
      ).join('');
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label)}</label>
          <select class="setting-select" data-key="${escapeAttr(field.key)}">${options}</select>
        </div>
      `;
    }
    case 'button': {
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label || '')}</label>
          <button class="btn btn-secondary" data-action="${escapeAttr(field.key || 'button')}">${escapeAttr(field.buttonText || field.label)}</button>
        </div>
      `;
    }
    case 'info': {
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label || '')}</label>
          <span class="setting-info" data-field="${escapeAttr(field.id || '')}">${escapeAttr(field.text || '')}</span>
        </div>
      `;
    }
    default: return '';
  }
}

function attachSettingsFieldListeners(pluginId: string, fields: PluginField[], bodyId: string): void {
  const body = document.getElementById(bodyId);
  if (!body) return;

  for (const field of fields) {
    if (field.type === 'text' || field.type === 'password') {
      const input = body.querySelector(`input[data-key="${field.key}"]`) as HTMLInputElement | null;
      if (input) {
        input.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key || '', input.value);
          if (field.onChange) field.onChange(input.value);
          fireSettingChange(pluginId, field.key || '', input.value);
        });
      }
    }
    if (field.type === 'toggle') {
      const checkbox = body.querySelector(`input[data-key="${field.key}"]`) as HTMLInputElement | null;
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key || '', checkbox.checked);
          if (field.onChange) field.onChange(checkbox.checked);
          fireSettingChange(pluginId, field.key || '', checkbox.checked);
        });
      }
    }
    if (field.type === 'select') {
      const select = body.querySelector(`select[data-key="${field.key}"]`) as HTMLSelectElement | null;
      if (select) {
        select.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key || '', select.value);
          if (field.onChange) field.onChange(select.value);
          fireSettingChange(pluginId, field.key || '', select.value);
        });
      }
    }
    if (field.type === 'button' && field.onClick) {
      const btn = body.querySelector(`button[data-action="${field.key || 'button'}"]`);
      if (btn) btn.addEventListener('click', () => field.onClick && field.onClick());
    }
  }
}

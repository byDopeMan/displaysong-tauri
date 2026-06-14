/**
 * Plugin settings UI – renders a plugin's registered settings into either a
 * modal or a side panel, and persists changes to the plugin's local bucket.
 *
 * Owns the settings-related shared state (registered configs, the currently
 * open plugin, and the modal-vs-panel style). The plugin API (api.js) drives
 * this via registerPluginSettings / unregisterPluginSettings / updateSettingsInfo.
 */

import { escapeAttr } from '../../utils/format.js';
import { getLocalSetting, setLocalSetting } from './storage.js';

// Registered settings configs, keyed by pluginId.
const pluginSettingsConfigs = new Map();

// Currently open plugin's id (null when no settings are open).
let currentPluginId = null;

// Settings presentation: 'modal' or 'panel'.
let settingsStyle = 'panel';

export function setPluginSettingsStyle(style) {
  settingsStyle = style;
}

// ---------------------------------------------------------------------------
// API-facing hooks (called from createPluginAPI)
// ---------------------------------------------------------------------------

export function registerPluginSettings(pluginId, config) {
  pluginSettingsConfigs.set(pluginId, { ...config, pluginId });
  if (currentPluginId === pluginId) {
    renderPluginSettings(pluginId);
  }
}

export function unregisterPluginSettings(pluginId) {
  pluginSettingsConfigs.delete(pluginId);
  if (currentPluginId === pluginId) {
    closePluginSettings();
  }
}

export function updateSettingsInfo(fieldId, text) {
  const container = settingsStyle === 'modal' ? '#plugin-modal-body' : '#plugin-panel-body';
  const el = document.querySelector(`${container} [data-field="${fieldId}"]`);
  if (el) el.textContent = text;
}

/** Drop a plugin's registered config (used by the loader on unload). */
export function dropPluginSettings(pluginId) {
  pluginSettingsConfigs.delete(pluginId);
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

export function openPluginSettings(pluginId, pluginName) {
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

export function closePluginSettings() {
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
  switch (field.type) {
    case 'text':
    case 'password': {
      const savedValue = getLocalSetting(pluginId, field.key, field.default || '');
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label)}</label>
          <input type="${field.type}" class="setting-input" data-key="${escapeAttr(field.key)}"
                 placeholder="${escapeAttr(field.placeholder || '')}" value="${escapeAttr(savedValue)}">
        </div>
      `;
    }
    case 'toggle': {
      const checked = getLocalSetting(pluginId, field.key, field.default || false);
      return `
        <div class="setting-row">
          <label>${escapeAttr(field.label)}</label>
          <input type="checkbox" class="setting-checkbox" data-key="${escapeAttr(field.key)}" ${checked ? 'checked' : ''}>
        </div>
      `;
    }
    case 'select': {
      const savedValue = getLocalSetting(pluginId, field.key, field.default || '');
      const options = (field.options || []).map(opt =>
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

function attachSettingsFieldListeners(pluginId, fields, bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;

  for (const field of fields) {
    if (field.type === 'text' || field.type === 'password') {
      const input = body.querySelector(`input[data-key="${field.key}"]`);
      if (input) {
        input.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key, input.value);
          if (field.onChange) field.onChange(input.value);
        });
      }
    }
    if (field.type === 'toggle') {
      const checkbox = body.querySelector(`input[data-key="${field.key}"]`);
      if (checkbox) {
        checkbox.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key, checkbox.checked);
          if (field.onChange) field.onChange(checkbox.checked);
        });
      }
    }
    if (field.type === 'select') {
      const select = body.querySelector(`select[data-key="${field.key}"]`);
      if (select) {
        select.addEventListener('change', () => {
          setLocalSetting(pluginId, field.key, select.value);
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

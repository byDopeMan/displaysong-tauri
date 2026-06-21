/**
 * Settings Management
 *
 * Logic layer for app settings. The "Widget-Verhalten", "Aussehen" and "Über"
 * sections of the settings view are rendered by Svelte components
 * (WidgetBehavior.svelte, Appearance.svelte) that read settingsStore and call
 * back into the helpers here; the remaining sections (connections, Twitch,
 * System) are still plain HTML wired up in setupSettingsListeners().
 */

import { getItem, setItem } from '../../utils/storage';
import { hexToRgb, type Rgb } from '../../utils/format';
import { getTauriInvoke, getTauriWebviewWindow } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { t } from '../../utils/i18n';
import { broadcastAccentColor } from '../widgets';
import { updateTabVisibility } from '../../ui/navigation';
import { setPluginSettingsStyle } from '../plugins/index';
import { settingsStore, DEFAULT_SETTINGS, type AppSettings } from './store';

export type { AppSettings } from './store';
export { DEFAULT_SETTINGS, settingsStore } from './store';

export let settings: AppSettings = { ...DEFAULT_SETTINGS };

export const ACCENT_COLORS: Record<string, Rgb> = {
  spotify: { r: 29, g: 185, b: 84 },
  blue: { r: 59, g: 130, b: 246 },
  purple: { r: 139, g: 92, b: 246 },
  pink: { r: 236, g: 72, b: 153 },
  orange: { r: 249, g: 115, b: 22 },
  red: { r: 239, g: 68, b: 68 },
};

/** Get current accent color as RGB */
export function getCurrentAccentColor(): Rgb {
  if (settings.accentColor === 'custom') {
    return hexToRgb(settings.customAccentColor);
  }
  return ACCENT_COLORS[settings.accentColor] || ACCENT_COLORS.spotify;
}

/** Load settings from localStorage */
export function loadSettings(): void {
  try {
    const saved = getItem<Partial<AppSettings>>('displaysong-settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) {
    console.error('Load settings failed:', e);
  }
  settingsStore.set(settings);
  applySettings();
}

/** Save settings to localStorage */
export function saveSettings(): void {
  setItem('displaysong-settings', settings);
}

/**
 * Mutate the shared settings object and notify the reactive store. Called by the
 * Svelte settings components on every change so both worlds stay in sync.
 */
export function updateSettings(patch: Partial<AppSettings>): void {
  Object.assign(settings, patch);
  settingsStore.set(settings);
}

/** Apply settings side effects (theme, accent, widget broadcasts, tabs). */
export function applySettings(): void {
  document.documentElement.setAttribute('data-theme', settings.theme);

  const color = getCurrentAccentColor();
  document.documentElement.style.setProperty('--accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
  document.documentElement.style.setProperty('--accent-rgb', `${color.r}, ${color.g}, ${color.b}`);

  // Plugin settings rendering style (panel vs modal).
  setPluginSettingsStyle(settings.pluginSettingsStyle || 'panel');

  // The Designs-tab widget toggles are rendered by Designs.svelte now; still
  // mirror the requester/auto-hide settings to localStorage + broadcast at load
  // so the widget windows pick them up on startup.
  const showRequester = settings.showRequesterWidgets || false;
  localStorage.setItem('widget-show-requester', String(showRequester));
  try { window.__TAURI__?.event?.emit('requester-visibility-change', { enabled: showRequester }); } catch (e) {}

  const autoHide = settings.autoHideWidgets || false;
  localStorage.setItem('widget-autohide', String(autoHide));
  try { window.__TAURI__?.event?.emit('autohide-change', { enabled: autoHide }); } catch (e) {}

  updateTabVisibility();
  updateGlobalBackground();
  applyWidgetOpacity();
}

/** Update global background visibility based on player tab setting */
export function updateGlobalBackground(): void {
  const globalBg = document.getElementById('global-cover-bg');
  if (!globalBg) return;

  if (settings.showPlayerTab === false) {
    globalBg.classList.add('visible');
  } else {
    globalBg.classList.remove('visible');
  }
}

/** Apply widget opacity */
export async function applyWidgetOpacity(): Promise<void> {
  const WebviewWindow = getTauriWebviewWindow();
  if (!WebviewWindow) return;

  const widgetLabels = ['widget-1', 'widget-2', 'widget-custom1', 'widget-custom2'];
  const opacity = settings.widgetOpacity / 100;

  for (const label of widgetLabels) {
    try {
      const widget = WebviewWindow.getByLabel(label);
      if (widget) {
        const invoke = getTauriInvoke();
        if (invoke) await invoke('set_widget_opacity', { label, opacity });
      }
    } catch (e) {}
  }
}

/**
 * Setup listeners for the settings-view sections that are NOT Svelte components
 * yet (connections, Twitch, System) plus the shared modal/close behaviour.
 */
export function setupSettingsListeners(): void {
  // NOTE: the System section (provider select, source priority, autostart) is
  // rendered by SystemSettings.svelte; the Designs-tab toggles are wired in
  // features/designs/Designs.svelte.

  // Generic modal close (changelog / licenses / blocklist).
  document.querySelectorAll<HTMLElement>('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) document.getElementById(modalId)?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  // Twitch Bot-Toggle (Twitch section, still static).
  const twitchUseBotSelect = document.getElementById('twitch-use-bot') as HTMLSelectElement | null;
  if (twitchUseBotSelect) {
    twitchUseBotSelect.addEventListener('change', async () => {
      const useBot = twitchUseBotSelect.value === 'true';
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          await invoke('twitch_set_use_bot', { useBot });
          showNotification(useBot ? 'Bot-Account aktiviert' : 'Eigener Account aktiviert');
        } catch (e) {
          showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e), { type: 'error' });
        }
      }
    });
  }
}

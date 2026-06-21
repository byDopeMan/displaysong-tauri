/**
 * Widget Management - Simple Show/Hide
 */

import { state } from '../core/state';
import { getTauriInvoke, getTauriWebviewWindow, getTauriPhysicalPosition, getTauriPhysicalSize } from '../core/tauri';
import { getItem, setItem } from '../utils/storage';
import { settings, getCurrentAccentColor } from './settings';
import { showNotification } from '../ui/notifications';
import { t } from '../utils/i18n';
import { activeWidgets } from './designs/store';

export const WIDGET_NAMES: Record<string, string> = {
  'widget-1': 'Compact Bar',
  'widget-2': 'Album Focus',
  'widget-custom1': 'Custom 1',
  'widget-custom2': 'Custom 2',
};

/** Load widget positions from storage */
export function loadWidgetPositions(): void {
  try {
    const saved = getItem('displaysong-widget-positions');
    if (saved) state.widgetPositions = saved;
  } catch (e) {
    console.error('Load widget positions failed:', e);
  }
}

/** Save widget positions to storage */
function saveWidgetPositions(): void {
  setItem('displaysong-widget-positions', state.widgetPositions);
}

/** Save a single widget position */
export async function saveWidgetPosition(widgetLabel: string): Promise<void> {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow) return;

    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      const position = await widget.outerPosition();
      const size = await widget.outerSize();
      state.widgetPositions[widgetLabel] = {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };
      saveWidgetPositions();
    }
  } catch (e) {
    console.error('Save widget position failed:', e);
  }
}

/** Restore a widget position */
export async function restoreWidgetPosition(widgetLabel: string): Promise<void> {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow || !settings.rememberPositions) return;

    const pos = state.widgetPositions[widgetLabel];
    if (!pos) return;

    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      const PhysicalPosition = getTauriPhysicalPosition();
      const PhysicalSize = getTauriPhysicalSize();

      if (PhysicalPosition) await widget.setPosition(new PhysicalPosition(pos.x, pos.y));
      if (PhysicalSize && pos.width && pos.height) {
        await widget.setSize(new PhysicalSize(pos.width, pos.height));
      }
    }
  } catch (e) {
    console.error('Restore widget position failed:', e);
  }
}

/** Show widget */
export async function showWidget(widgetLabel: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('show_widget', { widgetLabel });

    state.activeWidgets.add(widgetLabel);
    updateWidgetList();

    // Position wiederherstellen
    await restoreWidgetPosition(widgetLabel);

    // Akzentfarbe senden
    setTimeout(() => sendAccentColorToWidget(widgetLabel), 100);
  } catch (e) {
    console.error('Show widget error:', e);
    showNotification(t('notifications.widgetOpenFailed', {}, 'Widget konnte nicht geöffnet werden'));
  }
}

/** Hide widget */
export async function hideWidget(widgetLabel: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    // Position speichern vor dem Hide
    if (settings.rememberPositions) {
      await saveWidgetPosition(widgetLabel);
    }

    await invoke('hide_widget', { widgetLabel });

    state.activeWidgets.delete(widgetLabel);
    updateWidgetList();
  } catch (e) {
    console.error('Hide widget error:', e);
  }
}

/** Toggle widget visibility */
export async function toggleWidget(widgetLabel: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const isVisible = await invoke('is_widget_visible', { widgetLabel });

    if (isVisible) {
      await hideWidget(widgetLabel);
    } else {
      await showWidget(widgetLabel);
    }
  } catch (e) {
    console.error('Toggle widget error:', e);
  }
}

/** Auto-show widgets on startup */
export async function autoShowWidgets(): Promise<void> {
  if (!settings.autoShowWidgets) return;

  try {
    const saved = getItem<string[]>('displaysong-active-widgets');
    if (saved && Array.isArray(saved)) {
      for (const widgetLabel of saved) {
        await showWidget(widgetLabel);
      }
    }
  } catch (e) {
    console.error('Auto show widgets failed:', e);
  }
}

/** Sync active widgets state with backend */
export async function syncActiveWidgets(): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    const visibleWidgets = await invoke('get_visible_widgets');
    state.activeWidgets = new Set(visibleWidgets);
    updateWidgetList();
  } catch (e) {
    console.error('Sync active widgets failed:', e);
  }
}

/** Save active widgets list */
function saveActiveWidgets(): void {
  setItem('displaysong-active-widgets', Array.from(state.activeWidgets));
}

/** Publish the active-widgets list to the store (rendered by Designs.svelte). */
export function updateWidgetList(): void {
  if (settings.autoShowWidgets) saveActiveWidgets();
  activeWidgets.set(Array.from(state.activeWidgets));
}

/** Send accent color to widget */
export async function sendAccentColorToWidget(widgetLabel: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Prüfen ob Widget sichtbar ist
  try {
    const isVisible = await invoke('is_widget_visible', { widgetLabel });
    if (!isVisible) return;
  } catch (e) {
    return;
  }

  const useAccent = settings.widgetAccentColors?.[widgetLabel] || false;
  const isCustomWidget = widgetLabel.includes('custom');

  if (!useAccent && !isCustomWidget) return;

  const color = getCurrentAccentColor();
  try {
    await invoke('send_accent_to_widget', {
      label: widgetLabel,
      r: color.r,
      g: color.g,
      b: color.b,
    });
  } catch (e) {
    /* best-effort */
  }
}

/** Reset widget to track color */
export async function resetWidgetToTrackColor(widgetLabel: string): Promise<void> {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('reset_widget_accent', { label: widgetLabel });
  } catch (e) {
    /* best-effort */
  }
}

/** Broadcast accent color to all active widgets */
export async function broadcastAccentColor(): Promise<void> {
  for (const widgetLabel of state.activeWidgets) {
    await sendAccentColorToWidget(widgetLabel);
  }
}

/** Open config folder */
export async function openConfigFolder(): Promise<void> {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) {
      showNotification(t('errors.tauriUnavailable', {}, 'Tauri nicht verfügbar'));
      return;
    }
    await invoke('open_config_folder');
    showNotification(t('notifications.folderOpened', {}, 'Ordner geöffnet'));
  } catch (e) {
    console.error('Open folder failed:', e);
    showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e));
  }
}

/** Reload all widgets */
export async function reloadWidgets(): Promise<void> {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) {
      showNotification(t('errors.tauriUnavailable', {}, 'Tauri nicht verfügbar'));
      return;
    }
    await invoke('reload_widgets');
    showNotification(t('notifications.widgetsReloaded', {}, 'Widgets neu geladen!'));
  } catch (e) {
    console.error('Reload widgets failed:', e);
    showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e));
  }
}

/** Close all widgets */
export async function closeAllWidgets(): Promise<void> {
  const widgets = Array.from(state.activeWidgets);
  for (const widgetLabel of widgets) {
    await hideWidget(widgetLabel);
  }
}

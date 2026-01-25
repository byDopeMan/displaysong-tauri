/**
 * Settings Management
 */

import { getItem, setItem } from '../utils/storage.js';
import { hexToRgb } from '../utils/format.js';
import { getTauriInvoke, getTauriWebviewWindow } from '../core/tauri.js';
import { showNotification } from '../ui/notifications.js';
import { broadcastAccentColor } from './widgets.js';
import { updateTabVisibility } from '../ui/navigation.js';

export const DEFAULT_SETTINGS = {
  pollingInterval: 2000,
  autoShowWidgets: false,
  rememberPositions: false,
  theme: 'dark',
  accentColor: 'spotify',
  customAccentColor: '#1db954',
  showPlayerTab: true,
  showHistoryTab: true,
  historyLength: 20,
  widgetOpacity: 100,
  historyDesign: 'simple',
  widgetAccentColors: {}
};

export let settings = { ...DEFAULT_SETTINGS };

export const ACCENT_COLORS = {
  spotify: { r: 29, g: 185, b: 84 },
  blue: { r: 59, g: 130, b: 246 },
  purple: { r: 139, g: 92, b: 246 },
  pink: { r: 236, g: 72, b: 153 },
  orange: { r: 249, g: 115, b: 22 },
  red: { r: 239, g: 68, b: 68 }
};

/**
 * Get current accent color as RGB
 */
export function getCurrentAccentColor() {
  if (settings.accentColor === 'custom') {
    return hexToRgb(settings.customAccentColor);
  }
  return ACCENT_COLORS[settings.accentColor] || ACCENT_COLORS.spotify;
}

/**
 * Load settings from localStorage
 */
export function loadSettings() {
  try {
    const saved = getItem('displaysong-settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) {
    console.error('Load settings failed:', e);
  }
  applySettings();
}

/**
 * Save settings to localStorage
 */
export function saveSettings() {
  setItem('displaysong-settings', settings);
}

/**
 * Apply settings to UI
 */
export function applySettings() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  
  const color = getCurrentAccentColor();
  document.documentElement.style.setProperty('--accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
  document.documentElement.style.setProperty('--accent-rgb', `${color.r}, ${color.g}, ${color.b}`);
  

  const pollingSelect = document.getElementById('polling-interval');
  if (pollingSelect) pollingSelect.value = settings.pollingInterval;
  
  const autoShowCheck = document.getElementById('auto-show-widgets');
  if (autoShowCheck) autoShowCheck.checked = settings.autoShowWidgets;
  
  const rememberCheck = document.getElementById('remember-positions');
  if (rememberCheck) rememberCheck.checked = settings.rememberPositions;
  
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) themeSelect.value = settings.theme;
  
  const showPlayerTab = document.getElementById('show-player-tab');
  if (showPlayerTab) showPlayerTab.checked = settings.showPlayerTab !== false;
  
  const showHistoryTab = document.getElementById('show-history-tab');
  if (showHistoryTab) showHistoryTab.checked = settings.showHistoryTab !== false;
  
  const historySelect = document.getElementById('history-length');
  if (historySelect) historySelect.value = settings.historyLength;
  
  const opacitySlider = document.getElementById('widget-opacity');
  const opacityValue = document.getElementById('widget-opacity-value');
  if (opacitySlider) {
    opacitySlider.value = settings.widgetOpacity;
    if (opacityValue) opacityValue.textContent = settings.widgetOpacity + '%';
  }
  
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === settings.accentColor);
  });
  
  const customColorInput = document.getElementById('custom-accent-color');
  if (customColorInput) {
    customColorInput.value = settings.customAccentColor;
    const customBtn = document.querySelector('.color-btn-custom');
    if (customBtn && settings.accentColor === 'custom') {
      customBtn.style.background = settings.customAccentColor;
    }
  }
  
  document.querySelectorAll('.widget-accent-check').forEach(checkbox => {
    const widget = checkbox.dataset.widget;
    checkbox.checked = settings.widgetAccentColors?.[widget] || false;
  });
  
  import('./history.js').then(({ historyDesign }) => {
    document.querySelectorAll('.design-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.design === historyDesign);
    });
  });

  const showPlayerCheck = document.getElementById('show-player-tab');
  if (showPlayerCheck) showPlayerCheck.checked = settings.showPlayerTab !== false;

  const showHistoryCheck = document.getElementById('show-history-tab');
  if (showHistoryCheck) showHistoryCheck.checked = settings.showHistoryTab !== false;
  
  // Sub-Setting für History-Länge anzeigen/ausblenden
  const historyLengthSetting = document.getElementById('history-length-setting');
  if (historyLengthSetting) {
    historyLengthSetting.classList.toggle('hidden', !settings.showHistoryTab);
  }
  
  updateTabVisibility();
  updateGlobalBackground();
  applyWidgetOpacity();
}

/**
 * Update global background visibility based on player tab setting
 */
export function updateGlobalBackground() {
  const globalBg = document.getElementById('global-cover-bg');
  if (!globalBg) return;
  
  // Zeige globalen Background wenn Player Tab deaktiviert ist
  if (settings.showPlayerTab === false) {
    globalBg.classList.add('visible');
  } else {
    globalBg.classList.remove('visible');
  }
}

/**
 * Apply widget opacity
 */
export async function applyWidgetOpacity() {
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
 * Setup settings event listeners
 */
export function setupSettingsListeners() {
  const pollingSelect = document.getElementById('polling-interval');
  if (pollingSelect) {
    pollingSelect.addEventListener('change', async () => {
      settings.pollingInterval = parseInt(pollingSelect.value);
      saveSettings();
      const invoke = getTauriInvoke();
      if (invoke) {
        try { 
          await invoke('set_polling_interval', { interval: settings.pollingInterval }); 
        } catch (e) {}
      }
      showNotification('Aktualisierungsrate geändert');
    });
  }
  
  const autoShowCheck = document.getElementById('auto-show-widgets');
  if (autoShowCheck) {
    autoShowCheck.addEventListener('change', () => {
      settings.autoShowWidgets = autoShowCheck.checked;
      saveSettings();
    });
  }
  
  const rememberCheck = document.getElementById('remember-positions');
  if (rememberCheck) {
    rememberCheck.addEventListener('change', () => {
      settings.rememberPositions = rememberCheck.checked;
      saveSettings();
    });
  }
  
  const autostartCheck = document.getElementById('autostart');
  if (autostartCheck) {
    autostartCheck.addEventListener('change', async () => {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          await invoke('set_autostart', { enabled: autostartCheck.checked });
          showNotification(autostartCheck.checked ? 'Autostart aktiviert' : 'Autostart deaktiviert');
        } catch (e) {
          autostartCheck.checked = !autostartCheck.checked;
          showNotification('Autostart konnte nicht geändert werden');
        }
      }
    });
  }
  
  const btnRemoveAutostart = document.getElementById('btn-remove-autostart');
  if (btnRemoveAutostart) {
    btnRemoveAutostart.addEventListener('click', async () => {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          await invoke('remove_autostart_entry');
          const checkbox = document.getElementById('autostart');
          if (checkbox) checkbox.checked = false;
          showNotification('Autostart-Eintrag entfernt');
        } catch (e) {
          showNotification('Fehler beim Entfernen');
        }
      }
    });
  }
  
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      settings.theme = themeSelect.value;
      saveSettings();
      applySettings();
    });
  }
  
  document.querySelectorAll('.color-btn:not(.color-btn-custom)').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.accentColor = btn.dataset.color;
      saveSettings();
      applySettings();
      broadcastAccentColor();
    });
  });
  
  const customColorInput = document.getElementById('custom-accent-color');
  const customColorBtn = document.querySelector('.color-btn-custom');
  
  if (customColorInput && customColorBtn) {
    customColorBtn.addEventListener('click', () => {
      settings.accentColor = 'custom';
      saveSettings();
      applySettings();
      broadcastAccentColor();
    });
    
    customColorInput.addEventListener('input', () => {
      settings.customAccentColor = customColorInput.value;
      settings.accentColor = 'custom';
      customColorBtn.style.background = customColorInput.value;
      
      const color = hexToRgb(customColorInput.value);
      document.documentElement.style.setProperty('--accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
      document.documentElement.style.setProperty('--accent-rgb', `${color.r}, ${color.g}, ${color.b}`);
      
      document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === 'custom');
      });
    });
    
    customColorInput.addEventListener('change', () => {
      saveSettings();
      broadcastAccentColor();
    });
  }
  
  document.querySelectorAll('.widget-accent-check').forEach(checkbox => {
    checkbox.addEventListener('change', async () => {
      const widget = checkbox.dataset.widget;
      if (!settings.widgetAccentColors) settings.widgetAccentColors = {};
      settings.widgetAccentColors[widget] = checkbox.checked;
      saveSettings();
      
      const { state } = await import('../core/state.js');
      const { sendAccentColorToWidget, resetWidgetToTrackColor } = await import('./widgets.js');
      
      if (state.activeWidgets.has(widget)) {
        if (checkbox.checked) {
          sendAccentColorToWidget(widget);
        } else {
          resetWidgetToTrackColor(widget);
        }
      }
    });
  });
  
  const showPlayerTab = document.getElementById('show-player-tab');
  if (showPlayerTab) {
    showPlayerTab.addEventListener('change', () => {
      settings.showPlayerTab = showPlayerTab.checked;
      saveSettings();
      updateTabVisibility();
      updateGlobalBackground();
      showNotification(settings.showPlayerTab ? 'Player Tab eingeblendet' : 'Player Tab ausgeblendet');
    });
  }
  
  const showHistoryTab = document.getElementById('show-history-tab');
  if (showHistoryTab) {
    showHistoryTab.addEventListener('change', () => {
      settings.showHistoryTab = showHistoryTab.checked;
      saveSettings();
      updateTabVisibility();
      
      // Sub-Setting anzeigen/ausblenden
      const historyLengthSetting = document.getElementById('history-length-setting');
      if (historyLengthSetting) {
        historyLengthSetting.classList.toggle('hidden', !settings.showHistoryTab);
      }
      
      showNotification(settings.showHistoryTab ? 'Verlauf Tab eingeblendet' : 'Verlauf Tab ausgeblendet');
    });
  }
  
  const historySelect = document.getElementById('history-length');
  if (historySelect) {
    historySelect.addEventListener('change', async () => {
      settings.historyLength = parseInt(historySelect.value);
      saveSettings();
      const invoke = getTauriInvoke();
      if (invoke) {
        try { 
          await invoke('set_history_length', { length: settings.historyLength }); 
        } catch (e) {}
      }
      showNotification(`Verlauf: ${settings.historyLength} Songs`);
    });
  }
  
  const opacitySlider = document.getElementById('widget-opacity');
  const opacityValue = document.getElementById('widget-opacity-value');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      settings.widgetOpacity = parseInt(opacitySlider.value);
      if (opacityValue) opacityValue.textContent = settings.widgetOpacity + '%';
    });
    opacitySlider.addEventListener('change', () => {
      saveSettings();
      applyWidgetOpacity();
      showNotification(`Widget-Transparenz: ${settings.widgetOpacity}%`);
    });
  }
  
  const btnCopySong = document.getElementById('btn-copy-song');
  if (btnCopySong) {
    btnCopySong.addEventListener('click', async () => {
      const { copySongInfo } = await import('../ui/track-display.js');
      copySongInfo();
    });
  }
  
  document.getElementById('btn-changelog')?.addEventListener('click', () => {
    document.getElementById('changelog-modal')?.classList.remove('hidden');
  });
  
  document.getElementById('btn-licenses')?.addEventListener('click', () => {
    document.getElementById('licenses-modal')?.classList.remove('hidden');
  });
  
  document.getElementById('btn-logs')?.addEventListener('click', async () => {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_logs_folder');
        showNotification('Logs-Ordner geöffnet');
      } catch (e) {
        showNotification('Fehler: ' + e);
      }
    }
  });
  
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });
  
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}

/**
 * Load autostart status
 */
export async function loadAutostartStatus() {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const enabled = await invoke('get_autostart');
      const checkbox = document.getElementById('autostart');
      if (checkbox) checkbox.checked = enabled;
    } catch (e) {}
  }
}

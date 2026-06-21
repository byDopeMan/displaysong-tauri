<script lang="ts">
  // "Widget-Verhalten" settings section as a Svelte component. Reads settingsStore
  // and calls back into the settings logic (updateSettings keeps the shared
  // `settings` object + store in sync; saveSettings persists to localStorage).
  import { getTauriInvoke } from '../../core/tauri';
  import { showNotification } from '../../ui/notifications';
  import { t } from '../../utils/i18n';
  import { settingsStore, updateSettings, saveSettings, applyWidgetOpacity } from './index';

  async function onPolling(e: Event) {
    const v = parseInt((e.currentTarget as HTMLSelectElement).value);
    updateSettings({ pollingInterval: v });
    saveSettings();
    const invoke = getTauriInvoke();
    if (invoke) {
      try { await invoke('set_polling_interval', { interval: v }); } catch (err) {}
    }
    showNotification(t('notifications.pollingChanged', {}, 'Aktualisierungsrate geändert'));
  }

  function onOpacityInput(e: Event) {
    updateSettings({ widgetOpacity: parseInt((e.currentTarget as HTMLInputElement).value) });
  }

  function onOpacityCommit() {
    saveSettings();
    applyWidgetOpacity();
    showNotification(t('notifications.widgetOpacity', { value: $settingsStore.widgetOpacity }, `Design-Transparenz: ${$settingsStore.widgetOpacity}%`));
  }

  function onAutoShow(e: Event) {
    updateSettings({ autoShowWidgets: (e.currentTarget as HTMLInputElement).checked });
    saveSettings();
  }

  function onRemember(e: Event) {
    updateSettings({ rememberPositions: (e.currentTarget as HTMLInputElement).checked });
    saveSettings();
  }
</script>

<div class="setting-row">
  <label for="polling-interval" data-i18n="settings.widget.pollingInterval">Aktualisierungsrate</label>
    <select id="polling-interval" class="setting-select" value={String($settingsStore.pollingInterval)} on:change={onPolling}>
      <option value="1000">1 Sekunde</option>
      <option value="2000">2 Sekunden</option>
      <option value="5000">5 Sekunden</option>
      <option value="10000">10 Sekunden</option>
    </select>
  </div>

  <div class="setting-row">
    <label for="widget-opacity" data-i18n="settings.widget.opacity">Design-Transparenz</label>
    <div class="slider-row">
      <input
        type="range"
        id="widget-opacity"
        class="setting-slider"
        min="50"
        max="100"
        value={$settingsStore.widgetOpacity}
        on:input={onOpacityInput}
        on:change={onOpacityCommit}
      />
      <span id="widget-opacity-value">{$settingsStore.widgetOpacity}%</span>
    </div>
  </div>

  <div class="setting-row">
    <label for="auto-show-widgets" data-i18n="settings.widget.autoShow">Designs beim Start öffnen</label>
    <input type="checkbox" id="auto-show-widgets" class="setting-checkbox" checked={$settingsStore.autoShowWidgets} on:change={onAutoShow} />
  </div>

  <div class="setting-row">
    <label for="remember-positions" data-i18n="settings.widget.rememberPositions">Design-Positionen merken</label>
    <input type="checkbox" id="remember-positions" class="setting-checkbox" checked={$settingsStore.rememberPositions} on:change={onRemember} />
  </div>

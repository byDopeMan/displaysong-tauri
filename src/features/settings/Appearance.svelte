<script lang="ts">
  // "Aussehen" + "Über" settings sections as a Svelte component. Reads
  // settingsStore and calls back into the settings logic. The language <select>
  // is left uncontrolled so i18n's populateLanguageSelect can still inject custom
  // languages and set the current value via getElementById after mount.
  import { getTauriInvoke } from '../../core/tauri';
  import { showNotification } from '../../ui/notifications';
  import { hexToRgb } from '../../utils/format';
  import { updateTabVisibility } from '../../ui/navigation';
  import { broadcastAccentColor } from '../widgets';
  import { t } from '../../utils/i18n';
  import { settingsStore, updateSettings, saveSettings, applySettings, updateGlobalBackground } from './index';

  const PRESETS = [
    { key: 'spotify', bg: '#1db954', title: 'Spotify Grün' },
    { key: 'blue', bg: '#3b82f6', title: 'Blau' },
    { key: 'purple', bg: '#8b5cf6', title: 'Lila' },
    { key: 'pink', bg: '#ec4899', title: 'Pink' },
    { key: 'orange', bg: '#f97316', title: 'Orange' },
    { key: 'red', bg: '#ef4444', title: 'Rot' },
  ];

  function onTheme(e: Event) {
    updateSettings({ theme: (e.currentTarget as HTMLSelectElement).value });
    saveSettings();
    applySettings();
  }

  async function onLanguage(e: Event) {
    const lang = (e.currentTarget as HTMLSelectElement).value;
    localStorage.setItem('language', lang);
    const { loadLanguage, updatePageTranslations } = await import('../../utils/i18n');
    await loadLanguage(lang);
    updatePageTranslations();
    const { updateTwitchUI } = await import('../twitch/index');
    updateTwitchUI();
    showNotification(t('notifications.languageChanged', {}, 'Sprache gewechselt'));
  }

  async function onShowPlayer(e: Event) {
    updateSettings({ showPlayerTab: (e.currentTarget as HTMLInputElement).checked });
    saveSettings();
    updateTabVisibility();
    updateGlobalBackground();
    const { onPlayerTabVisibilityChange } = await import('../queue/index');
    onPlayerTabVisibilityChange();
    showNotification($settingsStore.showPlayerTab ? 'Player Tab eingeblendet' : 'Player Tab ausgeblendet');
  }

  function onShowHistory(e: Event) {
    updateSettings({ showHistoryTab: (e.currentTarget as HTMLInputElement).checked });
    saveSettings();
    updateTabVisibility();
    showNotification($settingsStore.showHistoryTab ? 'Verlauf Tab eingeblendet' : 'Verlauf Tab ausgeblendet');
  }

  async function onHistoryLength(e: Event) {
    const v = parseInt((e.currentTarget as HTMLSelectElement).value);
    updateSettings({ historyLength: v });
    saveSettings();
    const invoke = getTauriInvoke();
    if (invoke) {
      try { await invoke('set_history_length', { length: v }); } catch (err) {}
    }
    showNotification(t('notifications.historyLength', { n: v }, `Verlauf: ${v} Songs`));
  }

  function selectAccent(color: string) {
    updateSettings({ accentColor: color });
    saveSettings();
    applySettings();
    broadcastAccentColor();
  }

  function onCustomInput(e: Event) {
    const hex = (e.currentTarget as HTMLInputElement).value;
    updateSettings({ customAccentColor: hex, accentColor: 'custom' });
    const color = hexToRgb(hex);
    document.documentElement.style.setProperty('--accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
    document.documentElement.style.setProperty('--accent-rgb', `${color.r}, ${color.g}, ${color.b}`);
  }

  function onCustomChange() {
    saveSettings();
    broadcastAccentColor();
  }

</script>

<!-- Aussehen (content only; Settings.svelte provides the "Appearance & System" section) -->
<div class="setting-row">
  <label for="theme-select" data-i18n="settings.appearance.theme">Theme</label>
    <select id="theme-select" class="setting-select" value={$settingsStore.theme} on:change={onTheme}>
      <option value="dark" data-i18n="settings.appearance.themeDark">Dunkel</option>
      <option value="light" data-i18n="settings.appearance.themeLight">Hell</option>
    </select>
  </div>

  <div class="setting-row">
    <label for="language-select" data-i18n="settings.appearance.language">Sprache</label>
    <select id="language-select" class="setting-select" on:change={onLanguage}>
      <option value="de">Deutsch</option>
      <option value="en">English</option>
    </select>
  </div>

  <div class="setting-row">
    <label for="show-player-tab" data-i18n="settings.appearance.showPlayerTab">Player Tab anzeigen</label>
    <input type="checkbox" id="show-player-tab" class="setting-checkbox" checked={$settingsStore.showPlayerTab !== false} on:change={onShowPlayer} />
  </div>

  <div class="setting-row">
    <label for="show-history-tab" data-i18n="settings.appearance.showHistoryTab">Verlauf Tab anzeigen</label>
    <input type="checkbox" id="show-history-tab" class="setting-checkbox" checked={$settingsStore.showHistoryTab !== false} on:change={onShowHistory} />
  </div>

  <div class="setting-row setting-sub" id="history-length-setting" class:hidden={$settingsStore.showHistoryTab === false}>
    <label for="history-length" data-i18n="settings.appearance.historyLength">Anzahl Songs im Verlauf</label>
    <select id="history-length" class="setting-select" value={String($settingsStore.historyLength)} on:change={onHistoryLength}>
      <option value="10">10 Songs</option>
      <option value="20">20 Songs</option>
      <option value="50">50 Songs</option>
      <option value="100">100 Songs</option>
    </select>
  </div>

  <div class="setting-row">
    <!-- svelte-ignore a11y-label-has-associated-control -->
    <label data-i18n="settings.appearance.accentColor">Akzentfarbe</label>
    <div class="color-options">
      {#each PRESETS as p}
        <button class="color-btn" class:active={$settingsStore.accentColor === p.key} data-color={p.key} style="background: {p.bg}" title={p.title} on:click={() => selectAccent(p.key)}></button>
      {/each}
      <label class="color-picker-label" title="Eigene Farbe auswählen">
        <input type="color" id="custom-accent-color" class="color-picker-input" value={$settingsStore.customAccentColor} on:input={onCustomInput} on:change={onCustomChange} />
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <span
          class="color-btn color-btn-custom"
          class:active={$settingsStore.accentColor === 'custom'}
          data-color="custom"
          style={$settingsStore.accentColor === 'custom' ? `background: ${$settingsStore.customAccentColor}` : ''}
          on:click={() => selectAccent('custom')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="8" r="1.5" fill="currentColor"></circle>
            <circle cx="8" cy="12" r="1.5" fill="currentColor"></circle>
            <circle cx="16" cy="12" r="1.5" fill="currentColor"></circle>
            <circle cx="12" cy="16" r="1.5" fill="currentColor"></circle>
          </svg>
        </span>
      </label>
    </div>
  </div>

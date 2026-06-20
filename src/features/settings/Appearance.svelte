<script lang="ts">
  // "Aussehen" + "Über" settings sections as a Svelte component. Reads
  // settingsStore and calls back into the settings logic. The language <select>
  // is left uncontrolled so i18n's populateLanguageSelect can still inject custom
  // languages and set the current value via getElementById after mount.
  import { getTauriInvoke } from '../../core/tauri';
  import { showNotification } from '../../ui/notifications';
  import { hexToRgb } from '../../utils/format';
  import { updateTabVisibility } from '../../ui/navigation';
  import { setPluginSettingsStyle } from '../plugins/index';
  import { broadcastAccentColor } from '../widgets';
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
    showNotification('Sprache gewechselt');
  }

  function onPluginStyle(e: Event) {
    const v = (e.currentTarget as HTMLSelectElement).value;
    updateSettings({ pluginSettingsStyle: v });
    saveSettings();
    setPluginSettingsStyle(v);
    showNotification(v === 'modal' ? 'Plugin-Einstellungen: Fenster' : 'Plugin-Einstellungen: Panel');
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
    showNotification(`Verlauf: ${v} Songs`);
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

  function openModal(id: string) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  async function openLogs() {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_logs_folder');
        showNotification('Logs-Ordner geöffnet');
      } catch (e) {
        showNotification('Fehler: ' + e);
      }
    }
  }
</script>

<!-- Aussehen -->
<div class="settings-section">
  <h3 data-i18n="settings.appearance.title">Aussehen</h3>

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

  <div class="setting-row" id="plugin-settings-style-row" style="display: none;">
    <label for="plugin-settings-style" data-i18n="settings.appearance.pluginSettings">Plugin-Einstellungen</label>
    <select id="plugin-settings-style" class="setting-select" value={$settingsStore.pluginSettingsStyle} on:change={onPluginStyle}>
      <option value="panel" data-i18n="settings.appearance.pluginPanel">Als Panel (im Tab)</option>
      <option value="modal" data-i18n="settings.appearance.pluginModal">Als Fenster (Modal)</option>
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
</div>

<!-- Über -->
<div class="settings-section">
  <h3 data-i18n="settings.about.title">Über</h3>
  <div class="about-info">
    <p class="app-name">DisplaySong</p>
    <p class="app-version">Version 4.1.0</p>
    <p class="app-desc" data-i18n="settings.about.description">Now Playing Widget für OBS</p>
  </div>
  <div class="about-links">
    <button id="btn-changelog" class="btn btn-text" on:click={() => openModal('changelog-modal')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
      <span data-i18n="settings.about.changelog">Changelog</span>
    </button>
    <button id="btn-licenses" class="btn btn-text" on:click={() => openModal('licenses-modal')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
      <span data-i18n="settings.about.licenses">Lizenzen</span>
    </button>
    <button id="btn-logs" class="btn btn-text" on:click={openLogs}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span data-i18n="settings.about.logs">Logs öffnen</span>
    </button>
  </div>
</div>

<script lang="ts">
  // "System" settings section. Autostart is owned here (self-contained); the
  // provider <select>/hint and the source-priority button keep their ids so
  // provider-ui (setupProviderSelect) and source-priority (initSourcePriority)
  // wire them as before — those modules run after this island is mounted.
  import { onMount } from 'svelte';
  import { getTauriInvoke } from '../../core/tauri';
  import { showNotification } from '../../ui/notifications';

  let autostartChecked = false;

  onMount(async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      autostartChecked = await invoke('get_autostart');
    } catch (e) { /* best-effort */ }
  });

  async function onAutostart(e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      await invoke('set_autostart', { enabled: checked });
      autostartChecked = checked;
      showNotification(checked ? 'Autostart aktiviert' : 'Autostart deaktiviert');
    } catch (e) {
      autostartChecked = !checked; // revert
      showNotification('Autostart konnte nicht geändert werden');
    }
  }

  async function removeAutostartEntry() {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      await invoke('remove_autostart_entry');
      autostartChecked = false;
      showNotification('Autostart-Eintrag entfernt');
    } catch (e) {
      showNotification('Fehler beim Entfernen');
    }
  }
</script>

<!-- Content only; Settings.svelte provides the "Appearance & System" section. -->
<!-- Musik-Quelle (Provider-Auswahl, gewired von provider-ui) -->
<div class="setting-row">
  <label for="music-provider-select" data-i18n="settings.system.activeProvider">Aktiver Provider</label>
    <div class="provider-select-wrapper">
      <button id="btn-source-priority" class="btn-icon-inline" title="Quellen-Priorität">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
          <circle cx="8" cy="6" r="2" fill="currentColor"></circle>
          <circle cx="16" cy="12" r="2" fill="currentColor"></circle>
          <circle cx="10" cy="18" r="2" fill="currentColor"></circle>
        </svg>
      </button>
      <select id="music-provider-select" class="setting-select">
        <option value="windows" data-i18n="settings.system.providerWindows">Windows Audio (Universal)</option>
        <option value="spotify" data-i18n="settings.system.providerSpotify">Spotify API</option>
      </select>
    </div>
  </div>
  <p class="setting-hint" id="provider-hint" data-i18n="settings.system.providerHintWindows">Windows Audio erkennt Musik von allen Playern automatisch.</p>

  <div class="setting-row">
    <label for="autostart" data-i18n="settings.system.autostart">Mit Windows starten</label>
    <div class="autostart-controls">
      {#if autostartChecked}
        <button id="btn-remove-autostart" class="btn btn-secondary btn-small" data-i18n="settings.system.removeAutostart" on:click={removeAutostartEntry}>Autostart-Eintrag entfernen</button>
      {/if}
      <input type="checkbox" id="autostart" class="setting-checkbox" checked={autostartChecked} on:change={onAutostart} />
    </div>
  </div>

<style>
  .autostart-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>

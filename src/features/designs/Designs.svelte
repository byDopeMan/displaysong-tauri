<script lang="ts">
  // Designs view as a Svelte component (replaces the static markup + the
  // listeners that lived in core/events.ts and features/settings). Renders the
  // global widget toggles, the design cards, the reactive "Aktive Widgets" list
  // and the folder/reload actions.
  import { state } from '../../core/state';
  import {
    WIDGET_NAMES,
    toggleWidget,
    hideWidget,
    openConfigFolder,
    reloadWidgets,
    sendAccentColorToWidget,
    resetWidgetToTrackColor,
  } from '../widgets';
  import { settingsStore, updateSettings, saveSettings } from '../settings';
  import { activeWidgets } from './store';

  function onRequester(e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSettings({ showRequesterWidgets: checked });
    localStorage.setItem('widget-show-requester', String(checked));
    saveSettings();
    try { window.__TAURI__?.event?.emit('requester-visibility-change', { enabled: checked }); } catch (err) {}
  }

  function onAutoHide(e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSettings({ autoHideWidgets: checked });
    localStorage.setItem('widget-autohide', String(checked));
    saveSettings();
    try { window.__TAURI__?.event?.emit('autohide-change', { enabled: checked }); } catch (err) {}
  }

  function onAccent(widget: string, e: Event) {
    const checked = (e.currentTarget as HTMLInputElement).checked;
    updateSettings({ widgetAccentColors: { ...($settingsStore.widgetAccentColors || {}), [widget]: checked } });
    saveSettings();
    if (state.activeWidgets.has(widget)) {
      if (checked) sendAccentColorToWidget(widget);
      else resetWidgetToTrackColor(widget);
    }
  }
</script>

<h2 data-i18n="designs.title">Widget Designs</h2>

<label class="checkbox-label designs-global-option">
  <input type="checkbox" id="show-requester-widgets" class="setting-checkbox" checked={$settingsStore.showRequesterWidgets} on:change={onRequester} />
  <span data-i18n="designs.showRequester">Requester bei Song-Requests in Widgets anzeigen</span>
</label>
<label class="checkbox-label designs-global-option">
  <input type="checkbox" id="autohide-widgets" class="setting-checkbox" checked={$settingsStore.autoHideWidgets} on:change={onAutoHide} />
  <span data-i18n="designs.autoHide">Ausblenden wenn pausiert</span>
</label>

<div class="design-grid">
  <div class="design-card">
    <div class="design-preview design-1">
      <div class="preview-bar"></div>
    </div>
    <h3 data-i18n="designs.compactBar">Compact Bar</h3>
    <p class="design-desc" data-i18n="designs.compactBarDesc">Horizontal, minimalistisch</p>
    <div class="design-options">
      <label class="checkbox-label">
        <input type="checkbox" id="accent-widget-1" class="setting-checkbox widget-accent-check" data-widget="widget-1" checked={$settingsStore.widgetAccentColors?.['widget-1'] || false} on:change={(e) => onAccent('widget-1', e)} />
        <span data-i18n="designs.accentColor">Akzentfarbe</span>
      </label>
    </div>
    <button class="btn btn-show" data-widget="widget-1" data-i18n="designs.show" on:click={() => toggleWidget('widget-1')}>Anzeigen</button>
  </div>
  <div class="design-card">
    <div class="design-preview design-2">
      <div class="preview-square"></div>
    </div>
    <h3 data-i18n="designs.albumFocus">Album Focus</h3>
    <p class="design-desc" data-i18n="designs.albumFocusDesc">Großes Cover, vertikal</p>
    <div class="design-options">
      <label class="checkbox-label">
        <input type="checkbox" id="accent-widget-2" class="setting-checkbox widget-accent-check" data-widget="widget-2" checked={$settingsStore.widgetAccentColors?.['widget-2'] || false} on:change={(e) => onAccent('widget-2', e)} />
        <span data-i18n="designs.accentColor">Akzentfarbe</span>
      </label>
    </div>
    <button class="btn btn-show" data-widget="widget-2" data-i18n="designs.show" on:click={() => toggleWidget('widget-2')}>Anzeigen</button>
  </div>
  <div class="design-card">
    <div class="design-preview design-custom">
      <span>C1</span>
    </div>
    <h3>Custom 1</h3>
    <p class="design-desc" data-i18n="designs.customDesc">Anpassbar im Editor</p>
    <button class="btn btn-show" data-widget="widget-custom1" data-i18n="designs.show" on:click={() => toggleWidget('widget-custom1')}>Anzeigen</button>
  </div>
  <div class="design-card">
    <div class="design-preview design-custom">
      <span>C2</span>
    </div>
    <h3>Custom 2</h3>
    <p class="design-desc" data-i18n="designs.customDesc">Anpassbar im Editor</p>
    <button class="btn btn-show" data-widget="widget-custom2" data-i18n="designs.show" on:click={() => toggleWidget('widget-custom2')}>Anzeigen</button>
  </div>
</div>

<div class="active-widgets">
  <h3 data-i18n="designs.activeWidgets">Aktive Widgets</h3>
  <div id="widget-list">
    {#if $activeWidgets.length === 0}
      <span class="no-widgets" data-i18n="designs.noWidgets">Keine aktiv</span>
    {:else}
      {#each $activeWidgets as label (label)}
        <span class="widget-tag">
          {WIDGET_NAMES[label] || label}
          <button class="close-widget" on:click={() => hideWidget(label)}>×</button>
        </span>
      {/each}
    {/if}
  </div>
</div>

<div class="custom-widgets-hint">
  <h3 data-i18n="designs.ownDesigns">Eigene Designs</h3>
  <p data-i18n="designs.customHint">Du kannst die Custom-Widgets mit einem Texteditor anpassen.</p>
  <div class="btn-row">
    <button id="btn-open-folder" class="btn-icon-sm" on:click={openConfigFolder}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span data-i18n="designs.widgetFolder">Widget-Ordner</span>
    </button>
    <button id="btn-reload-widgets" class="btn-icon-sm" on:click={reloadWidgets}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
      <span data-i18n="designs.reload">Neu laden</span>
    </button>
  </div>
</div>

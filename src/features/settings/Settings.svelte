<script lang="ts">
  // Settings tab shell: composes the (content-only) settings sections into
  // collapsible cards whose open/closed state is persisted to localStorage, and
  // renders the Twitch settings as a separate panel (opened via the gear button
  // in the Connections block) instead of inline. Collapse + panel switch are
  // animated; the child content stays in the DOM so the by-id wiring keeps working.
  import { getTauriInvoke } from '../../core/tauri';
  import { showNotification } from '../../ui/notifications';
  import { t } from '../../utils/i18n';
  import { twitchPanelOpen } from '../twitch/store';
  import { infoModal } from './info-modal';
  import Connections from '../provider/Connections.svelte';
  import TwitchSettings from '../twitch/TwitchSettings.svelte';
  import WidgetBehavior from './WidgetBehavior.svelte';
  import Appearance from './Appearance.svelte';
  import SystemSettings from './SystemSettings.svelte';

  const COLLAPSE_KEY = 'settings-sections-collapsed';
  let collapsed: Record<string, boolean> = {
    connections: false,
    designBehavior: false,
    appearanceSystem: false,
  };
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved) collapsed = { ...collapsed, ...JSON.parse(saved) };
  } catch (e) { /* ignore */ }

  function toggle(key: string) {
    collapsed[key] = !collapsed[key];
    collapsed = collapsed; // trigger reactivity
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch (e) { /* ignore */ }
  }

  async function openLogs() {
    const invoke = getTauriInvoke();
    if (invoke) {
      try {
        await invoke('open_logs_folder');
        showNotification(t('notifications.logsOpened', {}, 'Logs-Ordner geöffnet'));
      } catch (e) {
        showNotification(t('errors.generic', { error: String(e) }, 'Fehler: ' + e));
      }
    }
  }
</script>

<div class="settings-switch">
  <!-- Normal settings -->
  <div class="settings-pane" class:inactive={$twitchPanelOpen}>
    <div class="settings-section" class:collapsed={collapsed.connections}>
      <button type="button" class="section-toggle" aria-expanded={!collapsed.connections} on:click={() => toggle('connections')}>
        <h3 data-i18n="settings.connections.title">Verbindungen</h3>
        <svg class="section-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="section-grid"><div class="section-content"><Connections /></div></div>
    </div>

    <div class="settings-section" class:collapsed={collapsed.designBehavior}>
      <button type="button" class="section-toggle" aria-expanded={!collapsed.designBehavior} on:click={() => toggle('designBehavior')}>
        <h3 data-i18n="settings.widget.title">Design-Verhalten</h3>
        <svg class="section-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="section-grid"><div class="section-content"><WidgetBehavior /></div></div>
    </div>

    <div class="settings-section" class:collapsed={collapsed.appearanceSystem}>
      <button type="button" class="section-toggle" aria-expanded={!collapsed.appearanceSystem} on:click={() => toggle('appearanceSystem')}>
        <h3 data-i18n="settings.appearanceSystem.title">Aussehen und System</h3>
        <svg class="section-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="section-grid"><div class="section-content">
        <Appearance />
        <SystemSettings />
      </div></div>
    </div>

    <!-- Über -->
    <div class="settings-section">
      <h3 data-i18n="settings.about.title">Über</h3>
      <div class="about-info">
        <p class="app-name">DisplaySong</p>
        <p class="app-version">Version 4.2.3</p>
        <p class="app-desc" data-i18n="settings.about.description">Now Playing Widget für OBS</p>
      </div>
      <div class="about-links">
        <button id="btn-changelog" class="btn btn-text" on:click={() => infoModal.set('changelog')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span data-i18n="settings.about.changelog">Changelog</span>
        </button>
        <button id="btn-licenses" class="btn btn-text" on:click={() => infoModal.set('licenses')}>
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
  </div>

  <!-- Twitch settings panel -->
  <div class="settings-pane" class:inactive={!$twitchPanelOpen}>
    <button type="button" class="btn-back" on:click={() => twitchPanelOpen.set(false)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7"></path>
      </svg>
      <span data-i18n="common.back">Zurück</span>
    </button>
    <TwitchSettings />
  </div>
</div>

<style>
  .settings-switch {
    position: relative;
    /* Clip the absolutely-positioned inactive pane so it can't add scroll height. */
    overflow: hidden;
  }
  .settings-pane {
    transition: opacity 0.2s ease;
  }
  /* Inactive pane: faded out + taken out of flow, but kept in the DOM (visibility
     hidden, not display:none) so the by-id wiring still resolves its elements. */
  .settings-pane.inactive {
    opacity: 0;
    visibility: hidden;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    pointer-events: none;
    transition: opacity 0.2s ease, visibility 0s linear 0.2s;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: inherit;
    text-align: left;
    font: inherit;
  }
  .section-toggle h3 {
    margin: 0;
  }
  .section-chevron {
    flex-shrink: 0;
    opacity: 0.7;
    transition: transform 0.2s ease;
  }
  .settings-section.collapsed .section-chevron {
    transform: rotate(-90deg);
  }

  /* Smooth collapse via an animatable grid row (0fr ↔ 1fr) — works for any
     content height while keeping the content in the DOM. */
  .section-grid {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 0.25s ease;
  }
  .settings-section.collapsed .section-grid {
    grid-template-rows: 0fr;
  }
  .section-content {
    overflow: hidden;
    min-height: 0;
    padding-top: 14px;
  }
</style>

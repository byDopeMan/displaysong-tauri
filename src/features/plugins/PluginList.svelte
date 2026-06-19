<script lang="ts">
  // Plugin management list as a Svelte component (replaces the createElement/
  // innerHTML rendering in plugins/index.ts). Renders reactively from pluginList;
  // toggle/delete/settings call back into the loader.
  import { pluginList } from './list-store';
  import { togglePlugin, deletePlugin } from './index';
  import { openPluginSettings } from './settings';

  const GEAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
  const TRASH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
</script>

{#if $pluginList.length === 0}
  <div class="plugins-empty">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"></path>
    </svg>
    <p>Keine Plugins installiert</p>
    <p class="hint">Plugins in den Plugin-Ordner kopieren oder ZIP importieren</p>
  </div>
{:else}
  {#each $pluginList as plugin (plugin.id)}
    <div class="plugin-card" class:enabled={plugin.enabled} class:error={plugin.has_error}>
      <div class="plugin-main">
        <div class="plugin-info">
          <span class="plugin-name">{plugin.name}</span>
          <span class="plugin-version">v{plugin.version}</span>
        </div>
        <div class="plugin-actions">
          <button class="plugin-btn plugin-settings" title="Einstellungen" disabled={!plugin.enabled} on:click={() => openPluginSettings(plugin.id, plugin.name)}>
            {@html GEAR}
          </button>
          <button class="plugin-btn plugin-delete" title="Löschen" on:click={() => deletePlugin(plugin)}>
            {@html TRASH}
          </button>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={plugin.enabled}
              disabled={plugin.has_error}
              on:change={(e) => togglePlugin(plugin, e.currentTarget.checked)}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
      {#if plugin.author}<div class="plugin-meta"><span class="plugin-author">von {plugin.author}</span></div>{/if}
      {#if plugin.description}<div class="plugin-desc">{plugin.description}</div>{/if}
      {#if plugin.has_error}<div class="plugin-error">{plugin.error_message}</div>{/if}
    </div>
  {/each}
{/if}

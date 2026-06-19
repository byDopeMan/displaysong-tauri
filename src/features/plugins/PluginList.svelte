<script lang="ts">
  // Plugin management list as a Svelte component (replaces the createElement/
  // innerHTML rendering in plugins/index.ts). Renders reactively from pluginList;
  // toggle/delete/settings call back into the loader.
  import { pluginList } from './list-store';
  import type { PluginInfo } from './list-store';
  import { togglePlugin, deletePlugin } from './index';
  import { openPluginSettings } from './settings';

  // Plugin pending deletion (drives the confirm overlay). null = no dialog.
  let confirmDelete: PluginInfo | null = null;

  async function confirmDeleteNow() {
    const plugin = confirmDelete;
    confirmDelete = null;
    if (plugin) await deletePlugin(plugin);
  }

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
          <button class="plugin-btn plugin-delete" title="Löschen" on:click={() => (confirmDelete = plugin)}>
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

{#if confirmDelete}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="confirm-overlay" on:click={() => (confirmDelete = null)}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="confirm-box" on:click|stopPropagation>
      <div class="confirm-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </div>
      <h3 class="confirm-title">Plugin löschen?</h3>
      <p class="confirm-text">„{confirmDelete.name}" wird endgültig entfernt. Dies kann nicht rückgängig gemacht werden.</p>
      <div class="confirm-actions">
        <button class="confirm-btn confirm-cancel" on:click={() => (confirmDelete = null)}>Abbrechen</button>
        <button class="confirm-btn confirm-delete-btn" on:click={confirmDeleteNow}>Löschen</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: confirm-fade 0.12s ease;
  }
  .confirm-box {
    width: min(340px, calc(100vw - 48px));
    background: var(--bg-card, #1e1e24);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    padding: 24px;
    text-align: center;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    animation: confirm-pop 0.14s ease;
  }
  .confirm-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
  }
  .confirm-title {
    margin: 0 0 8px;
    font-size: 17px;
    font-weight: 600;
    color: var(--text, #fff);
  }
  .confirm-text {
    margin: 0 0 20px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-muted, #a0a0a8);
  }
  .confirm-actions {
    display: flex;
    gap: 10px;
  }
  .confirm-btn {
    flex: 1;
    padding: 10px 14px;
    border-radius: 9px;
    border: none;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.12s ease, background 0.12s ease;
  }
  .confirm-cancel {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--text, #fff);
  }
  .confirm-cancel:hover {
    background: var(--bg-hover-strong, rgba(255, 255, 255, 0.14));
  }
  .confirm-delete-btn {
    background: #ef4444;
    color: #fff;
  }
  .confirm-delete-btn:hover {
    filter: brightness(1.1);
  }
  @keyframes confirm-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes confirm-pop {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }
</style>

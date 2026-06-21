<script lang="ts">
  // Blocklist management modal (open it from the "Blockiert" button in the
  // History view). Reads entries from blocklist.ts and re-reads on the
  // 'blocklist-change' event; visibility via the blocklistModalOpen store.
  import { onMount, onDestroy } from 'svelte';
  import { blocklistModalOpen } from './store';
  import { getBlocklist, removeBlockAt } from './blocklist';
  import type { BlockEntry } from './blocklist';

  let entries: BlockEntry[] = [];
  function refresh() { entries = getBlocklist(); }

  const onChange = () => refresh();
  onMount(() => window.addEventListener('blocklist-change', onChange));
  onDestroy(() => window.removeEventListener('blocklist-change', onChange));

  // Refresh whenever the modal is opened.
  $: if ($blocklistModalOpen) refresh();

  function remove(i: number) {
    removeBlockAt(i);
    refresh();
  }
  function close() { blocklistModalOpen.set(false); }
  function onBackdrop(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
</script>

{#if $blocklistModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" id="blocklist-modal" on:click={onBackdrop}>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Blockierte Songs</h3>
        <button class="modal-close" on:click={close}>×</button>
      </div>
      <div class="modal-body">
        <p class="blocklist-hint">Rechtsklick auf einen Song im Verlauf, um ihn zu blockieren. Blockierte Songs können nicht mehr angefragt werden.</p>
        <div id="blocklist-items" class="blocklist-items">
          {#if entries.length === 0}
            <p class="blocklist-empty">Keine blockierten Songs.</p>
          {:else}
            {#each entries as e, i (e.ts)}
              <div class="blocklist-row">
                <div class="blocklist-info">
                  <span class="blocklist-title">{e.title || '—'}</span>
                  <span class="blocklist-artist">{e.artist || ''}</span>
                </div>
                <button class="blocklist-remove" title="Entsperren" on:click={() => remove(i)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

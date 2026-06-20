<script lang="ts">
  // Source-priority modal (drag to reorder the Windows-Audio sources). The data
  // lives in ./source-priority; this component renders the list reactively and
  // handles reordering. Order is only persisted on "Speichern"; remove/reset
  // persist immediately (matching the original behaviour).
  import {
    priorityModalOpen,
    priorityList,
    removeSource,
    savePriorityOrder,
    resetPriorityOrder,
    getSourceIcon,
    getSourceIconClass,
  } from './source-priority';

  // Working copy, seeded from the store each time the modal opens so an
  // in-progress reorder isn't clobbered by background source detection.
  let items: string[] = [];
  let lastOpen = false;
  $: if ($priorityModalOpen && !lastOpen) {
    items = [...$priorityList];
    lastOpen = true;
  }
  $: if (!$priorityModalOpen) lastOpen = false;

  // Pointer-based drag reorder. Native HTML5 drag is unreliable inside the Tauri
  // webview (the OS intercepts it), so we track pointer moves ourselves.
  let listEl: HTMLElement;
  let dragIndex: number | null = null;

  function onPointerDown(e: PointerEvent, i: number) {
    if ((e.target as HTMLElement).closest('.priority-remove')) return;
    e.preventDefault();
    dragIndex = i;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (dragIndex === null || !listEl) return;
    const rows = [...listEl.querySelectorAll<HTMLElement>('.priority-item')];
    let target = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { target = i; break; }
    }
    if (target !== dragIndex) {
      const arr = [...items];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(target, 0, moved);
      items = arr;
      dragIndex = target;
    }
  }

  function onPointerUp() {
    dragIndex = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function remove(source: string) {
    removeSource(source);
    items = items.filter((s) => s !== source);
  }

  async function reset() {
    items = await resetPriorityOrder();
  }

  function save() {
    savePriorityOrder(items);
    priorityModalOpen.set(false);
  }

  function close() {
    priorityModalOpen.set(false);
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

{#if $priorityModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" id="source-priority-modal" on:click={onBackdrop}>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </div>
        <h3 data-i18n="settings.system.sourcePriorityTitle">Quellen-Priorität</h3>
        <button class="modal-close" on:click={close}>×</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro" data-i18n="settings.system.sourcePriorityDesc">Ziehe die Quellen in die gewünschte Reihenfolge. Die oberste Quelle hat höchste Priorität.</p>

        <div id="source-priority-list" class="priority-list" bind:this={listEl}>
          {#if items.length === 0}
            <div class="priority-empty">
              <p data-i18n="settings.system.sourcePriorityEmpty">Noch keine Quellen erkannt. Spiele Musik ab um Quellen zu erkennen.</p>
            </div>
          {:else}
            {#each items as source, index (source)}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="priority-item"
                class:dragging={dragIndex === index}
                on:pointerdown={(e) => onPointerDown(e, index)}
              >
                <span class="priority-rank">{index + 1}</span>
                <span class="priority-icon {getSourceIconClass(source)}">{@html getSourceIcon(source)}</span>
                <span class="priority-name">{source}</span>
                <button class="priority-remove" title="Entfernen" on:click={() => remove(source)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
                <span class="priority-drag-handle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
                  </svg>
                </span>
              </div>
            {/each}
          {/if}
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" data-i18n="common.reset" on:click={reset}>Zurücksetzen</button>
          <button class="btn btn-primary" data-i18n="common.save" on:click={save}>Speichern</button>
        </div>
      </div>
    </div>
  </div>
{/if}

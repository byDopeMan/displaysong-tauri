<script lang="ts">
  // Renders the song-request queue reactively from the queueDisplay store.
  // Replaces the old manual innerHTML rendering in queue/index.ts — Svelte
  // auto-escapes {text} and attributes, so no escapeAttr() is needed here.
  import { queueDisplay } from './store';
  import { playSong, removeSong } from './index';

  const ICONS = {
    music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    chat: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    star: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    inbox: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>`,
  };
</script>

{#if $queueDisplay.length === 0}
  <div class="queue-empty">
    <div class="queue-empty-icon">{@html ICONS.inbox}</div>
    <p class="queue-empty-text">Queue ist leer</p>
    <p class="queue-empty-hint">Nutze !sr im Chat um Songs hinzuzufügen</p>
  </div>
{:else}
  {#each $queueDisplay as item (item.id)}
    <div class="queue-item">
      <div class="queue-item-position">{item.position}</div>

      <div class="queue-item-cover">
        {#if item.coverUrl}
          <img src={item.coverUrl} alt="Cover" />
        {:else}
          <div class="queue-item-cover-placeholder">{@html ICONS.music}</div>
        {/if}
      </div>

      <div class="queue-item-info">
        <div class="queue-item-track">
          {#if item.hasInfo}
            <span class="queue-item-title">{item.track}</span>
          {:else}
            <span class="queue-item-title loading">Lädt...</span>
          {/if}
        </div>
        <div class="queue-item-meta">
          {#if item.hasInfo}
            <span class="queue-item-artist">{item.artist}</span>
          {:else}
            <span class="queue-item-uri">{item.uriShort}...</span>
          {/if}
        </div>
        <div class="queue-item-requester">
          <span class="queue-item-source" title={item.isPoints ? 'Channel Points' : 'Chat Command'}>
            {@html item.isPoints ? ICONS.star : ICONS.chat}
          </span>
          <span class="queue-item-user">{item.user}</span>
          <span class="queue-item-time">{item.timeAgo}</span>
        </div>
      </div>

      <div class="queue-item-actions">
        <button class="queue-btn queue-btn-play" title="Jetzt abspielen" on:click={() => playSong(item.id, item.uri)}>
          {@html ICONS.play}
        </button>
        <button class="queue-btn queue-btn-remove" title="Entfernen" on:click={() => removeSong(item.id)}>
          {@html ICONS.trash}
        </button>
      </div>
    </div>
  {/each}
{/if}

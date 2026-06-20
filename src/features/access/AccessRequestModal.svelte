<script lang="ts">
  // Access-request modal (secret 420 developer-access flow). The form fields and
  // the #access-status div stay uncontrolled with their ids — submitAccessRequest
  // in ./index reads them and writes status messages by id. This component only
  // controls visibility and wires submit/close.
  import { accessModalOpen } from './store';
  import { submitAccessRequest } from './index';

  async function onSubmit(e: Event) {
    e.preventDefault();
    await submitAccessRequest();
  }

  function close() {
    accessModalOpen.set(false);
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

{#if $accessModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" id="access-request-modal" on:click={onBackdrop}>
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;">
            <circle cx="7.5" cy="15.5" r="5.5"></circle>
            <path d="M21 2l-9.6 9.6"></path>
            <path d="M15.5 7.5l3 3L22 7l-3-3"></path>
          </svg>
          Zugang anfragen
        </span>
        <button class="modal-close" on:click={close}>&times;</button>
      </div>
      <div class="modal-body">
        <p>Der Developer muss dich manuell freischalten. Gib deine Daten ein:</p>

        <form id="access-request-form" autocomplete="off" on:submit={onSubmit}>
          <div class="form-group">
            <label for="access-name">Name</label>
            <input type="text" id="access-name" placeholder="Dein Name" required />
          </div>
          <div class="form-group">
            <label for="access-email">Spotify E-Mail</label>
            <input type="text" id="access-email" placeholder="name@example.com" inputmode="email" autocomplete="off" required />
            <span class="hint">Die E-Mail deines Spotify Accounts!</span>
          </div>
          <div class="form-group">
            <label for="access-discord">Discord (optional)</label>
            <input type="text" id="access-discord" placeholder="username#1234" />
          </div>

          <div class="access-status hidden" id="access-status"></div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" on:click={close}>Abbrechen</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-access-a">Anfrage senden</button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

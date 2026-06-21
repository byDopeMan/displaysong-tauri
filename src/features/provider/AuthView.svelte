<script lang="ts">
  // Spotify OAuth waiting view (shown while the browser handles the login).
  import { showView } from '../../ui/navigation';
</script>

<div class="auth-container">
  <div class="spinner"></div>
  <h2>Spotify Autorisierung</h2>
  <p>Browser öffnet sich...</p>
  <p class="hint">Nach dem Login wirst du automatisch zurückgeleitet.</p>
  <button class="btn btn-secondary" on:click={() => showView('setup')}>Abbrechen</button>
</div>

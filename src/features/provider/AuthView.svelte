<script lang="ts">
  // Spotify OAuth waiting view (shown while the browser handles the login).
  import { showView } from '../../ui/navigation';
</script>

<div class="auth-container">
  <div class="spinner"></div>
  <h2 data-i18n="settings.connections.spotifyAuthTitle">Spotify Autorisierung</h2>
  <p data-i18n="settings.connections.spotifyAuthOpening">Browser öffnet sich...</p>
  <p class="hint" data-i18n="settings.connections.spotifyAuthHint">Nach dem Login wirst du automatisch zurückgeleitet.</p>
  <button class="btn btn-secondary" data-i18n="common.cancel" on:click={() => showView('setup')}>Abbrechen</button>
</div>

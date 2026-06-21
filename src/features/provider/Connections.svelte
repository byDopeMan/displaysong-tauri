<script lang="ts">
  // Verbindungen (Spotify / Twitch). Content only — Settings.svelte wraps it in
  // the collapsible section. The Spotify status/buttons are driven by provider-ui
  // + provider/auth, the Twitch status/buttons by the twitch module, the Spotify
  // disconnect by core/events — all by id. The gear button opens the Twitch
  // settings panel via the store.
  import { twitchPanelOpen } from '../twitch/store';
</script>

<!-- Spotify Connection -->
<div class="connection-item" id="spotify-connection">
  <div class="connection-header">
    <div class="connection-info">
      <span class="connection-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      </span>
      <div class="connection-details">
        <span class="connection-name" data-i18n="settings.connections.spotify">Spotify</span>
        <span class="connection-status" id="spotify-status-text" data-i18n="settings.connections.notConnected">Nicht verbunden</span>
      </div>
    </div>
    <button id="btn-spotify-connect" class="btn btn-small btn-primary" data-i18n="settings.connections.connect">Verbinden</button>
    <button id="btn-disconnect" class="btn btn-small btn-secondary hidden" data-i18n="settings.connections.disconnect">Trennen</button>
  </div>
</div>

<!-- Twitch Connection -->
<div class="connection-item" id="twitch-connection">
  <div class="connection-header">
    <div class="connection-info">
      <span class="connection-icon twitch">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
        </svg>
      </span>
      <div class="connection-details">
        <span class="connection-name" data-i18n="settings.connections.twitch">Twitch</span>
        <span class="connection-status" id="twitch-status-text" data-i18n="settings.connections.notConnected">Nicht verbunden</span>
      </div>
    </div>
    <button id="btn-twitch-connect" class="btn btn-small btn-primary" data-i18n="settings.connections.connect">Verbinden</button>
    <button id="btn-twitch-settings" class="btn btn-small btn-icon hidden" data-i18n-title="settings.twitchOpenSettings" title="Twitch-Einstellungen" on:click={() => twitchPanelOpen.set(true)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
    <button id="btn-twitch-disconnect" class="btn btn-small btn-secondary hidden" data-i18n="settings.connections.disconnect">Trennen</button>
  </div>
</div>

<!-- Alle trennen Button (nur wenn mehrere verbunden) -->
<button id="btn-disconnect-all" class="btn btn-secondary btn-small hidden" style="margin-top: 12px;" data-i18n="settings.connections.disconnectAll">Alle Verbindungen trennen</button>

<script lang="ts">
  // Initial setup view (provider selection) as a Svelte component. The logic
  // lives in ./setup; the 420 secret code is still a document-level listener
  // wired by initSetupFlow().
  import { showView } from '../../ui/navigation';
  import { useWindowsAudio } from './setup';
</script>

<div class="setup-container">
  <div class="logo">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  </div>
  <h1>DisplaySong</h1>
  <p data-i18n="setup.tagline">Now Playing Widget für OBS</p>

  <!-- Provider Auswahl -->
  <div class="setup-providers">
    <h3 data-i18n="setup.chooseSource">Musik-Quelle wählen</h3>

    <!-- Windows Audio - Default, kein Setup -->
    <div class="provider-card" id="provider-windows">
      <div class="provider-icon windows">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
        </svg>
      </div>
      <div class="provider-info">
        <h4>Windows Audio</h4>
        <p data-i18n="setup.windowsAudioDesc">Erkennt automatisch Musik von Spotify, YouTube, VLC, Browser und mehr.</p>
        <span class="provider-badge recommended" data-i18n="setup.recommended">Empfohlen</span>
      </div>
      <button id="btn-use-windows-audio" class="btn btn-primary" data-i18n="setup.startNow" on:click={useWindowsAudio}>Sofort starten</button>
    </div>

    <!-- Spotify API - Erweiterte Features -->
    <div class="provider-card" id="provider-spotify">
      <div class="provider-icon spotify">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      </div>
      <div class="provider-info">
        <h4>Spotify API</h4>
        <p data-i18n="setup.spotifyDesc">Für Auto-Queue, Playlist-Sync und erweiterte Song Request Features.</p>
        <span class="provider-badge optional" data-i18n="setup.optional">Optional</span>
      </div>
      <button id="btn-setup-spotify" class="btn btn-secondary" data-i18n="setup.configure" on:click={() => showView('spotify-setup')}>Einrichten</button>
    </div>
  </div>

  <!-- Hidden: 420 code still works via keyboard input -->
</div>

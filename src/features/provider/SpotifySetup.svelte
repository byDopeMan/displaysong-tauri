<script lang="ts">
  // Spotify credentials setup view as a Svelte component. The inputs stay
  // uncontrolled (kept with their ids) because the 420/developer-credentials
  // access flow writes into them via getElementById; the submit reads them at
  // submit time, like the original setup.ts did.
  import { showNotification } from '../../ui/notifications';
  import { connectSpotify, goBackFromSpotifySetup } from './setup';

  let clientIdEl: HTMLInputElement;
  let clientSecretEl: HTMLInputElement;
  let submitBtn: HTMLButtonElement;

  async function onSubmit(e: Event) {
    e.preventDefault();

    const clientId = clientIdEl?.value?.trim();
    const clientSecret = clientSecretEl?.value?.trim();

    if (!clientId || !clientSecret) {
      showNotification('Bitte beide Felder ausfüllen', { type: 'error' });
      return;
    }

    const originalText = submitBtn?.textContent || 'Speichern & Verbinden';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verbinde...';
    }
    const resetButton = () => {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    };

    try {
      await connectSpotify(clientId, clientSecret);
      setTimeout(resetButton, 1500);
    } catch (err) {
      console.error('[Setup] Spotify setup error:', err);
      showNotification('Fehler: ' + err, { type: 'error' });
      resetButton();
    }
  }
</script>

<div class="setup-container">
  <button id="btn-back-to-setup" class="btn-back" on:click={goBackFromSpotifySetup}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 12H5M12 19l-7-7 7-7"></path>
    </svg>
    Zurück
  </button>

  <div class="logo spotify-logo">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="#1db954">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  </div>
  <h2>Spotify verbinden</h2>
  <p>Für Auto-Queue und erweiterte Features benötigst du eine Spotify App.</p>

  <form id="credentials-form" class="credentials-form" autocomplete="off" on:submit={onSubmit}>
    <div class="form-group">
      <label for="client-id">Client ID</label>
      <input type="text" id="client-id" placeholder="Deine Spotify Client ID" required bind:this={clientIdEl} />
    </div>
    <div class="form-group">
      <label for="client-secret">Client Secret</label>
      <input type="password" id="client-secret" placeholder="Dein Spotify Client Secret" required bind:this={clientSecretEl} />
    </div>
    <button type="submit" class="btn btn-primary" bind:this={submitBtn}>Speichern & Verbinden</button>
  </form>

  <div class="setup-help">
    <p>So erstellst du eine Spotify App:</p>
    <a href="https://developer.spotify.com/dashboard" target="_blank" class="setup-link">
      Spotify Developer Dashboard →
    </a>
    <p class="hint">Redirect URI: <code>http://127.0.0.1:8888/callback</code></p>
  </div>
</div>

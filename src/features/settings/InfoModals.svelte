<script lang="ts">
  // Static app-info modals (changelog + licenses), opened from the About block.
  // Changelog mirrors /CHANGELOG.md; licenses reflect the real dependencies
  // (src-tauri/Cargo.toml + build toolchain).
  import { infoModal } from './info-modal';
  function close() { infoModal.set(null); }
  function onBackdrop(e: MouseEvent) { if (e.target === e.currentTarget) close(); }
</script>

{#if $infoModal === 'changelog'}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" id="changelog-modal" on:click={onBackdrop}>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Changelog</h3>
        <button class="modal-close" on:click={close}>×</button>
      </div>
      <div class="modal-body">
        <div class="changelog-entry">
          <h4>v4.1.0</h4>
          <p class="changelog-sub">Requester-Anzeige</p>
          <ul>
            <li>Bei Song-Requests wird der Name des Requesters angezeigt — im Player-Tab und in den Widgets.</li>
            <li>Neue Checkbox in „Designs": „Requester bei Song-Requests in Widgets anzeigen".</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v4.0.0</h4>
          <p class="changelog-sub">Universelle Musik-Erkennung &amp; Provider</p>
          <ul>
            <li>Erkennung aller Player über die Windows Media Session API; Spotify wird beim Start immer verbunden (auch im Windows-Audio-Modus).</li>
            <li>Source-Priorität greift jetzt: das Backend enumeriert alle Sessions und wählt nach der eingestellten Reihenfolge.</li>
            <li>Twitch/Livestreams werden nicht mehr als Song erkannt.</li>
            <li>Progress-Bar synchron: Position wird live hochgerechnet.</li>
          </ul>
          <p class="changelog-sub">Twitch</p>
          <ul>
            <li>Channel Points: Modus-Umschalter, Reward-Auswahl/-Erstellung, „Test-Einlösung simulieren" (ohne Affiliate/Partner testbar), Scope-Check/Re-Auth.</li>
            <li>Master-Schalter „Song Requests" deaktiviert die Funktion jetzt wirklich.</li>
            <li>Request-Historie ↔ Spotify-Playlist umschaltbar.</li>
          </ul>
          <p class="changelog-sub">Queue</p>
          <ul>
            <li>Queue-Buttons (Play/Entfernen/Leeren) wieder klickbar.</li>
            <li>Auto-Play: spielt die Request-Queue der Reihe nach, sobald der laufende Song endet.</li>
          </ul>
          <p class="changelog-sub">App</p>
          <ul>
            <li>Single-Instance: die App lässt sich nur einmal öffnen.</li>
            <li>WebView2-Cache deaktiviert, damit Updates immer frisch laden.</li>
            <li>Smooth Scroll-to-Top beim Tab-Wechsel; diverse Layout-Fixes.</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v2.3.0</h4>
          <p class="changelog-sub">Multi-Platform Song Requests</p>
          <ul>
            <li>YouTube-, Apple-Music- und SoundCloud-Links werden automatisch konvertiert.</li>
            <li>Weitere Plattformen: Deezer, Tidal, Amazon Music, Pandora.</li>
            <li>Songlink/Odesli API zur automatischen Konvertierung zu Spotify.</li>
          </ul>
          <p class="changelog-sub">Installer &amp; Persistenz</p>
          <ul>
            <li>Neuer NSIS-Installer mit Komponenten-Auswahl und Upgrade-Erkennung.</li>
            <li>SQLite-Persistenz: die Song-Request-Queue bleibt nach Neustart erhalten.</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v2.2.0</h4>
          <ul>
            <li>WebView2-Transparenz-Fix (gebündelte Runtime) — Widgets wieder voll transparent.</li>
            <li>Performance: Lazy Loading, Color-Cache, Single-Thread-Runtime (~230 MB RAM gespart).</li>
            <li>Modulare Rust-Code-Struktur; Auto-Updater aktiv.</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v2.1.1</h4>
          <ul>
            <li>Lade-Bildschirm beim Start mit Status-Anzeige</li>
            <li>Visuelle Animation beim Minimieren ins Tray</li>
            <li>Automatisches Logging in %AppData%/logs</li>
            <li>Bugfixes und Performance-Verbesserungen</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v2.1.0</h4>
          <ul>
            <li>Custom Akzentfarbe mit Color Picker</li>
            <li>Akzentfarbe für Design 1 &amp; 2 optional aktivierbar</li>
            <li>Song-Info kopieren Button im Player</li>
            <li>Verlauflänge einstellbar (10-100 Songs)</li>
            <li>Widget-Transparenz einstellbar</li>
            <li>Spotify Embed Ansicht im Verlauf</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v2.0.0</h4>
          <ul>
            <li>Kompletter Rewrite mit Tauri</li>
            <li>Kein Server mehr nötig - läuft komplett lokal</li>
            <li>4 Widget-Designs (2 fest, 2 anpassbar)</li>
            <li>Dynamische Farben aus Album-Cover</li>
            <li>Custom Widgets im AppData-Ordner bearbeitbar</li>
          </ul>
        </div>

        <div class="changelog-entry">
          <h4>v1.0.0</h4>
          <ul>
            <li>Erste Version mit Node.js Server</li>
            <li>Browser-basierte Widgets</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if $infoModal === 'licenses'}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" id="licenses-modal" on:click={onBackdrop}>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Lizenzen</h3>
        <button class="modal-close" on:click={close}>×</button>
      </div>
      <div class="modal-body">
        <p class="license-intro">DisplaySong nutzt folgende Open-Source-Projekte:</p>

        <div class="license-entry">
          <h4>Tauri</h4>
          <p>Apache-2.0 / MIT - App-Framework · <a href="https://tauri.app" target="_blank">tauri.app</a></p>
        </div>
        <div class="license-entry">
          <h4>Tokio</h4>
          <p>MIT - Async-Runtime für Rust</p>
        </div>
        <div class="license-entry">
          <h4>reqwest</h4>
          <p>MIT / Apache-2.0 - HTTP-Client</p>
        </div>
        <div class="license-entry">
          <h4>tokio-tungstenite</h4>
          <p>MIT - WebSocket (Twitch EventSub)</p>
        </div>
        <div class="license-entry">
          <h4>Serde</h4>
          <p>MIT / Apache-2.0 - Serialisierung</p>
        </div>
        <div class="license-entry">
          <h4>rusqlite / SQLite</h4>
          <p>MIT (rusqlite), Public Domain (SQLite) - Song-Request-Queue</p>
        </div>
        <div class="license-entry">
          <h4>keyring</h4>
          <p>MIT / Apache-2.0 - Sichere Zugangsdaten-Speicherung</p>
        </div>
        <div class="license-entry">
          <h4>image</h4>
          <p>MIT / Apache-2.0 - Farbermittlung aus Album-Covern</p>
        </div>
        <div class="license-entry">
          <h4>windows-rs</h4>
          <p>MIT / Apache-2.0 - Windows Media Session API</p>
        </div>
        <div class="license-entry">
          <h4>chrono · log · fern</h4>
          <p>MIT / Apache-2.0 - Zeit &amp; Logging</p>
        </div>
        <div class="license-entry">
          <h4>Svelte · Vite · TypeScript</h4>
          <p>MIT / Apache-2.0 - Frontend &amp; Build-Toolchain</p>
        </div>
        <div class="license-entry">
          <p class="license-text">…sowie weitere Rust-Crates (urlencoding, open, once_cell, futures-util, regex-lite, dotenvy) unter MIT / Apache-2.0.</p>
        </div>

        <hr class="license-divider">

        <div class="license-entry">
          <h4>DisplaySong</h4>
          <p>MIT License</p>
          <p class="license-text">Copyright © 2024 - Frei zur Nutzung, Modifikation und Verteilung.</p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .changelog-sub {
    font-weight: 600;
    font-size: 13px;
    opacity: 0.8;
    margin: 12px 0 4px;
  }
</style>

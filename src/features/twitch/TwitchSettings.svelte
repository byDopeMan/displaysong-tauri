<!--
  Twitch song-request settings section (markup only). All controls are wired by
  the twitch module + provider-ui by id after this island mounts.
-->
        <div class="settings-section" id="twitch-settings-section">
          <h3 data-i18n="settings.twitch.title">Twitch</h3>
          
          <div class="setting-row">
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label data-i18n="settings.twitch.channel">Channel</label>
            <span id="twitch-channel-display" class="setting-value channel-name">-</span>
          </div>
          
          <!-- Song Requests Toggle Section -->
          <div class="collapsible-section">
            <div class="collapsible-header">
              <h4 class="collapsible-title" data-i18n="settings.twitch.songRequests">Song Requests</h4>
              <label class="toggle-switch">
                <input type="checkbox" id="song-requests-toggle" checked>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="collapsible-content" id="song-requests-content">
          
          <!-- Scope-Warnung (veraltete Twitch-Berechtigungen) -->
          <div class="setting-notice warning hidden" id="twitch-scope-warning">
            <div class="notice-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div class="notice-content">
              <strong data-i18n="settings.twitch.scopeWarningTitle">Berechtigungen veraltet</strong>
              <p data-i18n="settings.twitch.scopeWarningText">Bitte trenne und verbinde Twitch neu, damit alle Funktionen (Channel Points, Chat) verfügbar sind.</p>
            </div>
          </div>

          <!-- Modus: Chat-Command oder Channel Points -->
          <div class="setting-row">
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label data-i18n="settings.twitch.mode">Modus</label>
            <div class="toggle-group" id="twitch-mode-toggle">
              <button class="toggle-btn active" data-mode="commands" data-i18n="settings.twitch.modeCommand">Chat-Command</button>
              <button class="toggle-btn" data-mode="points" data-i18n="settings.twitch.modePoints">Channel Points</button>
            </div>
          </div>

          <!-- Channel-Points-Einstellungen (nur im Points-Modus sichtbar) -->
          <div id="twitch-points-mode-settings" class="hidden">
            <div class="setting-notice info">
              <div class="notice-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div class="notice-content">
                <strong data-i18n="settings.twitch.pointsModeTitle">Channel Points Modus</strong>
                <p data-i18n="settings.twitch.pointsModeText">Zuschauer lösen Songs über eine Kanalpunkte-Belohnung ein. Cooldown & Zugriffsbeschränkung steuerst du direkt an der Belohnung auf Twitch.</p>
              </div>
            </div>
            <div class="setting-row setting-row-vertical">
              <div class="setting-row-top">
                <label for="twitch-reward-select" data-i18n="settings.twitch.reward">Belohnung</label>
                <select id="twitch-reward-select" class="setting-select">
                  <option value="" data-i18n="settings.twitch.rewardNone">— Belohnung wählen —</option>
                </select>
              </div>
              <p class="setting-hint" data-i18n="settings.twitch.rewardHint">Die Einlösung dieser Belohnung löst einen Song-Request aus.</p>
            </div>
            <div class="setting-row-buttons">
              <button id="btn-twitch-refresh-rewards" class="btn btn-secondary btn-small">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span data-i18n="settings.twitch.refreshRewards">Aktualisieren</span>
              </button>
              <button id="btn-twitch-create-reward" class="btn btn-secondary btn-small">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span data-i18n="settings.twitch.createReward">Neue Belohnung</span>
              </button>
            </div>
            <div id="twitch-create-reward-form" class="hidden reward-create-form">
              <div class="setting-row">
                <label for="twitch-reward-title" data-i18n="settings.twitch.rewardTitle">Titel</label>
                <input type="text" id="twitch-reward-title" class="setting-input setting-input-small" value="Song Request" maxlength="45">
              </div>
              <div class="setting-row">
                <label for="twitch-reward-cost" data-i18n="settings.twitch.rewardCost">Kosten (Punkte)</label>
                <input type="number" id="twitch-reward-cost" class="setting-input setting-input-small" value="500" min="1">
              </div>
              <button id="btn-twitch-save-reward" class="btn btn-primary btn-small" data-i18n="settings.twitch.rewardCreateBtn">Belohnung erstellen</button>
            </div>

            <!-- Test ohne Affiliate/Partner -->
            <div class="subsection-divider"></div>
            <div class="setting-notice info">
              <div class="notice-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </div>
              <div class="notice-content">
                <strong data-i18n="settings.twitch.testTitle">Ohne Affiliate/Partner testen</strong>
                <p data-i18n="settings.twitch.testText">Die Channel-Points-API von Twitch benötigt Affiliate- oder Partner-Status. Du kannst den kompletten Ablauf (Link → Spotify → Queue) hier simulieren, ohne eine echte Belohnung.</p>
              </div>
            </div>
            <div class="setting-row setting-row-vertical">
              <div class="setting-row-top">
                <label for="twitch-test-link" data-i18n="settings.twitch.testLink">Test-Link</label>
                <input type="text" id="twitch-test-link" class="setting-input" placeholder="https://open.spotify.com/track/...">
              </div>
            </div>
            <button id="btn-twitch-test-redemption" class="btn btn-secondary btn-small">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span data-i18n="settings.twitch.testRedemption">Test-Einlösung simulieren</span>
            </button>
          </div>

          <!-- Chat-Command-Einstellungen (nur im Command-Modus sichtbar) -->
          <div id="twitch-command-mode-settings">
          <!-- Link-Erlaubnis Hinweis -->
          <div class="setting-notice info" id="twitch-link-notice">
            <div class="notice-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </div>
            <div class="notice-content">
              <strong data-i18n="settings.twitch.linkProtectTitle">Link-Schutz aktiv</strong>
              <p data-i18n="settings.twitch.linkProtectText">Wenn dein Chat Links blockiert, können User !sr ohne Link schreiben. Der Bot gibt dann automatisch eine 60-Sekunden Link-Erlaubnis.</p>
              <p class="notice-requirement" data-i18n="settings.twitch.linkProtectReq">Voraussetzung: Der Bot muss Moderator in deinem Channel sein.</p>
            </div>
          </div>
          
          <div class="setting-row">
            <label for="twitch-command" data-i18n="settings.twitch.command">Command</label>
            <input type="text" id="twitch-command" class="setting-input setting-input-small" value="!sr" placeholder="!sr">
          </div>
          
          <div class="setting-row">
            <label for="twitch-cooldown" data-i18n="settings.twitch.cooldown">Cooldown (Sekunden)</label>
            <input type="number" id="twitch-cooldown" class="setting-input setting-input-small" value="30" min="0" max="300">
          </div>
          
          <div class="setting-row">
            <label for="twitch-sub-only" data-i18n="settings.twitch.subOnly">Nur für Subscriber</label>
            <input type="checkbox" id="twitch-sub-only" class="setting-checkbox">
          </div>
          </div>
          <!-- /twitch-command-mode-settings -->

          <div class="setting-row">
            <label for="twitch-max-duration" data-i18n="settings.twitch.maxDuration">Max. Song-Länge (Minuten)</label>
            <input type="number" id="twitch-max-duration" class="setting-input setting-input-small" value="0" min="0" max="60">
          </div>
          <p class="setting-hint" data-i18n="settings.twitch.maxDurationHint">0 = unbegrenzt</p>
          
          <div class="setting-row">
            <label for="twitch-duplicate-check" data-i18n="settings.twitch.duplicateCheck">Duplikate prüfen</label>
            <input type="checkbox" id="twitch-duplicate-check" class="setting-checkbox" checked>
          </div>
          <p class="setting-hint" data-i18n="settings.twitch.duplicateCheckHint">Verhindert, dass der gleiche Song mehrfach in der Queue ist</p>

          <div class="setting-row setting-row-vertical">
            <div class="setting-row-top">
              <label for="twitch-use-bot" data-i18n="settings.twitch.chatAccount">Chat-Account</label>
              <select id="twitch-use-bot" class="setting-select">
                <option value="true" data-i18n="settings.twitch.botAccount">DisplaySong Bot</option>
                <option value="false" id="twitch-user-option" data-i18n="settings.twitch.ownAccount">Eigener Account</option>
              </select>
            </div>
            <div class="setting-hint-box" id="twitch-chat-preview">
              <span class="chat-preview-label" data-i18n="settings.twitch.preview">Vorschau:</span>
              <span class="chat-preview-msg"><strong id="chat-sender-name" class="chat-sender-name bot-name">DisplaySong</strong>: <span class="preview-icon"></span> Jetzt läuft: Artist - Song</span>
            </div>
          </div>
          
          <div class="setting-row-buttons">
            <button id="btn-twitch-messages" class="btn btn-secondary btn-small">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span data-i18n="settings.twitch.customizeMessages">Nachrichten anpassen</span>
            </button>
            <button id="btn-twitch-test" class="btn btn-secondary btn-small">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              <span data-i18n="settings.twitch.testMessage">Test senden</span>
            </button>
          </div>
          
          <!-- Request Historie (innerhalb Song Requests) -->
          <div class="subsection-divider"></div>
          <h4 class="subsection-title" data-i18n="settings.twitch.requestHistory">Request Historie</h4>
          
          <div class="setting-row">
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label data-i18n="settings.twitch.storageLocation">Speicherort</label>
            <div class="toggle-group" id="history-storage-toggle">
              <button class="toggle-btn active" data-storage="local" data-i18n="settings.twitch.storageLocal">Lokal</button>
              <button class="toggle-btn" data-storage="spotify" data-i18n="settings.twitch.storageSpotify">Spotify Playlist</button>
            </div>
          </div>
          
          <!-- Lokale DB Einstellungen -->
          <div id="local-history-settings">
            <p class="setting-hint" data-i18n="settings.twitch.localStorageHint">Songs werden in einer lokalen Datenbank gespeichert.</p>
          </div>
          
          <!-- Spotify Playlist Einstellungen -->
          <div id="spotify-playlist-settings" class="hidden">
            <!-- Wenn noch nicht eingerichtet -->
            <div id="playlist-setup-container">
              <p class="setting-hint" data-i18n="settings.twitch.playlistStorageHint">Songs werden automatisch zu einer Spotify Playlist hinzugefügt.</p>
              <button id="btn-setup-playlist" class="btn btn-secondary btn-small">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <span data-i18n="settings.twitch.setupPlaylist">Playlist einrichten</span>
              </button>
            </div>
            
            <!-- Wenn eingerichtet -->
            <div id="playlist-configured-container" class="hidden">
              <div class="setting-row">
                <!-- svelte-ignore a11y-label-has-associated-control -->
                <label data-i18n="settings.twitch.activePlaylist">Aktive Playlist</label>
                <span id="playlist-name-display" class="setting-value">-</span>
              </div>
              <div class="setting-row">
                <label for="playlist-auto-add" data-i18n="settings.twitch.autoAdd">Automatisch hinzufügen</label>
                <input type="checkbox" id="playlist-auto-add" class="setting-checkbox" checked>
              </div>
              <div class="setting-row-buttons">
                <button id="btn-open-playlist" class="btn btn-secondary btn-small">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  <span data-i18n="settings.twitch.openInSpotify">In Spotify öffnen</span>
                </button>
                <button id="btn-delete-playlist" class="btn btn-danger btn-small">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span data-i18n="settings.twitch.deletePlaylist">Playlist löschen</span>
                </button>
              </div>
            </div>
          </div>
          
            </div><!-- /collapsible-content -->
          </div><!-- /collapsible-section -->
        </div>

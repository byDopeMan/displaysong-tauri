<!--
  Leftover modal shells (plugin settings, Twitch OAuth/messages, Spotify
  playlist setup, Spotify re-auth). Markup only — the owning modules open them
  and the generic .modal-close handler closes them, all by id after mount.
-->
      <!-- Plugin Settings Modal -->
      <div id="plugin-settings-modal" class="modal plugin-settings-modal hidden">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-icon" id="plugin-modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"></path>
              </svg>
            </div>
            <h3 id="plugin-modal-title" data-i18n="plugins.settingsTitle">Plugin Einstellungen</h3>
            <button class="modal-close" data-modal="plugin-settings-modal">×</button>
          </div>
          <div class="modal-body" id="plugin-modal-body">
            <div class="plugin-no-settings">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4M12 8h.01"></path>
              </svg>
              <p data-i18n="plugins.noSettings">Dieses Plugin hat keine Einstellungen</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Twitch OAuth Modal - zeigt Warte-Status während OAuth im Browser -->
      <div id="twitch-oauth-modal" class="modal hidden">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <div class="modal-icon twitch">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
              </svg>
            </div>
            <h3 data-i18n="settings.twitch.connectTwitchTitle">Mit Twitch verbinden</h3>
            <button class="modal-close" data-modal="twitch-oauth-modal">&times;</button>
          </div>
          <div class="modal-body oauth-modal-body">
            <div class="oauth-status" id="twitch-oauth-status">
              <div class="spinner"></div>
              <p data-i18n="settings.twitch.oauthOpening">Browser öffnet sich...</p>
              <p class="hint" data-i18n="settings.twitch.oauthTwitchHint">Melde dich bei Twitch an und erlaube den Zugriff.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button id="btn-cancel-twitch-auth" class="btn btn-secondary" data-i18n="common.cancel">Abbrechen</button>
          </div>
        </div>
      </div>
      
      <!-- Spotify Playlist Setup Modal -->
      <div id="playlist-setup-modal" class="modal hidden">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path>
                <circle cx="6" cy="18" r="3"></circle>
                <circle cx="18" cy="16" r="3"></circle>
              </svg>
            </div>
            <h3 data-i18n="settings.twitch.setupPlaylistTitle">Spotify Playlist einrichten</h3>
            <button class="modal-close" data-modal="playlist-setup-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-intro" data-i18n="settings.twitch.playlistSetupIntro">Erstelle eine Playlist, in der alle Song Requests automatisch gespeichert werden.</p>

            <div class="form-group">
              <label for="playlist-name" data-i18n="settings.twitch.playlistName">Playlist Name</label>
              <input type="text" id="playlist-name" class="setting-input" value="DisplaySong Requests" placeholder="Name der Playlist" data-i18n-placeholder="settings.twitch.playlistNamePlaceholder">
            </div>

            <div class="form-group">
              <label for="playlist-description" data-i18n="settings.twitch.playlistDescription">Beschreibung (optional)</label>
              <input type="text" id="playlist-description" class="setting-input" placeholder="Song Requests von Twitch Chat" data-i18n-placeholder="settings.twitch.playlistDescriptionPlaceholder">
            </div>

            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="playlist-public" class="setting-checkbox">
                <span data-i18n="settings.twitch.playlistPublic">Öffentliche Playlist</span>
              </label>
            </div>

            <div id="playlist-setup-error" class="error-message hidden"></div>
          </div>
          <div class="modal-footer">
            <button id="btn-cancel-playlist" class="btn btn-secondary" data-close-modal data-i18n="common.cancel">Abbrechen</button>
            <button id="btn-create-playlist" class="btn btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span data-i18n="settings.twitch.createPlaylist">Playlist erstellen</span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Re-Auth Modal (wenn Scopes fehlen) -->
      <div id="reauth-modal" class="modal hidden">
        <div class="modal-content modal-small">
          <div class="modal-header">
            <div class="modal-icon warning">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <h3 data-i18n="settings.reauth.title">Erneute Anmeldung erforderlich</h3>
            <button class="modal-close" data-modal="reauth-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p data-i18n="settings.reauth.text">Für diese Funktion werden zusätzliche Berechtigungen benötigt.</p>
            <p class="hint" data-i18n="settings.reauth.hint">Du wirst zu Spotify weitergeleitet, um die Berechtigungen zu erteilen.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-close-modal data-i18n="settings.reauth.later">Später</button>
            <button id="btn-reauth" class="btn btn-primary" data-i18n="settings.reauth.now">Jetzt anmelden</button>
          </div>
        </div>
      </div>
      
      <!-- Twitch Messages Modal -->
      <div id="twitch-messages-modal" class="modal hidden">
        <div class="modal-content">
          <div class="modal-header">
            <div class="modal-icon twitch">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3 data-i18n="settings.twitch.messagesTitle">Chat-Nachrichten anpassen</h3>
            <button class="modal-close" data-modal="twitch-messages-modal">×</button>
          </div>
          <div class="modal-body">
            <p class="modal-intro" data-i18n="settings.twitch.messagesIntro">Passe die Nachrichten an, die im Chat gesendet werden. Verwende Platzhalter für dynamische Inhalte.</p>
            
            <div class="message-editor-group">
              <label for="msg-now-playing" data-i18n="settings.twitch.msgNowPlaying">Aktueller Song</label>
              <input type="text" id="msg-now-playing" class="setting-input" value="Jetzt läuft: &#123;artist&#125; - &#123;title&#125;">
              <span class="hint"><span data-i18n="settings.twitch.placeholders">Platzhalter</span>: &#123;artist&#125;, &#123;title&#125;, &#123;album&#125;, &#123;url&#125;</span>
            </div>
            
            <div class="message-editor-group">
              <label for="msg-song-added" data-i18n="settings.twitch.msgSongAdded">Song zur Queue hinzugefügt</label>
              <input type="text" id="msg-song-added" class="setting-input" value="@&#123;user&#125; hat hinzugefügt: &#123;artist&#125; - &#123;title&#125;">
              <span class="hint"><span data-i18n="settings.twitch.placeholders">Platzhalter</span>: &#123;user&#125;, &#123;artist&#125;, &#123;title&#125;, &#123;album&#125;, &#123;url&#125;</span>
            </div>
            
            <div class="message-editor-group">
              <label for="msg-song-not-found" data-i18n="settings.twitch.msgSongNotFound">Song nicht gefunden</label>
              <input type="text" id="msg-song-not-found" class="setting-input" value="@&#123;user&#125; Song nicht gefunden. Versuche: !sr Spotify-Link">
              <span class="hint"><span data-i18n="settings.twitch.placeholders">Platzhalter</span>: &#123;user&#125;, &#123;query&#125;</span>
            </div>
            
            <div class="message-editor-group">
              <label for="msg-cooldown" data-i18n="settings.twitch.msgCooldown">Cooldown aktiv</label>
              <input type="text" id="msg-cooldown" class="setting-input" value="@&#123;user&#125; Bitte warte noch &#123;seconds&#125;s">
              <span class="hint"><span data-i18n="settings.twitch.placeholders">Platzhalter</span>: &#123;user&#125;, &#123;seconds&#125;</span>
            </div>
            
            <div class="modal-footer">
              <button id="btn-reset-messages" class="btn btn-secondary" data-i18n="common.reset">Zurücksetzen</button>
              <button id="btn-save-messages" class="btn btn-primary" data-i18n="common.save">Speichern</button>
            </div>
          </div>
        </div>
      </div>

<!--
  Plugins view (markup only). The toolbar buttons, settings panel and the
  #plugin-list mount are wired/filled by the plugins module by id after mount.
-->
        <div class="plugins-header">
          <h2>Plugins</h2>
          <div class="plugins-actions">
            <button id="btn-plugins-folder" class="btn btn-icon" title="Plugin-Ordner öffnen">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
            <button id="btn-import-plugin" class="btn btn-icon" title="Plugin aus ZIP importieren">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button id="btn-refresh-plugins" class="btn btn-icon" title="Liste aktualisieren">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <!--<p class="plugins-intro">Erweitere DisplaySong mit Plugins. Plugins können auf Track-Daten zugreifen, HTTP-Requests machen und eigene Daten speichern.</p>--> 
        
        <div id="plugin-list" class="plugin-list">
          <div class="plugins-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"></path>
            </svg>
            <p>Keine Plugins installiert</p>
            <p class="hint">Plugins in den Plugin-Ordner kopieren oder ZIP importieren</p>
          </div>
        </div>
        
        <!-- Plugin Settings (von Plugins dynamisch befüllt) -->
        <div id="plugin-settings-container"></div>
        
        <!-- Plugin Settings Panel (inline, wie Compact Bar Editor) -->
        <div id="plugin-settings-panel" class="plugin-settings-panel hidden">
          <div class="plugin-settings-panel-header">
            <button id="btn-close-plugin-panel" class="btn-back" title="Zurück">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div class="panel-title">
              <span class="panel-icon" id="plugin-panel-icon"></span>
              <h3 id="plugin-panel-title">Plugin Einstellungen</h3>
            </div>
          </div>
          <div class="plugin-settings-panel-body" id="plugin-panel-body">
            <div class="plugin-no-settings">
              <p>Wähle ein Plugin aus der Liste</p>
            </div>
          </div>
        </div>
        
        <div class="plugins-docs">
          <h3>Plugin entwickeln</h3>
          <p>Plugins sind JavaScript-Module mit einer <code>manifest.json</code>.</p>
          <p>Docs: <a href="https://github.com/byDopeMan/displaysong-tauri/blob/main/PLUGIN.md" target="_blank" rel="noopener">PLUGIN.md</a></p>
        </div>

/**
 * Example Plugin für DisplaySong
 * 
 * Zeigt die Plugin-API inkl. Settings Modal.
 * Kopiere diesen Ordner in %APPDATA%/com.displaysong.app/plugins/
 */

(function(DisplaySong) {
  const { api, pluginId } = DisplaySong;
  
  // ============================================
  // INIT - Wird beim Laden aufgerufen
  // ============================================
  async function init() {
    console.log('[Example Plugin] Geladen!');
    
    // Settings für Modal registrieren
    // Diese erscheinen wenn der User auf das Zahnrad-Icon klickt
    api.registerSettings({
      title: 'Example Plugin',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      fields: [
        { 
          type: 'text', 
          key: 'username', 
          label: 'Benutzername', 
          placeholder: 'Dein Name...',
          onChange: (val) => console.log('Username geändert:', val)
        },
        { 
          type: 'toggle', 
          key: 'notifications', 
          label: 'Benachrichtigungen',
          default: true,
          onChange: (val) => console.log('Notifications:', val)
        },
        { 
          type: 'select', 
          key: 'theme', 
          label: 'Farbe', 
          options: [
            { value: 'green', label: 'Grün' },
            { value: 'blue', label: 'Blau' },
            { value: 'purple', label: 'Lila' }
          ],
          default: 'green'
        },
        {
          type: 'info',
          label: 'Status',
          id: 'status',
          text: '✓ Bereit'
        },
        { 
          type: 'button', 
          key: 'test-btn',
          label: '', 
          buttonText: 'Test Notification',
          onClick: () => {
            api.showNotification('Hallo vom Example Plugin!');
            api.updateSettingsInfo('status', '✓ Notification gesendet!');
          }
        }
      ]
    });
    
    // Track-Änderungen überwachen
    api.onTrackChange((track) => {
      if (track && api.getLocalSetting('notifications', true)) {
        console.log('[Example Plugin] Neuer Song:', track.track);
      }
    });
    
    // Daten speichern/laden Demo
    const loadCount = await api.getData('loadCount') || 0;
    await api.storeData('loadCount', loadCount + 1);
    console.log('[Example Plugin] Plugin wurde', loadCount + 1, 'mal geladen');
  }
  
  // ============================================
  // CLEANUP - Wird beim Entladen aufgerufen
  // ============================================
  async function cleanup() {
    api.unregisterSettings();
    console.log('[Example Plugin] Entladen');
  }
  
  return { init, cleanup };
  
})(DisplaySong);

/**
 * ============================================
 * API REFERENZ
 * ============================================
 * 
 * TRACK:
 *   api.getTrack()              → Aktuellen Track abrufen
 *   api.getHistory()            → Track-History abrufen  
 *   api.onTrackChange(cb)       → Bei Song-Wechsel reagieren
 * 
 * DATEN (Backend, persistent):
 *   api.storeData(key, value)   → JSON-Daten speichern
 *   api.getData(key)            → JSON-Daten laden
 *   api.deleteData(key)         → Daten löschen
 * 
 * SECRETS (Keyring, sicher):
 *   api.storeSecret(key, value) → Secret speichern (OAuth Tokens)
 *   api.getSecret(key)          → Secret laden
 *   api.deleteSecret(key)       → Secret löschen
 * 
 * HTTP REQUESTS:
 *   api.httpRequest(method, url, options)
 *   - Returns: { status, headers, body, json() }
 * 
 * UI:
 *   api.showNotification(msg)   → Notification anzeigen
 * 
 * SETTINGS (Modal im Plugins Tab):
 *   api.registerSettings(config) → Settings registrieren
 *   api.updateSettingsInfo(id, text) → Info-Feld aktualisieren
 *   api.unregisterSettings()    → Settings entfernen
 *   
 *   Field Types:
 *   - text/password: { type, key, label, placeholder?, default?, onChange? }
 *   - toggle: { type, key, label, default?, onChange? }
 *   - select: { type, key, label, options: [{value, label}], default? }
 *   - button: { type, key, label?, buttonText, onClick }
 *   - info: { type, label?, id, text }
 * 
 * UTILITIES:
 *   api.getPluginId()           → Plugin-ID
 *   api.getAppVersion()         → DisplaySong Version
 *   api.getLocalSetting(key)    → LocalStorage (Frontend)
 *   api.setLocalSetting(key, val)
 */

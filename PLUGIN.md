# DisplaySong Plugin API

Erstelle eigene Plugins für DisplaySong um die App zu erweitern.

## Schnellstart

1. Erstelle einen Ordner in `%APPDATA%/com.displaysong.app/plugins/dein-plugin/`
2. Erstelle `manifest.json` und `index.js`
3. Starte DisplaySong neu oder klicke "Liste aktualisieren"

## Projektstruktur

```
plugins/
└── mein-plugin/
    ├── manifest.json    # Plugin-Metadaten (erforderlich)
    └── index.js         # Plugin-Code (erforderlich)
```

## manifest.json

```json
{
  "id": "mein-plugin",
  "name": "Mein Plugin",
  "version": "1.0.0",
  "author": "Dein Name",
  "description": "Kurze Beschreibung",
  "main": "index.js",
  "permissions": ["track", "storage", "http", "twitch", "window"]
}
```

| Feld | Erforderlich | Beschreibung |
|------|--------------|--------------|
| `id` | ✓ | Eindeutige ID (lowercase, keine Leerzeichen) |
| `name` | ✓ | Anzeigename |
| `version` | ✓ | Semver Version (z.B. "1.0.0") |
| `author` | | Dein Name |
| `description` | | Kurze Beschreibung |
| `main` | ✓ | Einstiegspunkt (normalerweise "index.js") |
| `permissions` | | Array von Berechtigungen (rein informativ) |

### Berechtigungen

Die `permissions` dienen aktuell nur zur Dokumentation – sie schränken die API
**nicht** technisch ein. Trag trotzdem ehrlich ein, was dein Plugin nutzt:

- `track` - Zugriff auf Track-Daten
- `storage` - Daten persistent speichern
- `secrets` - Secrets im System-Keyring speichern
- `http` - HTTP-Requests machen
- `twitch` - Zugriff auf Twitch Integration
- `window` - Eigene Plugin-Fenster erstellen
- `python` - Python-Code ausführen (wenn Python installiert ist)

## index.js

Plugins haben direkten Zugriff auf `api` und `pluginId`:

```javascript
// Einfaches Plugin-Format
async function init() {
  console.log('Plugin geladen!');
  
  // Track-Daten abrufen
  const track = await api.getTrack();
  console.log('Aktueller Song:', track?.track);
  
  // Bei Song-Wechsel reagieren
  api.onTrackChange((track) => {
    console.log('Neuer Song:', track?.track);
  });
}

async function cleanup() {
  console.log('Plugin entladen');
}

// Plugin exportieren
return { init, cleanup };
```

---

# API Referenz

## Track API

### `api.getTrack()`

Gibt den aktuellen Track zurück.

```javascript
const track = await api.getTrack();
// {
//   track: "Song Name",
//   artist: "Artist Name",
//   album: "Album Name",
//   album_art: "https://...",
//   is_playing: true,
//   progress_ms: 45000,
//   duration_ms: 180000,
//   spotify_url: "https://open.spotify.com/track/..."
// }
```

### `api.getHistory()`

Gibt die Track-History zurück (Array).

```javascript
const history = await api.getHistory();
// Array von Track-Objekten
```

### `api.onTrackChange(callback)`

Registriert einen Callback für Song-Wechsel.

```javascript
const unlisten = api.onTrackChange((track) => {
  if (track) {
    console.log('Neuer Song:', track.track);
  } else {
    console.log('Nichts läuft');
  }
});

// Später: unlisten() aufrufen um Listener zu entfernen
```

---

## Spotify Playback Control

> ⚠️ **Wichtig:** Diese Funktionen benötigen Spotify Premium!

### `api.addToQueue(spotifyUri)`

Fügt einen Song zur Spotify-Warteschlange hinzu.

```javascript
try {
  await api.addToQueue('spotify:track:4iV5W9uYEdYUVa79Axb7Rh');
  console.log('Song zur Queue hinzugefügt!');
} catch (e) {
  console.error('Fehler:', e);
}
```

### `api.playTrack(spotifyUri)`

Spielt einen Song direkt ab (unterbricht aktuellen Song).

```javascript
try {
  await api.playTrack('spotify:track:4iV5W9uYEdYUVa79Axb7Rh');
  console.log('Song wird abgespielt!');
} catch (e) {
  console.error('Fehler:', e);
}
```

---

## Plugin Window API

Plugins können eigene Fenster erstellen, um benutzerdefinierte UIs anzuzeigen.

> **Wichtig:** Ein Plugin-Fenster ist ein schwebendes, verschiebbares `<div>`
> **innerhalb der DisplaySong-App** – kein echtes Betriebssystem-Fenster und
> **keine OBS-Browserquelle**. Es ist nur sichtbar, solange die App offen ist,
> und kann nicht als Quelle in OBS eingebunden werden.

### `api.createWindow(options)`

Erstellt ein neues Plugin-Fenster.

```javascript
const myWindow = api.createWindow({
  title: 'Mein Plugin Fenster',
  width: 400,
  height: 300,
  html: '<h1>Hello World!</h1><p>Das ist mein Plugin.</p>',
  resizable: true,
  alwaysOnTop: false,
  transparent: false,
  x: 100,  // Optional: X Position
  y: 100   // Optional: Y Position
});

// Fenster anzeigen
myWindow.show();
```

**Options:**

| Option | Typ | Default | Beschreibung |
|--------|-----|---------|--------------|
| `title` | string | Plugin ID | Fenstertitel |
| `width` | number | 400 | Breite in Pixeln |
| `height` | number | 300 | Höhe in Pixeln |
| `html` | string | '' | HTML-Inhalt |
| `resizable` | boolean | true | Größe änderbar |
| `alwaysOnTop` | boolean | false | Immer im Vordergrund |
| `transparent` | boolean | false | Transparenter Hintergrund |
| `x` | number | null | X Position (zentriert wenn null) |
| `y` | number | null | Y Position |
| `minWidth` | number | 200 | Minimale Breite |
| `minHeight` | number | 100 | Minimale Höhe |

### Window Methoden

```javascript
const win = api.createWindow({ title: 'Test' });

// Anzeigen/Verstecken
win.show();
win.hide();
win.close();  // Zerstört das Fenster

// Inhalt ändern
win.setContent('<h2>Neuer Inhalt</h2>');
win.setTitle('Neuer Titel');

// Größe/Position ändern
win.setSize(500, 400);
win.setPosition(200, 150);

// DOM-Element direkt manipulieren
const contentEl = win.getContentElement();
contentEl.innerHTML = '<div id="app"></div>';
contentEl.querySelector('#app').textContent = 'Direkt!';
```

### Beispiel: Song Request Queue Window

```javascript
let queueWindow = null;
let queue = [];

async function init() {
  // Fenster erstellen
  queueWindow = api.createWindow({
    title: '🎵 Song Queue',
    width: 350,
    height: 400,
    resizable: true
  });
  
  updateQueueDisplay();
  
  // Settings mit Button zum Öffnen
  api.registerSettings({
    fields: [
      {
        type: 'button',
        key: 'open-queue',
        buttonText: '📋 Queue anzeigen',
        onClick: () => queueWindow.show()
      }
    ]
  });
}

function updateQueueDisplay() {
  const html = queue.length === 0 
    ? '<p style="text-align:center;color:#888;">Queue ist leer</p>'
    : queue.map((item, i) => `
        <div style="padding:10px;border-bottom:1px solid #333;">
          <strong>${i + 1}. ${item.title}</strong><br>
          <small>von ${item.user}</small>
        </div>
      `).join('');
  
  queueWindow.setContent(`
    <style>
      body { font-family: system-ui; margin: 0; }
    </style>
    <div style="padding:10px;">
      <h3 style="margin-top:0;">Warteschlange (${queue.length})</h3>
      ${html}
    </div>
  `);
}

function addToQueue(title, user) {
  queue.push({ title, user });
  updateQueueDisplay();
}

async function cleanup() {
  queueWindow?.close();
}

return { init, cleanup };
```

---

## Twitch API

Plugins können die Twitch-Integration nutzen (wenn verbunden).

> **Einschränkungen:**
> - Es gibt **keinen** allgemeinen Chat-Nachrichten-Listener. Plugins können nur
>   auf **Channel-Point-Einlösungen** reagieren (`onTwitchRedemption`).
> - Channel Points / Einlösungen setzen **Twitch Affiliate oder Partner** voraus.
>   Ohne diesen Status liefert Twitch keine Redemption-Events.

### `api.getTwitchConnection()`

Gibt den Twitch-Verbindungsstatus zurück.

```javascript
const twitch = await api.getTwitchConnection();
// {
//   connected: true,
//   user: { id: "123", login: "username", display_name: "Username" },
//   eventsub_connected: true
// }
```

### `api.sendTwitchChat(message)`

Sendet eine Chat-Nachricht.

```javascript
await api.sendTwitchChat('🎵 Jetzt läuft: Song Name - Artist');
```

### `api.onTwitchRedemption(callback)`

Reagiert auf Channel Point Einlösungen.

```javascript
const unlisten = api.onTwitchRedemption((redemption) => {
  console.log('Einlösung von:', redemption.user_name);
  console.log('Input:', redemption.user_input);
  console.log('Reward:', redemption.reward_title);
  
  // Beispiel: Song Request verarbeiten
  if (redemption.reward_title === 'Song Request') {
    handleSongRequest(redemption.user_name, redemption.user_input);
  }
});

// Später: unlisten() um Listener zu entfernen
```

**Redemption Object:**

```javascript
{
  id: "abc123",
  user_id: "12345",
  user_name: "viewer123",
  user_input: "https://open.spotify.com/track/...",
  reward_id: "reward-id",
  reward_title: "Song Request"
}
```

---

## Storage API

Daten werden persistent im Plugin-Ordner gespeichert.

### `api.storeData(key, value)`

```javascript
await api.storeData('settings', { enabled: true, count: 42 });
```

### `api.getData(key)`

```javascript
const settings = await api.getData('settings');
```

### `api.deleteData(key)`

```javascript
await api.deleteData('settings');
```

---

## Secrets API

Secrets werden sicher im Windows Credential Manager gespeichert.

### `api.storeSecret(key, value)`

```javascript
await api.storeSecret('oauth_token', 'eyJhbG...');
```

### `api.getSecret(key)`

```javascript
const token = await api.getSecret('oauth_token');
```

### `api.deleteSecret(key)`

```javascript
await api.deleteSecret('oauth_token');
```

---

## HTTP API

HTTP-Requests ohne CORS-Einschränkungen.

### `api.httpRequest(method, url, options)`

```javascript
// GET
const response = await api.httpRequest('GET', 'https://api.example.com/data');
const data = response.json();

// POST
const response = await api.httpRequest('POST', 'https://api.example.com/data', {
  headers: { 'Authorization': 'Bearer token123' },
  body: JSON.stringify({ message: 'Hello' })
});
```

---

## Python API

Plugins können Python-Code ausführen, wenn auf dem System Python installiert ist.
Prüfe **immer** zuerst mit `pythonAvailable()`.

```javascript
if (await api.pythonAvailable()) {
  const version = await api.pythonVersion();   // z.B. "Python 3.11.5"

  // Code-Schnipsel ausführen
  const result = await api.pythonRun('print(2 + 2)');

  // Skript-Datei mit Argumenten ausführen
  await api.pythonRunScript('C:/pfad/script.py', ['arg1', 'arg2']);

  // Pakete prüfen/installieren (pip)
  if (!(await api.pythonPackageInstalled('requests'))) {
    await api.pythonInstall('requests');
  }
}
```

| Methode | Beschreibung |
|---------|--------------|
| `api.pythonAvailable()` | `true`/`false` ob Python gefunden wurde |
| `api.pythonVersion()` | Versions-String oder `null` |
| `api.pythonRun(code)` | Führt Python-Code aus, gibt das Ergebnis zurück |
| `api.pythonRunScript(path, args)` | Führt eine `.py`-Datei aus |
| `api.pythonPackageInstalled(name)` | Prüft ob ein pip-Paket installiert ist |
| `api.pythonInstall(name)` | Installiert ein pip-Paket |

---

## UI API

### `api.showNotification(message)`

```javascript
api.showNotification('Daten gespeichert!');
```

---

## Settings API

### `api.registerSettings(config)`

```javascript
api.registerSettings({
  title: 'Mein Plugin',
  icon: '<svg>...</svg>',
  fields: [
    { type: 'text', key: 'username', label: 'Benutzername' },
    { type: 'password', key: 'apiKey', label: 'API Key' },
    { type: 'toggle', key: 'enabled', label: 'Aktiviert', default: true },
    { type: 'select', key: 'mode', label: 'Modus', options: [
      { value: 'auto', label: 'Automatisch' },
      { value: 'manual', label: 'Manuell' }
    ]},
    { type: 'button', key: 'test', buttonText: 'Testen', onClick: () => {} },
    { type: 'info', id: 'status', label: 'Status', text: '✓ OK' }
  ]
});
```

### `api.updateSettingsInfo(fieldId, text)`

```javascript
api.updateSettingsInfo('status', '✓ Verbunden');
```

### `api.unregisterSettings()`

```javascript
api.unregisterSettings();
```

---

## Local Settings API

```javascript
// Speichern
api.setLocalSetting('username', 'Max');

// Laden
const username = api.getLocalSetting('username', 'Gast');
```

---

## Events API

```javascript
// Empfangen
api.on('custom-event', (data) => {
  console.log('Event:', data);
});

// Senden
api.emit('custom-event', { message: 'Hello!' });
```

---

## Utility API

```javascript
api.getPluginId();     // "mein-plugin"
api.getAppVersion();   // "2.2.0"

// DOM Helper
const el = api.createElement('div', {
  className: 'my-class',
  onClick: () => console.log('clicked')
}, ['Text', api.createElement('span', {}, ['Nested'])]);
```

---

## Vollständiges Beispiel: Twitch Song Requests

```javascript
let queueWindow = null;
let queue = [];
let unlistenRedemption = null;

async function init() {
  // Queue Window erstellen
  queueWindow = api.createWindow({
    title: '🎵 Song Request Queue',
    width: 380,
    height: 450
  });
  
  // Settings
  api.registerSettings({
    title: 'Twitch Song Requests',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>',
    fields: [
      { type: 'info', id: 'twitch-status', label: 'Twitch', text: 'Prüfe...' },
      { type: 'button', key: 'show-queue', buttonText: '📋 Queue öffnen', onClick: () => queueWindow.show() },
      { type: 'toggle', key: 'chat-feedback', label: 'Chat Feedback', default: true }
    ]
  });
  
  // Twitch Status prüfen
  const twitch = await api.getTwitchConnection();
  if (twitch.connected) {
    api.updateSettingsInfo('twitch-status', `✓ ${twitch.user.display_name}`);
    
    // Auf Redemptions hören
    unlistenRedemption = api.onTwitchRedemption(handleRedemption);
  } else {
    api.updateSettingsInfo('twitch-status', '✗ Nicht verbunden');
  }
  
  updateQueueUI();
}

async function handleRedemption(redemption) {
  // Spotify Link extrahieren
  const match = redemption.user_input.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (!match) {
    if (api.getLocalSetting('chat-feedback', true)) {
      await api.sendTwitchChat(`@${redemption.user_name} Ungültiger Spotify Link!`);
    }
    return;
  }
  
  const uri = `spotify:track:${match[1]}`;
  
  // Zur Queue hinzufügen
  queue.push({
    user: redemption.user_name,
    uri: uri,
    redemptionId: redemption.id,
    rewardId: redemption.reward_id
  });
  
  updateQueueUI();
  
  // Feedback
  if (api.getLocalSetting('chat-feedback', true)) {
    await api.sendTwitchChat(`@${redemption.user_name} ✅ Song zur Queue hinzugefügt! (#${queue.length})`);
  }
  
  // Falls nichts läuft, direkt abspielen
  const track = await api.getTrack();
  if (!track?.is_playing && queue.length === 1) {
    playNext();
  }
}

async function playNext() {
  if (queue.length === 0) return;
  
  const item = queue.shift();
  
  try {
    await api.playTrack(item.uri);
    api.showNotification(`▶️ Spielt: Request von ${item.user}`);
  } catch (e) {
    api.showNotification(`❌ Fehler: ${e}`);
  }
  
  updateQueueUI();
}

function updateQueueUI() {
  const html = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui; background: #1a1a1a; color: #fff; }
      .header { padding: 15px; background: #9146ff; }
      .queue-item { padding: 12px 15px; border-bottom: 1px solid #333; }
      .queue-item:hover { background: #2a2a2a; }
      .user { font-size: 12px; color: #9146ff; }
      .empty { text-align: center; padding: 40px; color: #666; }
      .btn { background: #9146ff; border: none; padding: 8px 16px; color: #fff; border-radius: 6px; cursor: pointer; margin: 10px; }
    </style>
    <div class="header">
      <strong>Queue (${queue.length})</strong>
      <button class="btn" onclick="window.playNext?.()">▶️ Nächster</button>
    </div>
    ${queue.length === 0 
      ? '<div class="empty">Queue ist leer</div>'
      : queue.map((item, i) => `
          <div class="queue-item">
            <div class="user">@${item.user}</div>
            <div>#${i + 1}</div>
          </div>
        `).join('')
    }
  `;
  
  queueWindow.setContent(html);
  
  // Button Handler
  const contentEl = queueWindow.getContentElement();
  window.playNext = playNext;
}

async function cleanup() {
  unlistenRedemption?.();
  queueWindow?.close();
  api.unregisterSettings();
}

return { init, cleanup };
```

---

## Best Practices

1. **Immer `cleanup()` implementieren** - Schließe Fenster, entferne Listener
2. **Secrets für sensible Daten** - Nie Tokens in LocalStorage
3. **Fehler abfangen** - Wrap API-Calls in try/catch
4. **Plugin Windows sparsam nutzen** - Nicht zu viele Fenster
5. **Twitch Feedback optional machen** - User sollten Chat-Nachrichten deaktivieren können

## Debugging

DevTools mit F12 öffnen (im Debug-Build).

```javascript
console.log('[Mein Plugin] Debug:', data);
```

Logs: `%APPDATA%/com.displaysong.app/logs/`

## Support

Bei Fragen oder Problemen: GitHub Issues

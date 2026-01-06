# 🎵 DisplaySong

**Spotify Now Playing Widget für OBS** - Eine elegante Desktop-App, die den aktuell spielenden Spotify-Track als Widget anzeigt.

![Version](https://img.shields.io/badge/version-2.1.1-green)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-blue)
![Built with](https://img.shields.io/badge/built%20with-Tauri-orange)

---

## ✨ Features

- 🎨 **4 Widget-Designs** - Compact Bar, Album Focus, und 2 vollständig anpassbare Custom-Widgets
- 🎯 **OBS-ready** - Transparenter Hintergrund für nahtlose Stream-Integration
- 🔄 **Echtzeit-Updates** - Song, Artist, Album, Cover und Fortschritt werden live aktualisiert
- 🌈 **Dynamische Farben** - Widget-Akzentfarbe passt sich automatisch dem Album-Cover an
- 🎨 **Custom Akzentfarbe** - Wähle deine eigene Farbe oder nutze Presets (Spotify Grün, Twitch Lila, etc.)
- ✨ **Smooth Transitions** - Elegante Animationen beim Song-Wechsel
- 📜 **Song-Verlauf** - Die letzten 20 Songs mit Spotify-Embed Ansicht
- 💾 **Kein Server nötig** - Läuft komplett lokal auf deinem PC
- 🔒 **Sicher** - Credentials werden im System-Keyring gespeichert
- ⚡ **Leichtgewichtig** - Dank Tauri nur ~10MB, minimaler RAM-Verbrauch
- 📝 **Logging** - Automatische Logs für Debugging

---

## 📦 Installation

### Voraussetzungen

- Spotify Premium Account (für API-Zugriff)
- Windows 10/11, macOS 10.15+, oder Linux

### Download

Lade die neueste Version von der [Releases](../../releases) Seite herunter:
- **Windows:** `DisplaySong_x.x.x_x64-setup.exe` oder `.msi`
- **macOS:** `DisplaySong_x.x.x_x64.dmg`
- **Linux:** `DisplaySong_x.x.x_amd64.AppImage` oder `.deb`

### Spotify App erstellen

1. Gehe zum [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Klicke **"Create App"**
3. Name: `DisplaySong` (oder beliebig)
4. Redirect URI: `http://127.0.0.1:8888/callback`
5. Wähle "Web API" bei den APIs
6. Kopiere **Client ID** und **Client Secret**

---

## 🚀 Benutzung

### Erste Einrichtung

1. Starte DisplaySong
2. Gib deine **Client ID** und **Client Secret** ein
3. Klicke "Speichern & Verbinden"
4. Autorisiere die App im Browser
5. Fertig! 🎉

### Widgets anzeigen

1. Gehe zum Tab **"Designs"**
2. Klicke bei einem Widget auf **"Anzeigen"**
3. Ziehe das Widget an die gewünschte Position
4. Das Widget merkt sich die Position automatisch

### Widgets in OBS einbinden

1. Zeige ein Widget in DisplaySong an
2. In OBS: **Quellen → + → Fensteraufnahme**
3. Wähle das Widget-Fenster (z.B. "Compact Bar")
4. **Wichtig:** Setze "Aufnahmemethode" auf **"Windows 10 (1903 und höher)"**
5. Aktiviere **"Client-Bereich erfassen"** für bessere Ränder

### Custom Widgets bearbeiten

1. Gehe zu **"Designs"**
2. Klicke **"📁 Widget-Ordner öffnen"**
3. Bearbeite `custom1.html` oder `custom2.html`
4. Speichere und klicke **"🔄 Widgets neu laden"**

---

## ⚙️ Einstellungen

| Einstellung | Beschreibung |
|-------------|--------------|
| **Autostart** | App beim Windows-Start automatisch starten |
| **Widget-Positionen merken** | Widgets öffnen an der letzten Position |
| **Aktualisierungsrate** | Wie oft Spotify abgefragt wird (1-10 Sek.) |
| **Verlauf-Länge** | Anzahl der gespeicherten Songs (10-100) |
| **Widget-Transparenz** | Deckkraft der Widgets (50-100%) |
| **Akzentfarbe** | Preset oder eigene Farbe wählen |

---

## 🎨 Custom Widget Entwicklung

### Verfügbare CSS-Variablen

```css
:root {
  --r: 29;   /* Rot-Wert der Album-Farbe (0-255) */
  --g: 185;  /* Grün-Wert */
  --b: 84;   /* Blau-Wert */
  --transition-duration: 0.4s;  /* Animation-Dauer */
}

/* Verwendung: */
.element {
  color: rgb(var(--r), var(--g), var(--b));
  background: rgba(var(--r), var(--g), var(--b), 0.2);
}
```

### Track-Daten (JavaScript)

```javascript
// Track-Objekt:
{
  track: "Song Name",
  artist: "Artist Name", 
  album: "Album Name",
  albumCover: "https://...",
  trackId: "spotify:track:...",
  isPlaying: true,
  progressMs: 45000,
  durationMs: 180000,
  color: { r: 29, g: 185, b: 84 }
}
```

### Events

```javascript
// Song-Update empfangen
window.__TAURI__.event.listen('track-update', (e) => {
  const track = e.payload;
  // Widget aktualisieren...
});

// Akzentfarbe geändert
window.addEventListener('accent-color-change', (e) => {
  const { r, g, b } = e.detail;
  // Farbe anwenden...
});

// Zurück auf Album-Farbe
window.addEventListener('accent-color-reset', () => {
  // currentTrack.color verwenden...
});
```

### Minimales Widget-Template

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: transparent; font-family: system-ui; }
    .widget {
      background: rgba(0,0,0,0.8);
      padding: 16px;
      border-radius: 12px;
      color: white;
    }
  </style>
</head>
<body>
  <div class="widget">
    <div id="title">-</div>
    <div id="artist">-</div>
  </div>
  
  <script type="module">
    const { listen } = window.__TAURI__.event;
    const { invoke } = window.__TAURI__.tauri;
    
    function update(track) {
      if (!track) return;
      document.getElementById('title').textContent = track.track;
      document.getElementById('artist').textContent = track.artist;
    }
    
    listen('track-update', (e) => update(e.payload));
    invoke('get_track').then(update);
  </script>
</body>
</html>
```

---

## 📁 Dateipfade

| Betriebssystem | Pfad |
|----------------|------|
| **Windows** | `%APPDATA%\com.displaysong.app\` |
| **macOS** | `~/Library/Application Support/com.displaysong.app/` |
| **Linux** | `~/.config/com.displaysong.app/` |

### Ordnerstruktur

```
com.displaysong.app/
├── widgets/           # Deine Custom Widgets
│   ├── custom1.html
│   └── custom2.html
└── logs/              # Log-Dateien
    └── displaysong_2024-01-15.log
```

---

## 🔧 Troubleshooting

### "Autorisierung fehlgeschlagen"
- Prüfe die Redirect URI: `http://127.0.0.1:8888/callback`
- Stelle sicher dass Port 8888 nicht blockiert ist

### Widget zeigt "Warte auf Musik..."
- Ist Spotify geöffnet und spielt Musik?
- Prüfe den Verbindungsstatus in DisplaySong (grüner Punkt)

### Custom Widget wird nicht aktualisiert
- Klicke **"🔄 Widgets neu laden"** nach dem Speichern
- Öffne das Widget und drücke F12 für die Konsole

### App startet nicht
1. Gehe zu **Einstellungen → Über → 📁 Logs öffnen**
2. Prüfe die neueste Log-Datei
3. Lösche notfalls den App-Ordner und starte neu

### Rate-Limit Fehler
- Spotify erlaubt begrenzte API-Aufrufe
- Erhöhe die Aktualisierungsrate auf 5+ Sekunden

---

## 🛠️ Entwicklung

### Voraussetzungen

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- Tauri CLI: `cargo install tauri-cli`

### Setup

```bash
# Repository klonen
git clone https://github.com/byDopeMan/displaysong-tauri.git
cd displaysong

# Dependencies installieren
npm install

# Entwicklung starten
npm run tauri dev

# Release bauen
npm run tauri build
```

### Projektstruktur

```
displaysong-tauri/
├── src/                    # Frontend
│   ├── index.html
│   ├── app.js
│   ├── styles/
│   ├── widgets/            # Widget HTML-Dateien
│   └── templates/          # Custom Widget Templates
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── main.rs         # Hauptlogik, Commands
│   │   ├── spotify.rs      # Spotify API Client
│   │   ├── credentials.rs  # Keyring-Speicherung
│   │   └── color.rs        # Farbextraktion
│   └── tauri.conf.json
└── package.json
```

---

## 📋 Changelog

### v2.1.1
- 🚀 Lade-Bildschirm beim Start mit Status
- 📥 Visuelle Animation beim Minimieren ins Tray
- 📝 Automatisches Logging in AppData/logs
- ✨ Smooth Song-Wechsel Animationen
- 🎨 Akzentfarbe zurücksetzen funktioniert sofort
- 🐛 Mehrfaches Polling verhindert
- 🎵 Spotify Embed voll nutzbar (Save, Links, etc.)

### v2.1.0
- 🎨 Custom Akzentfarbe mit Color Picker
- 🎨 Akzentfarbe für Design 1 & 2 optional
- 📜 Song-Verlauf mit Spotify Embed Ansicht
- 📋 Song-Info kopieren Button
- 🌫️ Widget-Transparenz einstellbar

### v2.0.0
- 🎉 Erste Tauri-Version
- 4 Widget-Designs
- Dynamische Farben
- System Tray Integration

---

## 📄 Lizenz

MIT License - Siehe [LICENSE](LICENSE)

---

## 🙏 Credits

- [Tauri](https://tauri.app/) - Framework
- [Spotify Web API](https://developer.spotify.com/) - Musik-Daten

---

## 💬 Support

- **Issues:** [GitHub Issues](../../issues)
- **Discussions:** [GitHub Discussions](../../discussions)

---

**Made with ❤️ for Streamers**
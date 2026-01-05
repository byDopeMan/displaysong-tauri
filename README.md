# 🎵 DisplaySong

**Spotify Now Playing Widget für OBS** - Eine elegante Desktop-App, die den aktuell spielenden Spotify-Track als Widget anzeigt.

![Version](https://img.shields.io/badge/version-2.0.0-green)
![Platform](https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-blue)
![Built with](https://img.shields.io/badge/built%20with-Tauri-orange)

---

## ✨ Features

- 🎨 **4 Widget-Designs** - Compact Bar, Album Focus, und 2 vollständig anpassbare Custom-Widgets
- 🎯 **OBS-ready** - Transparenter Hintergrund für nahtlose Stream-Integration
- 🔄 **Echtzeit-Updates** - Song, Artist, Album, Cover und Fortschritt werden live aktualisiert
- 🌈 **Dynamische Farben** - Widget-Akzentfarbe passt sich automatisch dem Album-Cover an
- 💾 **Kein Server nötig** - Läuft komplett lokal auf deinem PC
- 🔒 **Sicher** - Deine Spotify-Credentials werden nur lokal gespeichert
- ⚡ **Leichtgewichtig** - Dank Tauri nur ~10MB, minimaler RAM-Verbrauch

---

## 📦 Installation

### Voraussetzungen

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (für Entwicklung)
- Spotify Premium Account

### Spotify App erstellen

1. Gehe zum [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Erstelle eine neue App
3. Füge als Redirect URI hinzu: `http://127.0.0.1:8888/callback`
4. Kopiere **Client ID** und **Client Secret**

### App starten (Entwicklung)

```bash
# Repository klonen / ZIP entpacken
cd displaysong-tauri

# Dependencies installieren
npm install

# App starten
npm run tauri dev
```

### App bauen (Release)

```bash
npm run tauri build
```

Die fertige `.exe` / `.dmg` / `.AppImage` findest du in `src-tauri/target/release/bundle/`.

---

## 🚀 Benutzung

### Erste Einrichtung

1. Starte die App
2. Gib deine **Client ID** und **Client Secret** ein
3. Klicke "Speichern & Verbinden"
4. Autorisiere die App in deinem Browser
5. Fertig! 🎉

### Widgets anzeigen

1. Gehe zum Tab **"Designs"**
2. Klicke bei einem Widget auf **"Anzeigen"**
3. Das Widget erscheint als transparentes Overlay

### Widgets in OBS einbinden

1. Zeige ein Widget an
2. In OBS: **Quelle hinzufügen → Fensteraufnahme**
3. Wähle das Widget-Fenster
4. Capture Method auf **"Windows 10 (1903 and up)"** in den Eigenschaften

### Custom Widgets bearbeiten

1. Gehe zum Tab **"Designs"**
2. Klicke **"📁 Widget-Ordner öffnen"**
3. Bearbeite `custom1.html` oder `custom2.html` mit einem Texteditor
4. Speichere die Datei
5. Klicke **"🔄 Widgets neu laden"**

---

## 🎨 Custom Widget Entwicklung

Die Custom-Widgets sind einfache HTML-Dateien. Du hast vollen Zugriff auf:

### Verfügbare CSS-Variablen

```css
:root {
  --r: 29;   /* Rot-Wert der Album-Farbe (0-255) */
  --g: 185;  /* Grün-Wert */
  --b: 84;   /* Blau-Wert */
}

/* Verwendung: */
.element {
  color: rgb(var(--r), var(--g), var(--b));
  background: rgba(var(--r), var(--g), var(--b), 0.2);
}
```

### Verfügbare Track-Daten (JavaScript)

```javascript
// Track-Objekt Struktur:
{
  track: "Song Name",
  artist: "Artist Name", 
  album: "Album Name",
  albumCover: "https://...",  // Cover URL
  isPlaying: true,            // Play/Pause Status
  progressMs: 45000,          // Aktuelle Position in ms
  durationMs: 180000,         // Gesamtlänge in ms
  color: { r: 29, g: 185, b: 84 }  // Dominante Farbe
}
```

### Beispiel: Minimales Widget

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { 
      background: transparent; 
      font-family: system-ui;
    }
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

## 📁 Projektstruktur

```
displaysong-tauri/
├── src/                    # Frontend
│   ├── index.html          # Haupt-UI
│   ├── app.js              # App-Logik
│   ├── styles/             # CSS
│   ├── widgets/            # Widget-Loader (design1, design2, custom1, custom2)
│   └── templates/          # Custom Widget Templates
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── main.rs         # Hauptlogik, Commands
│   │   ├── spotify.rs      # Spotify API Client
│   │   ├── credentials.rs  # Credential-Speicherung
│   │   └── color.rs        # Farbextraktion aus Covers
│   ├── icons/              # App-Icons
│   └── tauri.conf.json     # Tauri-Konfiguration
└── package.json
```

---

## ⚙️ Konfiguration

### Dateipfade

| Pfad | Beschreibung |
|------|--------------|
| `%APPDATA%\com.displaysong.app\` | App-Daten (Windows) |
| `~/Library/Application Support/com.displaysong.app/` | App-Daten (macOS) |
| `~/.config/com.displaysong.app/` | App-Daten (Linux) |

### Gespeicherte Daten

- `credentials.json` - Verschlüsselte Spotify-Credentials
- `widgets/custom1.html` - Dein Custom Widget 1
- `widgets/custom2.html` - Dein Custom Widget 2

---

## 🔧 Troubleshooting

### "Autorisierung fehlgeschlagen"
- Prüfe ob die Redirect URI in deiner Spotify App korrekt ist: `http://127.0.0.1:8888/callback`
- Stelle sicher dass Port 8888 nicht blockiert ist

### Widget zeigt nichts an
- Ist Spotify geöffnet und spielt Musik?
- Prüfe ob die App verbunden ist (grüner Status)

### Custom Widget wird nicht aktualisiert
- Klicke "🔄 Widgets neu laden" nach dem Speichern
- Prüfe die Browser-Konsole auf JavaScript-Fehler (F12 im Widget)

### App startet nicht
- Lösche `%APPDATA%\com.displaysong.app\` und starte neu

---

## 🛠️ Entwicklung

### Voraussetzungen

- Node.js 18+
- Rust (stable)
- Tauri CLI: `cargo install tauri-cli`

### Commands

```bash
# Entwicklung
npm run tauri dev

# Build
npm run tauri build

# Rust prüfen
cd src-tauri && cargo check
```

---

## 📄 Lizenz

MIT License - Siehe [LICENSE](LICENSE)

---

## 🙏 Credits

- [Tauri](https://tauri.app/) - Framework
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) - Musik-Daten
- [color-thief](https://lokeshdhakar.com/projects/color-thief/) - Farbextraktion (Konzept)

---

**Made with ❤️ for Streamers**
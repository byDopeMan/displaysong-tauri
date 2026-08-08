# 🎵 DisplaySong

**Universal Now Playing Widget für OBS** - Eine elegante Desktop-App, die den aktuell spielenden Track als Widget anzeigt. Funktioniert mit **allen Musik-Playern**!

![Version](https://img.shields.io/badge/version-4.2.0-green)
![Plugins Edition](https://img.shields.io/badge/plugins%20edition-4.3.0-blueviolet)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Built with](https://img.shields.io/badge/built%20with-Tauri-orange)

---

## 📦 Editionen

DisplaySong gibt es in zwei Varianten:

| Edition | Version | Beschreibung |
|---------|---------|--------------|
| **Standard** | 4.2.0 | Die schlanke Haupt-App (diese README) – mit Auto-Update. |
| **Plugins** | 4.3.0 | Zusätzlich ein Plugin-System: Twitch-Alerts, OBS-Overlays, Python u. v. m. |

Downloads beider Editionen: **[Releases →](https://github.com/byDopeMan/displaysong-tauri/releases)** (Plugins-Builds tragen das Suffix `-plugins`).

---

## 🆕 Highlights

- 🎧 **Universelle Musik-Erkennung** - Erkennt automatisch Musik von Spotify, YouTube, VLC, Browser, und mehr!
- 🚀 **Kein Spotify-Zwang** - Die App funktioniert sofort ohne Spotify-API Setup
- 🔗 **Multi-Platform Song Requests** - YouTube, Apple Music, SoundCloud Links werden automatisch zu Spotify konvertiert
- 📊 **Lokale Track-Historie** - SQLite-basierte Verlaufsspeicherung
- 🎛️ **Provider-Auswahl** - Wähle zwischen Windows Audio (Universal) und Spotify API

---

## ✨ Features

### 🎵 Musik-Erkennung
- **Windows Audio (Standard)** - Erkennt Musik von JEDEM Player automatisch
  - Spotify, YouTube Music, Apple Music, Deezer, TIDAL
  - VLC, foobar2000, MusicBee, Winamp
  - Browser (Chrome, Firefox, Edge)
- **Spotify API (Optional)** - Für erweiterte Features wie Queue-Control

### 🎨 Widgets
- **4 Widget-Designs** - Compact Bar, Album Focus, und 2 Custom-Widgets
- **OBS-ready** - Transparenter Hintergrund für nahtlose Stream-Integration
- **Dynamische Farben** - Akzentfarbe passt sich dem Album-Cover an
- **Auto-Hide** - Widget ausblenden wenn nichts läuft
- **Smooth Transitions** - Elegante Animationen beim Song-Wechsel

### 📺 Twitch Integration
- **Song Requests** - Viewer können Songs über Chat anfordern
- **Multi-Platform Links** - YouTube, SoundCloud, Apple Music → Spotify
- **Queue Management** - Verwaltung der Song Request Queue
- **Customizable Messages** - Passe Chat-Nachrichten an

---

## 📦 Installation

### Voraussetzungen

- Windows 10/11
- **Optional:** Spotify Premium (nur für erweiterte Spotify-Features)

### Download

Lade die neueste Version von der [Releases](../../releases) Seite herunter:
- **Windows:** `DisplaySong_4.1.0_x64-setup.exe`

---

## 🚀 Schnellstart

### Windows Audio (Empfohlen)

1. Starte DisplaySong
2. Wähle **"Windows Audio (Universal)"** → **"Sofort starten"**
3. Fertig! 🎉 Die App erkennt automatisch alle Musik-Player

### Spotify API (Optional)

Nur nötig für: Song Requests zur Spotify Queue, Playlist-Sync

1. Gehe zum [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Erstelle eine App mit Redirect URI: `http://127.0.0.1:8888/callback`
3. In DisplaySong: **"Spotify API"** → **"Einrichten"**
4. Gib Client ID & Secret ein → Verbinden

---

## 🎮 Benutzung

### Widgets anzeigen

1. Gehe zum Tab **"Designs"**
2. Klicke bei einem Widget auf **"Anzeigen"**
3. Ziehe das Widget an die gewünschte Position
4. **Optional:** Aktiviere "Ausblenden wenn nichts läuft"

### Widgets in OBS einbinden

1. Zeige ein Widget in DisplaySong an
2. In OBS: **Quellen → + → Fensteraufnahme**
3. Wähle das Widget-Fenster (z.B. "Widget - Compact Bar")
4. Setze "Aufnahmemethode" auf **"Windows 10 (1903 und höher)"**
5. Aktiviere **"Client-Bereich erfassen"**

### Twitch Song Requests

1. Verbinde Twitch unter **Einstellungen → Verbindungen**
2. Aktiviere **Song Requests** im Twitch-Bereich
3. Viewer können nun `!sr <Song>` oder `!sr <Link>` verwenden
4. Unterstützte Links: Spotify, YouTube, Apple Music, SoundCloud, Deezer

---

## ⚙️ Einstellungen

### Musik-Quelle
| Einstellung | Beschreibung |
|-------------|--------------|
| **Windows Audio** | Erkennt Musik von allen Playern automatisch |
| **Spotify API** | Spotify-only, ermöglicht Queue-Control |

### Widget-Optionen
| Einstellung | Beschreibung |
|-------------|--------------|
| **Akzentfarbe** | Nutze Album-Farbe oder eigene Farbe |
| **Ausblenden wenn nichts läuft** | Widget wird unsichtbar wenn keine Musik |
| **Widget-Transparenz** | Deckkraft der Widgets (50-100%) |
| **Positionen merken** | Widgets öffnen an der letzten Position |

### Twitch
| Einstellung | Beschreibung |
|-------------|--------------|
| **Command** | Standard: `!sr` |
| **Cooldown** | Wartezeit zwischen Requests |
| **Max. Song-Länge** | Maximale Dauer in Minuten |
| **Nur Subscriber** | Nur Subs können requesten |

---

## 🎨 Custom Widget Entwicklung

### Track-Daten

```javascript
{
  track: "Song Name",
  artist: "Artist Name", 
  album: "Album Name",
  albumCover: "https://... oder data:image/...",
  isPlaying: true,
  progressMs: 45000,
  durationMs: 180000,
  source: "Spotify", // oder "Chrome", "VLC", etc.
  color: { r: 29, g: 185, b: 84 }
}
```

### Events

```javascript
// Song-Update
window.__TAURI__.event.listen('track-update', (e) => {
  const track = e.payload;
});

// Akzentfarbe
window.addEventListener('accent-color-change', (e) => {
  const { r, g, b } = e.detail;
});

// Auto-Hide
window.addEventListener('autohide-change', (e) => {
  const { enabled } = e.detail;
});
```

---

## 📁 Dateipfade

```
%APPDATA%\com.displaysong.app\
├── widgets/           # Custom Widgets
│   ├── custom1.html
│   └── custom2.html
├── logs/              # Log-Dateien
└── songrequests.db    # Track History + Queue
```

---

## 🔧 Troubleshooting

### Widget zeigt "Warte auf Musik..."
- Spielt Musik in irgendeinem Player?
- Windows Audio erkennt nur aktiv spielende Musik

### Twitch/Browser wird erkannt statt Musik
- Die App filtert automatisch Twitch-Streams und reine Browser-URLs heraus
- Stelle sicher du nutzt die neueste Version

### Song Requests funktionieren nicht
- Ist Spotify verbunden? (für Queue-Funktion nötig)
- Prüfe den Cooldown und die Einstellungen

### Verlauf ist leer
- Der Verlauf wird bei jedem App-Start geleert
- Tracks werden während der Session gespeichert

---

## 🛠️ Entwicklung

### Voraussetzungen

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- Tauri CLI: `npm install -g @tauri-apps/cli@1.6.2`

### Setup

```bash
git clone https://github.com/byDopeMan/displaysong-tauri.git
cd displaysong-tauri
npm install
npm run tauri dev
```

### Projektstruktur

```
src/                    # Frontend (TypeScript + Svelte)
├── app.ts              # Entry point
├── core/               # State, Events, Timer
├── features/           # player, settings, designs, provider, twitch,
│                       #   history, queue, access (Svelte + Stores)
├── components/         # Titlebar.svelte
├── ui/                 # Modals, Notifications
├── widgets/            # OBS-Widget-Seiten (design1/2, custom1/2)
├── templates/          # Default-Vorlagen für Custom-Widgets
└── locales/            # i18n (de, en)

src-tauri/src/          # Backend (Rust, modular)
├── main.rs             # Entry, Fenster-/Tray-Setup
├── polling.rs          # Spotify Polling
├── state.rs · events.rs · logging.rs · tray.rs · color.rs · credentials.rs · python.rs
├── spotify/            # OAuth · Playback · Playlist  (+ spotify.rs)
├── twitch/             # Client · Credentials · EventSub · OAuth · Types
├── songlink/           # Detect · Odesli · Types (Link-Konvertierung)
├── windows_media/      # Session (WinRT, Universal-Erkennung)
└── commands/           # Tauri Commands
    ├── spotify/ · twitch/   # nach Themen aufgeteilt
    └── widgets.rs · queue.rs · settings.rs · songlink.rs · …
```

---

## 📋 Changelog

Vollständige Liste: siehe [CHANGELOG.md](CHANGELOG.md).

### v4.1.0
- 🎫 **Requester-Anzeige** bei Song-Requests – im Player-Tab und in den Widgets

### v4.0.0
- 🎧 Universelle Musik-Erkennung & Provider-Auswahl (Windows Media Session API)
- 🧭 Source-Priorität greift (alle Sessions werden enumeriert)
- 🚫 Twitch/Livestreams werden nicht mehr als Song erkannt

---

## 📄 Lizenz

MIT License - Siehe [LICENSE](LICENSE)

---

## 🙏 Credits

- [Tauri](https://tauri.app/) - Framework
- [Spotify Web API](https://developer.spotify.com/) - Musik-Daten
- [Songlink/Odesli](https://odesli.co/) - Link Conversion
- [Windows Media Session API](https://docs.microsoft.com/en-us/windows/win32/api/mpris/) - Universal Music Detection

---

**Made with ❤️ for Streamers**

# Changelog

Alle wichtigen Änderungen an DisplaySong.

## [4.0.0]

### 🎵 Universelle Musik-Erkennung & Provider
- Erkennung aller Player über die Windows Media Session API; Spotify wird beim Start
  immer verbunden (auch im Windows-Audio-Modus) – behebt „Lädt…", fehlende Wiedergabe
  und Login-Verlust.
- **Source-Priorität** greift jetzt: das Backend enumeriert alle Sessions und wählt
  nach der eingestellten Reihenfolge.
- **Twitch/Livestreams** werden nicht mehr als Song erkannt (Browser-Quelle ohne
  endliche Dauer wird übersprungen).
- **Progress-Bar synchron**: Position wird via `LastUpdatedTime` live hochgerechnet.

### 📺 Twitch
- **Channel Points**: Modus-Umschalter, Reward-Auswahl/-Erstellung, „Test-Einlösung
  simulieren" (testbar ohne Affiliate/Partner), Scope-Check/Re-Auth.
- **Master-Schalter** „Song Requests" deaktiviert die Funktion jetzt wirklich.
- Request-Historie ↔ Spotify-Playlist umschaltbar (war im Points-Modus abgeschnitten).

### 🎶 Queue
- Queue-Buttons (Play/Entfernen/Leeren) wieder klickbar (Overlay-Bug behoben).
- **Auto-Play**: spielt die Request-Queue der Reihe nach, sobald der laufende Song endet.

### 🛠️ App
- **Single-Instance**: die App lässt sich nur einmal öffnen.
- WebView2-Cache deaktiviert, damit Updates immer frisch laden.
- Smooth Scroll-to-Top beim Tab-Wechsel; diverse Layout-Fixes.

## [2.3.0] 

### 🎵 Multi-Platform Song Requests
- **YouTube Support** - Chat-User können jetzt YouTube Links posten
- **Apple Music Support** - Links werden automatisch konvertiert
- **SoundCloud Support** - Auch SoundCloud Links funktionieren
- **Weitere Plattformen** - Deezer, Tidal, Amazon Music, Pandora
- **Songlink/Odesli API** - Automatische Konvertierung zu Spotify
- Neue Chat-Nachrichten: `notOnSpotify` wenn Song nicht auf Spotify ist

### 🔌 Plugin System Erweiterung
- **Python Support** - Plugins können jetzt Python Scripts ausführen
  - Embedded Python Option im Installer (~40 MB)
  - System Python wird automatisch erkannt
  - Plugin API: `pythonRun()`, `pythonRunScript()`, `pythonInstall()`
- **Erweitertes Event System** - Mehr Events für Plugins:
  - Track Events: `TrackChange`, `TrackPlay`, `TrackPause`
  - Queue Events: `QueueAdd`, `QueueRemove`, `QueuePlay`
  - Twitch Events: `TwitchChat`, `TwitchRedemption`, `TwitchFollow`
  - App Events: `AppReady`, `AppMinimize`, `AppClose`
- **3 Beispiel-Plugins** im Installer:
  - **Lyrics Plugin** - Zeigt Songtexte via lyrics.ovh API
  - **Hotkeys Plugin** - Globale Tastenkürzel (benötigt Python)
  - **Discord Bot Plugin** - Song Requests via Discord (benötigt Python)

### 📦 Custom Installer
- **Neuer NSIS Installer** - Modernes, kompaktes Design
- **Komponenten-Auswahl**:
  - DisplaySong (erforderlich)
  - WebView2 Runtime (automatische Prüfung)
  - Beispiel-Plugins
  - Python Runtime (optional)
- **Upgrade-Erkennung** - Erkennt bestehende Installation
- **Auto-Close** - Schließt laufende App automatisch vor Update

### 🗄️ Song Request Queue
- **SQLite Persistenz** - Queue bleibt nach App-Neustart erhalten
- Datenbank in AppData gespeichert

### 🌍 i18n Verbesserungen
- Übersetzungen für `title` und `placeholder` Attribute
- Dynamische Status-Texte werden übersetzt
- Verbesserte deutsche Übersetzungen

### 🔧 Bugfixes
- Auth Server startet nur wenn nicht authentifiziert
- History Empty State SVG statt Emoji
- CSS `.setting-hint` Positionierung korrigiert
- Diverse Rust Warnings behoben

## [2.2.0] 

### 🔧 Bugfix
- **WebView2 Transparenz-Fix** - Behebt das weiße Titlebar-Problem durch gebündelte WebView2 Runtime (v143)
  - Alle Widgets haben wieder vollständige Transparenz
  - Unabhängig von Windows WebView2 Auto-Updates

### ⚡ Performance
- **Lazy Loading** - Widgets werden erst bei Bedarf erstellt
  - Spart ~200 MB RAM beim App-Start
  - Schnellerer Startvorgang
- **Color Cache** - Album-Farben werden gecacht
  - Spart ~10-20 MB RAM bei wiederholten Songs
- **Single-Thread Tokio Runtime** - Optimierte async Runtime
  - Spart ~15 MB RAM
- **Optimierte CSS** - Weniger Repaints in Widgets

### 🏗️ Refactoring
- **Modulare Code-Struktur** - main.rs in separate Module aufgeteilt:
  - `commands/` - Alle Tauri Commands (widgets, spotify, settings)
  - `state.rs` - App State Management
  - `polling.rs` - Spotify Polling Logic
  - `tray.rs` - System Tray
  - `logging.rs` - Logging Setup
- **Bessere Wartbarkeit** - Klarere Trennung der Verantwortlichkeiten

### 📦 Sonstiges
- Auto-Updater aktiv
- Smooth Animationen beim Song-Wechsel
- Akzentfarbe sofort zurücksetzbar
- Spotify Embed voll nutzbar im Verlauf

## [2.1.1]

- Lade-Bildschirm beim Start mit Status-Anzeige
- Visuelle Animation beim Minimieren ins Tray
- Automatisches Logging in %AppData%/logs
- Bugfixes und Performance-Verbesserungen

## [2.1.0]

- Custom Akzentfarbe mit Color Picker
- Akzentfarbe für Design 1 & 2 optional aktivierbar
- Song-Info kopieren Button im Player
- Verlauflänge einstellbar (10-100 Songs)
- Widget-Transparenz einstellbar
- Spotify Embed Ansicht im Verlauf

## [2.0.0]

- Kompletter Rewrite mit Tauri
- Kein Server mehr nötig - läuft komplett lokal
- 4 Widget-Designs (2 fest, 2 anpassbar)
- Dynamische Farben aus Album-Cover
- Custom Widgets im AppData-Ordner bearbeitbar

## [1.0.0]

- Erste Version mit Node.js Server
- Browser-basierte Widgets

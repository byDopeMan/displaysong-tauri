# Changelog

Alle wichtigen Änderungen an DisplaySong.

## [2.2.0] - 2026-01-23

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

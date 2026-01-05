mod spotify;
mod credentials;
mod color;

use std::sync::Arc;
use std::fs;
use tauri::{
    async_runtime::Mutex,
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, 
    SystemTrayMenu, SystemTrayMenuItem, State, AppHandle
};
use tokio::sync::watch;
use log::info;

// ============================================================================
// APP STATE
// ============================================================================

pub struct AppState {
    pub spotify: Mutex<Option<spotify::SpotifyClient>>,
    pub current_track: Mutex<Option<spotify::TrackInfo>>,
    pub track_history: Mutex<Vec<spotify::TrackInfo>>,
    pub status: Mutex<AppStatus>,
    pub shutdown_tx: watch::Sender<bool>,
    pub history_length: Mutex<usize>,
}

const DEFAULT_HISTORY_SIZE: usize = 20;

#[derive(Default, serde::Serialize)]
pub struct AppStatus {
    pub spotify_connected: bool,
    pub is_polling: bool,
    pub last_error: Option<String>,
    #[serde(skip)]
    pub polling_interval: u64,
}

// ============================================================================
// COMMANDS
// ============================================================================

#[tauri::command]
async fn get_track(state: State<'_, Arc<AppState>>) -> Result<Option<spotify::TrackInfo>, String> {
    let track = state.current_track.lock().await.clone();
    Ok(track)
}

#[tauri::command]
async fn get_track_history(state: State<'_, Arc<AppState>>) -> Result<Vec<spotify::TrackInfo>, String> {
    let history = state.track_history.lock().await.clone();
    Ok(history)
}

#[tauri::command]
async fn get_status(state: State<'_, Arc<AppState>>) -> Result<AppStatus, String> {
    let status = state.status.lock().await;
    Ok(AppStatus {
        spotify_connected: status.spotify_connected,
        is_polling: status.is_polling,
        last_error: status.last_error.clone(),
        polling_interval: status.polling_interval,
    })
}

#[tauri::command]
async fn save_credentials(
    client_id: String,
    client_secret: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    credentials::save(&client_id, &client_secret)?;
    
    let client = spotify::SpotifyClient::new(&client_id, &client_secret);
    *state.spotify.lock().await = Some(client);
    
    info!("Credentials gespeichert");
    Ok(())
}

#[tauri::command]
async fn get_auth_url(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let spotify = state.spotify.lock().await;
    let client = spotify.as_ref().ok_or("Keine Credentials")?;
    Ok(client.get_auth_url())
}

#[tauri::command]
async fn start_auth_server(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    
    // Server in separatem Thread starten
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_auth_server(app_clone, state_clone).await {
            eprintln!("Auth server error: {}", e);
        }
    });
    
    Ok(())
}

async fn run_auth_server(app: AppHandle, state: Arc<AppState>) -> Result<(), String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    
    let listener = TcpListener::bind("127.0.0.1:8888").await
        .map_err(|e| format!("Server bind failed: {}", e))?;
    
    info!("Auth server listening on 127.0.0.1:8888");
    
    // Nur eine Verbindung akzeptieren
    let (mut socket, _) = listener.accept().await
        .map_err(|e| format!("Accept failed: {}", e))?;
    
    let mut buffer = [0; 2048];
    let n = socket.read(&mut buffer).await
        .map_err(|e| format!("Read failed: {}", e))?;
    
    let request = String::from_utf8_lossy(&buffer[..n]);
    
    // Code aus URL extrahieren
    let code = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| {
            if path.starts_with("/callback?code=") {
                Some(path.trim_start_matches("/callback?code=").split('&').next().unwrap_or(""))
            } else {
                None
            }
        });
    
    let response = if let Some(code) = code {
        // Token austauschen
        let mut spotify = state.spotify.lock().await;
        if let Some(client) = spotify.as_mut() {
            match client.exchange_code(code).await {
                Ok(_) => {
                    // Tokens speichern
                    if let Some((access, refresh)) = client.get_tokens() {
                        let _ = credentials::save_tokens(&access, &refresh);
                    }
                    
                    state.status.lock().await.spotify_connected = true;
                    
                    // Frontend benachrichtigen
                    let _ = app.emit_all("auth-success", ());
                    
                    // Polling starten
                    let app_clone = app.clone();
                    let state_clone = state.clone();
                    tauri::async_runtime::spawn(async move {
                        start_polling(app_clone, state_clone).await;
                    });
                    
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Erfolgreich!</h1><p>Du kannst dieses Fenster schliessen.</p><script>window.close()</script></body></html>"
                }
                Err(e) => {
                    let _ = app.emit_all("auth-error", e.clone());
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Fehler</h1><p>Authentifizierung fehlgeschlagen.</p></body></html>"
                }
            }
        } else {
            "HTTP/1.1 500 Error\r\n\r\nNo client"
        }
    } else {
        "HTTP/1.1 400 Bad Request\r\n\r\nNo code"
    };
    
    socket.write_all(response.as_bytes()).await
        .map_err(|e| format!("Write failed: {}", e))?;
    
    info!("Auth server finished");
    Ok(())
}

#[tauri::command]
async fn disconnect_spotify(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Polling stoppen
    let _ = state.shutdown_tx.send(true);
    
    // State zurücksetzen
    *state.spotify.lock().await = None;
    *state.current_track.lock().await = None;
    state.status.lock().await.spotify_connected = false;
    
    // Credentials löschen
    credentials::delete()?;
    
    info!("Spotify getrennt");
    Ok(())
}

#[tauri::command]
async fn check_credentials(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<bool, String> {
    if let Ok((client_id, client_secret)) = credentials::load() {
        let mut client = spotify::SpotifyClient::new(&client_id, &client_secret);
        
        if let Ok((access, refresh)) = credentials::load_tokens() {
            client.set_tokens(&access, &refresh);
            
            if client.refresh_if_needed().await.is_ok() {
                // Neue Tokens speichern
                if let Some((new_access, new_refresh)) = client.get_tokens() {
                    let _ = credentials::save_tokens(&new_access, &new_refresh);
                }
                
                *state.spotify.lock().await = Some(client);
                state.status.lock().await.spotify_connected = true;
                
                // Polling starten
                let state_clone = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    start_polling(app, state_clone).await;
                });
                
                return Ok(true);
            }
        }
        
        *state.spotify.lock().await = Some(client);
    }
    
    Ok(false)
}

// ============================================================================
// CUSTOM DESIGNS
// ============================================================================

#[tauri::command]
async fn load_custom_design(name: String, app: AppHandle) -> Result<String, String> {
    use std::path::PathBuf;
    
    // 1. Gespeicherte Änderungen im App-Datenverzeichnis
    if let Some(data_dir) = app.path_resolver().app_data_dir() {
        let saved_path = data_dir.join("widgets").join(format!("{}.html", name));
        if saved_path.exists() {
            return fs::read_to_string(&saved_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 2. Resource-Verzeichnis (Build-Modus)
    if let Some(resource_path) = app.path_resolver().resolve_resource(format!("widgets/{}.html", name)) {
        if resource_path.exists() {
            return fs::read_to_string(&resource_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 3. Dev-Modus: src/widgets relativ zum Projekt
    let dev_paths: Vec<PathBuf> = vec![
        PathBuf::from("../src/widgets").join(format!("{}.html", name)),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/widgets").join(format!("{}.html", name)),
    ];
    
    for path in dev_paths {
        if let Ok(p) = path.canonicalize() {
            if p.exists() {
                return fs::read_to_string(&p)
                    .map_err(|e| format!("Fehler: {}", e));
            }
        }
        if path.exists() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    Err(format!("Design '{}' nicht gefunden", name))
}

#[tauri::command]
async fn save_custom_design(name: String, content: String, app: AppHandle) -> Result<(), String> {
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Konnte App-Datenverzeichnis nicht finden")?;
    
    let widgets_dir = data_dir.join("widgets");
    fs::create_dir_all(&widgets_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    let file_path = widgets_dir.join(format!("{}.html", name));
    fs::write(&file_path, &content)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    info!("Custom Design gespeichert: {}", name);
    Ok(())
}

// ============================================================================
// POLLING
// ============================================================================

async fn start_polling(app: AppHandle, state: Arc<AppState>) {
    let mut shutdown_rx = state.shutdown_tx.subscribe();
    let mut backoff_until: Option<tokio::time::Instant> = None;
    
    // Default Polling-Intervall setzen
    state.status.lock().await.polling_interval = 2000;
    state.status.lock().await.is_polling = true;
    info!("Polling gestartet");
    
    loop {
        // Aktuelles Intervall holen
        let interval = state.status.lock().await.polling_interval;
        
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("Polling gestoppt");
                    state.status.lock().await.is_polling = false;
                    return;
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(interval)) => {
                // Check backoff
                if let Some(until) = backoff_until {
                    if tokio::time::Instant::now() < until {
                        continue; // Skip this poll, still in backoff
                    }
                    backoff_until = None;
                }
                
                match poll_track(&app, &state).await {
                    Ok(_) => {}
                    Err(e) if e.contains("Rate-Limit") => {
                        // Backoff für 30 Sekunden
                        backoff_until = Some(tokio::time::Instant::now() + tokio::time::Duration::from_secs(30));
                        log::warn!("Rate limited, backing off for 30s");
                    }
                    Err(e) => {
                        // Andere Fehler nur loggen, nicht spammen
                        log::debug!("Poll-Fehler: {}", e);
                        state.status.lock().await.last_error = Some(e);
                    }
                }
            }
        }
    }
}

async fn poll_track(app: &AppHandle, state: &Arc<AppState>) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    
    let client = spotify.as_mut()
        .ok_or("Spotify nicht verbunden")?;
    
    // Token refreshen falls nötig
    client.refresh_if_needed().await
        .map_err(|e| format!("Token refresh failed: {}", e))?;
    
    // Neue Tokens speichern falls erneuert
    if let Some((access, refresh)) = client.get_tokens() {
        let _ = credentials::save_tokens(&access, &refresh);
    }
    
    // Track abrufen - mit verbessertem Error-Handling
    let track = match client.get_currently_playing().await {
        Ok(t) => t,
        Err(e) if e.contains("401") => {
            // Unauthorized - Token refreshen und nochmal versuchen
            log::info!("Got 401, forcing token refresh...");
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.get_currently_playing().await?
        }
        Err(e) if e.contains("429") => {
            // Rate limited - warten und später nochmal versuchen
            log::warn!("Rate limited by Spotify, waiting...");
            return Err("Spotify Rate-Limit erreicht - bitte warten".to_string());
        }
        Err(e) if e.contains("502") || e.contains("503") || e.contains("504") => {
            // Server-Fehler - Spotify ist temporär nicht erreichbar
            log::warn!("Spotify server error: {}", e);
            return Err("Spotify ist vorübergehend nicht erreichbar".to_string());
        }
        Err(e) if e.contains("Failed to connect") || e.contains("connection") => {
            // Netzwerk-Fehler
            log::warn!("Network error: {}", e);
            return Err("Keine Internetverbindung".to_string());
        }
        Err(e) if e.contains("No active device") || e.contains("204") => {
            // Kein aktives Gerät / nichts spielt
            log::debug!("No active playback");
            None
        }
        Err(e) => {
            log::error!("Spotify API error: {}", e);
            return Err(format!("Spotify-Fehler: {}", e));
        }
    };
    
    drop(spotify);
    
    // Track mit Farbe anreichern
    let track_with_color = if let Some(mut t) = track {
        if !t.album_cover.is_empty() {
            t.color = color::extract_from_url(&t.album_cover).await.ok();
        }
        Some(t)
    } else {
        None
    };
    
    // History aktualisieren (nur wenn neuer Track)
    if let Some(ref new_track) = track_with_color {
        let current = state.current_track.lock().await;
        let is_new = current.as_ref()
            .map(|c| c.track != new_track.track || c.artist != new_track.artist)
            .unwrap_or(true);
        drop(current);
        
        if is_new {
            let mut history = state.track_history.lock().await;
            // Duplikate vermeiden
            history.retain(|t| t.track != new_track.track || t.artist != new_track.artist);
            // Am Anfang einfügen
            history.insert(0, new_track.clone());
            // Auf max Größe begrenzen
            let max_size = *state.history_length.lock().await;
            history.truncate(max_size);
        }
    }
    
    // Speichern und emittieren
    *state.current_track.lock().await = track_with_color.clone();
    app.emit_all("track-update", &track_with_color)
        .map_err(|e| e.to_string())?;
    
    // Error zurücksetzen wenn erfolgreich
    state.status.lock().await.last_error = None;
    
    Ok(())
}

// ============================================================================
// SYSTEM TRAY
// ============================================================================

fn create_tray() -> SystemTray {
    let show = CustomMenuItem::new("show", "Anzeigen");
    let quit = CustomMenuItem::new("quit", "Beenden");
    
    let menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    SystemTray::new().with_menu(menu)
}

fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn reload_widgets(app: AppHandle) -> Result<(), String> {
    // Alle Widget-Fenster neu laden
    for label in ["widget-1", "widget-2", "widget-custom1", "widget-custom2"] {
        if let Some(window) = app.get_window(label) {
            let _ = window.eval("window.location.reload()");
        }
    }
    info!("Widgets neu geladen");
    Ok(())
}

#[tauri::command]
async fn set_polling_interval(interval: u64, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.status.lock().await.polling_interval = interval;
    info!("Polling-Intervall geändert: {}ms", interval);
    Ok(())
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        let exe_path = std::env::current_exe()
            .map_err(|e| e.to_string())?;
        
        if enabled {
            Command::new("reg")
                .args([
                    "add",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v", "DisplaySong",
                    "/t", "REG_SZ",
                    "/d", &exe_path.to_string_lossy(),
                    "/f"
                ])
                .output()
                .map_err(|e| e.to_string())?;
            info!("Autostart aktiviert");
        } else {
            Command::new("reg")
                .args([
                    "delete",
                    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                    "/v", "DisplaySong",
                    "/f"
                ])
                .output()
                .map_err(|e| e.to_string())?;
            info!("Autostart deaktiviert");
        }
    }
    Ok(())
}

#[tauri::command]
fn get_autostart() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        let output = Command::new("reg")
            .args([
                "query",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v", "DisplaySong"
            ])
            .output()
            .map_err(|e| e.to_string())?;
        
        return Ok(output.status.success());
    }
    
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[tauri::command]
fn remove_autostart_entry() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        let _ = Command::new("reg")
            .args([
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v", "DisplaySong",
                "/f"
            ])
            .output();
        info!("Autostart-Eintrag entfernt");
    }
    Ok(())
}

#[tauri::command]
async fn set_history_length(length: usize, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let length = length.clamp(10, 100);
    *state.history_length.lock().await = length;
    
    // Bestehende History kürzen falls nötig
    let mut history = state.track_history.lock().await;
    history.truncate(length);
    
    info!("History length set to {}", length);
    Ok(())
}

#[tauri::command]
async fn set_widget_opacity(label: String, opacity: f64, app: AppHandle) -> Result<(), String> {
    // Opacity zwischen 0.5 und 1.0
    let opacity = opacity.clamp(0.5, 1.0);
    
    if let Some(window) = app.get_window(&label) {
        // Tauri v1 hat keine direkte opacity API, daher über JS
        let js = format!("document.body.style.opacity = '{}';", opacity);
        window.eval(&js).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn get_custom_widget_content(name: String, app: AppHandle) -> Result<String, String> {
    use std::path::PathBuf;
    
    // 1. AppData (User-Änderungen haben Priorität!)
    if let Some(data_dir) = app.path_resolver().app_data_dir() {
        let saved_path = data_dir.join("widgets").join(format!("{}.html", name));
        if saved_path.exists() {
            return fs::read_to_string(&saved_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 2. Resource templates (Build)
    if let Some(resource_path) = app.path_resolver().resolve_resource(format!("templates/{}.html", name)) {
        if resource_path.exists() {
            return fs::read_to_string(&resource_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 3. Dev-Modus - templates Ordner
    let dev_paths: Vec<PathBuf> = vec![
        PathBuf::from("../src/templates").join(format!("{}.html", name)),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/templates").join(format!("{}.html", name)),
    ];
    
    for path in dev_paths {
        if let Ok(p) = path.canonicalize() {
            if p.exists() {
                return fs::read_to_string(&p)
                    .map_err(|e| format!("Fehler: {}", e));
            }
        }
        if path.exists() {
            return fs::read_to_string(&path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    Err(format!("Widget '{}' nicht gefunden", name))
}

#[tauri::command]
async fn open_config_folder(app: AppHandle) -> Result<(), String> {
    use std::path::PathBuf;
    
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Konnte App-Datenverzeichnis nicht finden")?;
    
    // Ordner erstellen falls nicht vorhanden
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    // Widgets-Unterordner erstellen
    let widgets_dir = data_dir.join("widgets");
    fs::create_dir_all(&widgets_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    // Custom-Dateien kopieren falls nicht vorhanden (aus templates!)
    for name in ["custom1", "custom2"] {
        let target = widgets_dir.join(format!("{}.html", name));
        if !target.exists() {
            // 1. Versuche aus Resources/templates (Build-Modus)
            if let Some(resource) = app.path_resolver().resolve_resource(format!("templates/{}.html", name)) {
                if resource.exists() {
                    let _ = fs::copy(&resource, &target);
                    continue;
                }
            }
            
            // 2. Dev-Modus: src/templates
            let dev_paths: Vec<PathBuf> = vec![
                PathBuf::from("../src/templates").join(format!("{}.html", name)),
                PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/templates").join(format!("{}.html", name)),
            ];
            
            for path in dev_paths {
                if let Ok(p) = path.canonicalize() {
                    if p.exists() {
                        let _ = fs::copy(&p, &target);
                        break;
                    }
                }
                if path.exists() {
                    let _ = fs::copy(&path, &target);
                    break;
                }
            }
        }
    }
    
    // Ordner im Explorer öffnen
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&data_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&data_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&data_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    Ok(())
}

// ============================================================================
// MAIN
// ============================================================================

fn main() {
    env_logger::init();
    
    let (shutdown_tx, _) = watch::channel(false);
    
    let state = Arc::new(AppState {
        spotify: Mutex::new(None),
        current_track: Mutex::new(None),
        track_history: Mutex::new(Vec::new()),
        status: Mutex::new(AppStatus::default()),
        shutdown_tx,
        history_length: Mutex::new(DEFAULT_HISTORY_SIZE),
    });

    tauri::Builder::default()
        .manage(state)
        .system_tray(create_tray())
        .on_system_tray_event(handle_tray_event)
        .register_uri_scheme_protocol("customwidget", |app, request| {
            // Custom protocol für dynamisches Widget-Loading
            // URLs: customwidget://custom1 oder customwidget://custom2
            let uri = request.uri();
            
            // URI ist z.B. "customwidget://custom1" - extrahiere den Namen
            let name = uri
                .strip_prefix("customwidget://")
                .unwrap_or("custom1")
                .split('/')
                .next()
                .unwrap_or("custom1");
            
            // 1. AppData prüfen (User-Änderungen)
            let content = if let Some(data_dir) = app.path_resolver().app_data_dir() {
                let saved_path = data_dir.join("widgets").join(format!("{}.html", name));
                if saved_path.exists() {
                    fs::read_to_string(&saved_path).ok()
                } else {
                    None
                }
            } else {
                None
            };
            
            // 2. Falls nicht in AppData, Resource/Templates laden
            let content = content.or_else(|| {
                if let Some(resource_path) = app.path_resolver().resolve_resource(format!("templates/{}.html", name)) {
                    if resource_path.exists() {
                        return fs::read_to_string(&resource_path).ok();
                    }
                }
                None
            });
            
            // 3. Dev-Modus Fallback
            let content = content.or_else(|| {
                let dev_path = std::path::PathBuf::from("../src/widgets").join(format!("{}.html", name));
                if dev_path.exists() {
                    return fs::read_to_string(&dev_path).ok();
                }
                let dev_path2 = std::path::PathBuf::from("src/widgets").join(format!("{}.html", name));
                if dev_path2.exists() {
                    return fs::read_to_string(&dev_path2).ok();
                }
                None
            });
            
            match content {
                Some(html) => tauri::http::ResponseBuilder::new()
                    .header("Content-Type", "text/html")
                    .body(html.into_bytes()),
                None => tauri::http::ResponseBuilder::new()
                    .status(404)
                    .body(b"Widget not found".to_vec()),
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_track,
            get_track_history,
            get_status,
            save_credentials,
            get_auth_url,
            start_auth_server,
            disconnect_spotify,
            check_credentials,
            open_config_folder,
            reload_widgets,
            set_polling_interval,
            quit_app,
            set_autostart,
            get_autostart,
            remove_autostart_entry,
            get_custom_widget_content,
            load_custom_design,
            save_custom_design,
            set_history_length,
            set_widget_opacity,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der App");
}
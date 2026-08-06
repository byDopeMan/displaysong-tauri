// ============================================================================
// PLUGIN COMMANDS
// ============================================================================

use tauri::AppHandle;
use log::{info, warn};
use serde_json::Value;

use crate::plugins::{self, PluginInfo};

// ============================================================================
// PLUGIN FOLDER CHECK
// ============================================================================

/// Check if plugins folder exists (for showing/hiding Plugins tab)
/// Returns true if folder exists OR if we should create it
#[tauri::command]
pub async fn check_plugins_folder_exists(app: AppHandle) -> Result<bool, String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    let plugins_dir = plugins::get_plugins_dir(&app_data_dir);
    
    // Check if folder exists
    if plugins_dir.exists() {
        info!("Plugins folder exists: {}", plugins_dir.display());
        return Ok(true);
    }
    
    // Folder doesn't exist - don't show tab
    info!("Plugins folder does not exist: {}", plugins_dir.display());
    Ok(false)
}

/// Dev helper: emit a fake event through the same Tauri event channel real
/// events use, so plugin listeners (onTwitchFollow/Subscribe/Raid/Cheer, …)
/// can be tested without live Twitch activity.
/// Example: emit_test_event("twitch-follow", { user_name: "Tester" }).
#[tauri::command]
pub async fn emit_test_event(app: AppHandle, event: String, payload: Value) -> Result<(), String> {
    use tauri::Manager;
    app.emit_all(&event, payload).map_err(|e| e.to_string())
}

// ============================================================================
// PLUGIN MANAGEMENT
// ============================================================================

/// Listet alle installierten Plugins
#[tauri::command]
pub async fn list_plugins(app: AppHandle) -> Result<Vec<PluginInfo>, String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    Ok(plugins::discover_plugins(&app_data_dir))
}

/// Lädt den Code eines Plugins
#[tauri::command]
pub async fn load_plugin_code(app: AppHandle, plugin_id: String) -> Result<String, String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::load_plugin_code(&app_data_dir, &plugin_id)
}

/// Aktiviert/Deaktiviert ein Plugin
#[tauri::command]
pub async fn set_plugin_enabled(app: AppHandle, plugin_id: String, enabled: bool) -> Result<(), String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::set_plugin_enabled(&app_data_dir, &plugin_id, enabled)
}

/// Öffnet den Plugins-Ordner
#[tauri::command]
pub async fn open_plugins_folder(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    let plugins_dir = plugins::get_plugins_dir(&app_data_dir);
    std::fs::create_dir_all(&plugins_dir).map_err(|e| e.to_string())?;
    
    info!("Opening plugins folder: {}", plugins_dir.display());
    
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&plugins_dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Importiert ein Plugin aus ZIP
#[tauri::command]
pub async fn install_plugin_from_zip(app: AppHandle, zip_path: String) -> Result<String, String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::import_plugin_zip(&app_data_dir, &std::path::PathBuf::from(zip_path))
}

/// Löscht ein Plugin
#[tauri::command]
pub async fn uninstall_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::delete_plugin(&app_data_dir, &plugin_id)
}

// ============================================================================
// PLUGIN DATA STORAGE (für Plugin-spezifische Daten)
// ============================================================================

/// Speichert Plugin-Daten (JSON)
#[tauri::command]
pub async fn plugin_store_data(
    app: AppHandle,
    plugin_id: String,
    key: String,
    value: Value
) -> Result<(), String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::store_plugin_data(&app_data_dir, &plugin_id, &key, &value)
}

/// Lädt Plugin-Daten
#[tauri::command]
pub async fn plugin_get_data(
    app: AppHandle,
    plugin_id: String,
    key: String
) -> Result<Value, String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::get_plugin_data(&app_data_dir, &plugin_id, &key)
}

/// Löscht Plugin-Daten
#[tauri::command]
pub async fn plugin_delete_data(
    app: AppHandle,
    plugin_id: String,
    key: String
) -> Result<(), String> {
    let app_data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Could not get app data dir")?;
    
    plugins::delete_plugin_data(&app_data_dir, &plugin_id, &key)
}

// ============================================================================
// PLUGIN SECRETS (sichere Speicherung via Keyring)
// ============================================================================

/// Speichert ein Plugin-Secret sicher
#[tauri::command]
pub async fn plugin_store_secret(
    plugin_id: String,
    key: String,
    value: String
) -> Result<(), String> {
    let service = format!("displaysong-plugin-{}", plugin_id);
    
    let entry = keyring::Entry::new(&service, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    entry.set_password(&value)
        .map_err(|e| format!("Failed to store secret: {}", e))?;
    
    info!("Plugin secret stored: {}:{}", plugin_id, key);
    Ok(())
}

/// Lädt ein Plugin-Secret
#[tauri::command]
pub async fn plugin_get_secret(
    plugin_id: String,
    key: String
) -> Result<Option<String>, String> {
    let service = format!("displaysong-plugin-{}", plugin_id);
    
    let entry = keyring::Entry::new(&service, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to get secret: {}", e))
    }
}

/// Löscht ein Plugin-Secret
#[tauri::command]
pub async fn plugin_delete_secret(
    plugin_id: String,
    key: String
) -> Result<(), String> {
    let service = format!("displaysong-plugin-{}", plugin_id);
    
    let entry = keyring::Entry::new(&service, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    match entry.delete_password() {
        Ok(_) => {
            info!("Plugin secret deleted: {}:{}", plugin_id, key);
            Ok(())
        }
        Err(keyring::Error::NoEntry) => Ok(()), // Bereits gelöscht
        Err(e) => Err(format!("Failed to delete secret: {}", e))
    }
}

// ============================================================================
// PLUGIN HTTP REQUESTS
// ============================================================================

/// Führt einen HTTP Request für ein Plugin aus
#[tauri::command]
pub async fn plugin_http_request(
    plugin_id: String,
    method: String,
    url: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>
) -> Result<PluginHttpResponse, String> {
    // Validierung
    if !url.starts_with("https://") && !url.starts_with("http://localhost") {
        return Err("Only HTTPS URLs allowed (except localhost)".to_string());
    }
    
    let client = reqwest::Client::new();
    
    let mut request = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        _ => return Err(format!("Unsupported method: {}", method))
    };
    
    // Headers hinzufügen
    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            request = request.header(&key, &value);
        }
    }
    
    // User-Agent setzen
    request = request.header("User-Agent", format!("DisplaySong-Plugin/{}", plugin_id));
    
    // Body hinzufügen
    if let Some(b) = body {
        request = request.body(b);
    }
    
    // Request ausführen
    let response = request.send().await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    let status = response.status().as_u16();
    let headers: std::collections::HashMap<String, String> = response
        .headers()
        .iter()
        .filter_map(|(k, v)| {
            v.to_str().ok().map(|s| (k.to_string(), s.to_string()))
        })
        .collect();
    
    let body = response.text().await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    Ok(PluginHttpResponse {
        status,
        headers,
        body,
    })
}

#[derive(serde::Serialize)]
pub struct PluginHttpResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
}

// ============================================================================
// PLUGIN INVOKE PROXY (mit Whitelist-Check)
// ============================================================================

/// Proxy für Plugin-Invokes - prüft ob Command erlaubt ist
#[tauri::command]
pub async fn plugin_invoke(
    plugin_id: String,
    command: String,
) -> Result<bool, String> {
    // Prüfe ob Command erlaubt
    if !plugins::is_command_allowed(&command) {
        warn!("Plugin {} tried to call blocked command: {}", plugin_id, command);
        return Err(format!("Command '{}' is not allowed for plugins", command));
    }
    
    Ok(true)
}

/// Gibt die Liste der erlaubten Commands zurück
#[tauri::command]
pub async fn plugin_get_allowed_commands() -> Result<Vec<String>, String> {
    // Liste aller Commands die Plugins nutzen dürfen
    Ok(vec![
        // Track-Daten
        "get_track".to_string(),
        "get_track_history".to_string(),
        "get_status".to_string(),
        
        // Widget-Steuerung
        "show_widget".to_string(),
        "hide_widget".to_string(),
        "is_widget_visible".to_string(),
        "get_visible_widgets".to_string(),
        
        // Plugin-eigene Commands
        "plugin_store_data".to_string(),
        "plugin_get_data".to_string(),
        "plugin_delete_data".to_string(),
        "plugin_store_secret".to_string(),
        "plugin_get_secret".to_string(),
        "plugin_delete_secret".to_string(),
        "plugin_http_request".to_string(),
    ])
}

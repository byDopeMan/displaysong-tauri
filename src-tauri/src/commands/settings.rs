// ============================================================================
// SETTINGS COMMANDS
// ============================================================================

use std::sync::Arc;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use log::info;

use crate::state::AppState;
use crate::color;

#[tauri::command]
pub async fn set_polling_interval(interval: u64, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.status.lock().await.polling_interval = interval;
    info!("Polling-Intervall geändert: {}ms", interval);
    Ok(())
}

#[tauri::command]
pub fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
pub fn set_autostart(enabled: bool) -> Result<(), String> {
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
pub fn get_autostart() -> Result<bool, String> {
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
        
        Ok(output.status.success())
    }
    
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

#[tauri::command]
pub fn remove_autostart_entry() -> Result<(), String> {
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
pub async fn set_history_length(length: usize, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let length = length.clamp(10, 100);
    *state.history_length.lock().await = length;
    
    let mut history = state.track_history.lock().await;
    history.truncate(length);
    
    info!("History length set to {}", length);
    Ok(())
}

#[tauri::command]
pub async fn open_config_folder(app: AppHandle) -> Result<(), String> {
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Konnte App-Datenverzeichnis nicht finden")?;
    
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    let widgets_dir = data_dir.join("widgets");
    fs::create_dir_all(&widgets_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    // Templates kopieren falls nicht vorhanden
    for name in ["custom1", "custom2"] {
        let target = widgets_dir.join(format!("{}.html", name));
        if !target.exists() {
            if let Some(resource) = app.path_resolver().resolve_resource(format!("{}.html", name)) {
                if resource.exists() {
                    let _ = fs::copy(&resource, &target);
                    continue;
                }
            }
            
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

#[tauri::command]
pub async fn open_logs_folder(app: AppHandle) -> Result<(), String> {
    let logs_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Konnte App-Datenverzeichnis nicht finden")?
        .join("logs");
    
    fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("Fehler: {}", e))?;
    
    info!("Öffne Logs-Ordner: {}", logs_dir.display());
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&logs_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&logs_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&logs_dir)
            .spawn()
            .map_err(|e| format!("Fehler beim Öffnen: {}", e))?;
    }
    
    Ok(())
}

// ============================================================================
// COLOR CACHE MANAGEMENT
// ============================================================================

#[tauri::command]
pub fn clear_color_cache() -> Result<usize, String> {
    let cleared = color::clear_cache();
    info!("Color cache cleared: {} entries", cleared);
    Ok(cleared)
}

#[tauri::command]
pub fn get_color_cache_size() -> Result<usize, String> {
    Ok(color::cache_size())
}

/// Extract the dominant color from an image URL. Used to tint the widgets for
/// YouTube requests (their thumbnail), like Spotify covers are colored.
#[tauri::command]
pub async fn get_dominant_color(url: String) -> Result<crate::spotify::ColorInfo, String> {
    crate::color::extract_from_url(&url).await
}

// ============================================================================
// FRONTEND LOGGING
// ============================================================================

#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    crate::logging::log_frontend(&level, &message);
}

// ============================================================================
// ACCESS REQUEST DATA (420 code - persists in Windows Credential Manager)
// ============================================================================

#[tauri::command]
pub fn save_access_data(email: String, request_id: String, status: String) -> Result<(), String> {
    crate::credentials::save_access_data(&email, &request_id, &status)
}

#[tauri::command]
pub fn load_access_data() -> Result<(String, String, String), String> {
    crate::credentials::load_access_data()
}

#[tauri::command]
pub fn delete_access_data() -> Result<(), String> {
    crate::credentials::delete_access_data()
}

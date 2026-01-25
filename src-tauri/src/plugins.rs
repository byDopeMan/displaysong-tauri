// ============================================================================
// PLUGIN SYSTEM - Core Module
// ============================================================================

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use log::{info, error};

/// Plugin Manifest (manifest.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_main")]
    pub main: String,
    #[serde(default)]
    pub permissions: Vec<String>,
}

fn default_main() -> String {
    "index.js".to_string()
}

/// Plugin Info für Frontend
#[derive(Debug, Clone, Serialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub enabled: bool,
    pub path: String,
    pub has_error: bool,
    pub error_message: Option<String>,
}

/// Plugin Settings
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginSettings {
    #[serde(default)]
    pub enabled_plugins: Vec<String>,
}

/// Commands die für Plugins BLOCKIERT sind
pub const BLOCKED_COMMANDS: &[&str] = &[
    // Spotify Credentials - Niemals für Plugins
    "save_credentials",
    "check_credentials", 
    "disconnect_spotify",
    "get_auth_url",
    "start_auth_server",
    
    // System Commands
    "quit_app",
    "set_autostart",
    "remove_autostart_entry",
    
    // Plugin Management (keine Rekursion)
    "uninstall_plugin",
    "install_plugin_from_zip",
];

/// Prüft ob ein Command für Plugins erlaubt ist
pub fn is_command_allowed(command: &str) -> bool {
    !BLOCKED_COMMANDS.contains(&command)
}

/// Hole den Plugins-Ordner Pfad
pub fn get_plugins_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("plugins")
}

/// Hole den Plugin-Data Ordner (für ein spezifisches Plugin)
pub fn get_plugin_data_dir(app_data_dir: &PathBuf, plugin_id: &str) -> PathBuf {
    app_data_dir.join("plugin-data").join(plugin_id)
}

/// Hole den Plugin-Settings Pfad
fn get_settings_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("plugin-settings.json")
}

/// Lade Plugin-Settings
pub fn load_settings(app_data_dir: &PathBuf) -> PluginSettings {
    let path = get_settings_path(app_data_dir);
    
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    
    PluginSettings::default()
}

/// Speichere Plugin-Settings
pub fn save_settings(app_data_dir: &PathBuf, settings: &PluginSettings) -> Result<(), String> {
    let path = get_settings_path(app_data_dir);
    
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Serialization failed: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("Write failed: {}", e))?;
    
    Ok(())
}

/// Entdecke alle Plugins
pub fn discover_plugins(app_data_dir: &PathBuf) -> Vec<PluginInfo> {
    let plugins_dir = get_plugins_dir(app_data_dir);
    let settings = load_settings(app_data_dir);
    
    // Erstelle Ordner falls nicht vorhanden
    if !plugins_dir.exists() {
        if let Err(e) = fs::create_dir_all(&plugins_dir) {
            error!("Failed to create plugins dir: {}", e);
            return Vec::new();
        }
    }
    
    let mut plugins = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            
            if !path.is_dir() {
                continue;
            }
            
            let manifest_path = path.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            
            match load_manifest(&manifest_path) {
                Ok(manifest) => {
                    let enabled = settings.enabled_plugins.contains(&manifest.id);
                    
                    plugins.push(PluginInfo {
                        id: manifest.id,
                        name: manifest.name,
                        version: manifest.version,
                        author: manifest.author,
                        description: manifest.description,
                        enabled,
                        path: path.to_string_lossy().to_string(),
                        has_error: false,
                        error_message: None,
                    });
                }
                Err(e) => {
                    let folder_name = path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string());
                    
                    plugins.push(PluginInfo {
                        id: folder_name.clone(),
                        name: folder_name,
                        version: "?".to_string(),
                        author: String::new(),
                        description: String::new(),
                        enabled: false,
                        path: path.to_string_lossy().to_string(),
                        has_error: true,
                        error_message: Some(e),
                    });
                }
            }
        }
    }
    
    // Sortiere alphabetisch
    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    info!("Discovered {} plugins", plugins.len());
    plugins
}

/// Lade ein Plugin-Manifest
fn load_manifest(path: &PathBuf) -> Result<PluginManifest, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Read failed: {}", e))?;
    
    let manifest: PluginManifest = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    if manifest.id.is_empty() {
        return Err("Plugin ID required".to_string());
    }
    if manifest.name.is_empty() {
        return Err("Plugin name required".to_string());
    }
    
    // ID-Validierung (nur alphanumerisch + Bindestrich)
    if !manifest.id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err("Invalid plugin ID (only a-z, 0-9, -, _)".to_string());
    }
    
    Ok(manifest)
}

/// Lade den Plugin-Code
pub fn load_plugin_code(app_data_dir: &PathBuf, plugin_id: &str) -> Result<String, String> {
    let plugins_dir = get_plugins_dir(app_data_dir);
    
    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let manifest_path = path.join("manifest.json");
            
            if manifest_path.exists() {
                if let Ok(manifest) = load_manifest(&manifest_path) {
                    if manifest.id == plugin_id {
                        let main_path = path.join(&manifest.main);
                        
                        if main_path.exists() {
                            return fs::read_to_string(&main_path)
                                .map_err(|e| format!("Read failed: {}", e));
                        } else {
                            return Err(format!("Main file not found: {}", manifest.main));
                        }
                    }
                }
            }
        }
    }
    
    Err(format!("Plugin not found: {}", plugin_id))
}

/// Aktiviere/Deaktiviere ein Plugin
pub fn set_plugin_enabled(app_data_dir: &PathBuf, plugin_id: &str, enabled: bool) -> Result<(), String> {
    let mut settings = load_settings(app_data_dir);
    
    if enabled {
        if !settings.enabled_plugins.contains(&plugin_id.to_string()) {
            settings.enabled_plugins.push(plugin_id.to_string());
            info!("Plugin enabled: {}", plugin_id);
        }
    } else {
        settings.enabled_plugins.retain(|id| id != plugin_id);
        info!("Plugin disabled: {}", plugin_id);
    }
    
    save_settings(app_data_dir, &settings)
}

/// Importiere Plugin aus ZIP
pub fn import_plugin_zip(app_data_dir: &PathBuf, zip_path: &PathBuf) -> Result<String, String> {
    use std::io::{Read, Write};
    
    let plugins_dir = get_plugins_dir(app_data_dir);
    
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open ZIP: {}", e))?;
    
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid ZIP: {}", e))?;
    
    // Finde manifest.json
    let mut plugin_id = None;
    let mut root_prefix = String::new();
    
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name();
        
        if name.ends_with("manifest.json") {
            if let Some(pos) = name.rfind("manifest.json") {
                root_prefix = name[..pos].to_string();
            }
            break;
        }
    }
    
    // Manifest lesen
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        
        if file.name().ends_with("manifest.json") {
            let mut content = String::new();
            file.read_to_string(&mut content).map_err(|e| e.to_string())?;
            
            let manifest: PluginManifest = serde_json::from_str(&content)
                .map_err(|e| format!("Invalid manifest: {}", e))?;
            
            plugin_id = Some(manifest.id);
            break;
        }
    }
    
    let plugin_id = plugin_id.ok_or("No manifest.json in ZIP")?;
    let target_dir = plugins_dir.join(&plugin_id);
    
    // Altes Plugin löschen
    if target_dir.exists() {
        fs::remove_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    
    // Dateien extrahieren
    let mut archive = zip::ZipArchive::new(fs::File::open(zip_path).unwrap()).unwrap();
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        let name = file.name().to_string();
        
        if file.is_dir() {
            continue;
        }
        
        let relative_path = if !root_prefix.is_empty() && name.starts_with(&root_prefix) {
            &name[root_prefix.len()..]
        } else {
            &name
        };
        
        if relative_path.is_empty() {
            continue;
        }
        
        let target_path = target_dir.join(relative_path);
        
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).ok();
        }
        
        let mut content = Vec::new();
        file.read_to_end(&mut content).ok();
        
        if let Ok(mut output) = fs::File::create(&target_path) {
            output.write_all(&content).ok();
        }
    }
    
    info!("Plugin imported: {}", plugin_id);
    Ok(plugin_id)
}

/// Lösche ein Plugin
pub fn delete_plugin(app_data_dir: &PathBuf, plugin_id: &str) -> Result<(), String> {
    let plugins_dir = get_plugins_dir(app_data_dir);
    
    // Plugin deaktivieren
    let _ = set_plugin_enabled(app_data_dir, plugin_id, false);
    
    // Plugin-Ordner finden und löschen
    if let Ok(entries) = fs::read_dir(&plugins_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let manifest_path = path.join("manifest.json");
            
            if manifest_path.exists() {
                if let Ok(manifest) = load_manifest(&manifest_path) {
                    if manifest.id == plugin_id {
                        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
                        
                        // Auch Plugin-Daten löschen
                        let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
                        if data_dir.exists() {
                            let _ = fs::remove_dir_all(&data_dir);
                        }
                        
                        info!("Plugin deleted: {}", plugin_id);
                        return Ok(());
                    }
                }
            }
        }
    }
    
    Err(format!("Plugin not found: {}", plugin_id))
}

// ============================================================================
// PLUGIN DATA STORAGE
// ============================================================================

/// Speichert Plugin-Daten (JSON)
pub fn store_plugin_data(app_data_dir: &PathBuf, plugin_id: &str, key: &str, value: &serde_json::Value) -> Result<(), String> {
    let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    
    let file_path = data_dir.join(format!("{}.json", sanitize_filename(key)));
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Lädt Plugin-Daten
pub fn get_plugin_data(app_data_dir: &PathBuf, plugin_id: &str, key: &str) -> Result<serde_json::Value, String> {
    let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
    let file_path = data_dir.join(format!("{}.json", sanitize_filename(key)));
    
    if !file_path.exists() {
        return Ok(serde_json::Value::Null);
    }
    
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Löscht Plugin-Daten
pub fn delete_plugin_data(app_data_dir: &PathBuf, plugin_id: &str, key: &str) -> Result<(), String> {
    let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
    let file_path = data_dir.join(format!("{}.json", sanitize_filename(key)));
    
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Sanitize filename
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

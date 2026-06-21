use super::*;
use std::fs;
use std::path::{Path, PathBuf};
use log::info;

/// Hole den Plugins-Ordner Pfad
pub fn get_plugins_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("plugins")
}

/// Hole den Plugin-Data Ordner (für ein spezifisches Plugin)
pub fn get_plugin_data_dir(app_data_dir: &Path, plugin_id: &str) -> PathBuf {
    // Daten werden im Plugin-Ordner unter /data/ gespeichert
    app_data_dir.join("plugins").join(plugin_id).join("data")
}

/// Hole den Plugin-Settings Pfad
fn get_settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("plugin-settings.json")
}

/// Lade Plugin-Settings
pub fn load_settings(app_data_dir: &Path) -> PluginSettings {
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
pub fn save_settings(app_data_dir: &Path, settings: &PluginSettings) -> Result<(), String> {
    let path = get_settings_path(app_data_dir);
    
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Serialization failed: {}", e))?;
    
    fs::write(&path, content)
        .map_err(|e| format!("Write failed: {}", e))?;
    
    Ok(())
}

/// Entdecke alle Plugins
pub fn discover_plugins(app_data_dir: &Path) -> Vec<PluginInfo> {
    let plugins_dir = get_plugins_dir(app_data_dir);
    let settings = load_settings(app_data_dir);
    
    // NICHT automatisch erstellen - User muss Ordner manuell anlegen
    if !plugins_dir.exists() {
        return Vec::new();
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
pub(crate) fn load_manifest(path: &Path) -> Result<PluginManifest, String> {
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
pub fn load_plugin_code(app_data_dir: &Path, plugin_id: &str) -> Result<String, String> {
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
pub fn set_plugin_enabled(app_data_dir: &Path, plugin_id: &str, enabled: bool) -> Result<(), String> {
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


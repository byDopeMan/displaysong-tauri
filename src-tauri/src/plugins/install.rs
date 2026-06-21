use super::*;
use std::fs;
use std::path::Path;
use log::info;

/// Importiere Plugin aus ZIP
pub fn import_plugin_zip(app_data_dir: &Path, zip_path: &Path) -> Result<String, String> {
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
pub fn delete_plugin(app_data_dir: &Path, plugin_id: &str) -> Result<(), String> {
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


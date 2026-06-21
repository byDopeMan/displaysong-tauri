use super::*;
use std::fs;
use std::path::Path;

// ============================================================================
// PLUGIN DATA STORAGE
// ============================================================================

/// Speichert Plugin-Daten (JSON)
pub fn store_plugin_data(app_data_dir: &Path, plugin_id: &str, key: &str, value: &serde_json::Value) -> Result<(), String> {
    let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    
    let file_path = data_dir.join(format!("{}.json", sanitize_filename(key)));
    let content = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Lädt Plugin-Daten
pub fn get_plugin_data(app_data_dir: &Path, plugin_id: &str, key: &str) -> Result<serde_json::Value, String> {
    let data_dir = get_plugin_data_dir(app_data_dir, plugin_id);
    let file_path = data_dir.join(format!("{}.json", sanitize_filename(key)));
    
    if !file_path.exists() {
        return Ok(serde_json::Value::Null);
    }
    
    let content = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Löscht Plugin-Daten
pub fn delete_plugin_data(app_data_dir: &Path, plugin_id: &str, key: &str) -> Result<(), String> {
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

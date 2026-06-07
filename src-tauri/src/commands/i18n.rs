// =============================================================================
// i18n COMMANDS - Community Translations Support
// =============================================================================

use tauri::command;
use std::fs;

#[derive(serde::Serialize)]
pub struct CustomLanguage {
    pub code: String,
    pub name: String,
    pub author: String,
    pub version: String,
}

/// Get list of custom languages from AppData/com.displaysong.app/locales/
#[command]
pub async fn get_custom_languages() -> Result<Vec<CustomLanguage>, String> {
    let app_data = tauri::api::path::data_dir()
        .ok_or("Could not get AppData directory")?;
    
    let locales_dir = app_data.join("com.displaysong.app").join("locales");
    
    // Create directory if it doesn't exist
    if !locales_dir.exists() {
        fs::create_dir_all(&locales_dir)
            .map_err(|e| format!("Failed to create locales dir: {}", e))?;
        return Ok(Vec::new());
    }
    
    let mut languages = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&locales_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            
            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            
            // Read and parse JSON
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(meta) = json.get("meta") {
                        let code = meta["code"].as_str().unwrap_or("").to_string();
                        let name = meta["language"].as_str().unwrap_or("Unknown").to_string();
                        let author = meta["author"].as_str().unwrap_or("Community").to_string();
                        let version = meta["version"].as_str().unwrap_or("1.0.0").to_string();
                        
                        // Skip if code is empty
                        if code.is_empty() {
                            continue;
                        }
                        
                        languages.push(CustomLanguage {
                            code,
                            name,
                            author,
                            version,
                        });
                    }
                }
            }
        }
    }
    
    Ok(languages)
}

/// Load a custom language from AppData/com.displaysong.app/locales/
#[command]
pub async fn load_custom_language(code: String) -> Result<String, String> {
    let app_data = tauri::api::path::data_dir()
        .ok_or("Could not get AppData directory")?;
    
    let lang_file = app_data
        .join("com.displaysong.app")
        .join("locales")
        .join(format!("{}.json", code));
    
    if !lang_file.exists() {
        return Err(format!("Language file not found: {}", code));
    }
    
    fs::read_to_string(lang_file)
        .map_err(|e| format!("Failed to read language file: {}", e))
}

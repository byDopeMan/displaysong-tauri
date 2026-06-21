use serde::{Deserialize, Serialize};

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


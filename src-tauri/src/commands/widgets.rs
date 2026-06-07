// ============================================================================
// WIDGET COMMANDS - Lazy Loading
// ============================================================================

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, WindowBuilder, WindowUrl};
use log::info;

/// Widget-Konfigurationen für Lazy Loading
struct WidgetConfig {
    label: &'static str,
    title: &'static str,
    url: &'static str,
    width: f64,
    height: f64,
    min_width: Option<f64>,
    min_height: Option<f64>,
    resizable: bool,
}

const WIDGET_CONFIGS: &[WidgetConfig] = &[
    WidgetConfig {
        label: "widget-1",
        title: "Widget - Compact Bar",
        url: "widgets/design1.html",
        width: 380.0,
        height: 120.0,
        min_width: Some(280.0),
        min_height: Some(80.0),
        resizable: true,
    },
    WidgetConfig {
        label: "widget-2",
        title: "Widget - Album Focus",
        url: "widgets/design2.html",
        width: 320.0,
        height: 412.0,
        min_width: None,
        min_height: None,
        resizable: false,
    },
    WidgetConfig {
        label: "widget-custom1",
        title: "Widget - Custom 1",
        url: "widgets/custom1.html",
        width: 250.0,
        height: 260.0,
        min_width: None,
        min_height: None,
        resizable: true,
    },
    WidgetConfig {
        label: "widget-custom2",
        title: "Widget - Custom 2",
        url: "widgets/custom2.html",
        width: 340.0,
        height: 80.0,
        min_width: None,
        min_height: None,
        resizable: true,
    },
];

fn get_widget_config(label: &str) -> Option<&'static WidgetConfig> {
    WIDGET_CONFIGS.iter().find(|c| c.label == label)
}

/// Erstellt ein Widget-Fenster dynamisch (Lazy Loading)
fn create_widget_window(app: &AppHandle, config: &WidgetConfig) -> Result<tauri::Window, String> {
    let mut builder = WindowBuilder::new(
        app,
        config.label,
        WindowUrl::App(config.url.into())
    )
    .title(config.title)
    .inner_size(config.width, config.height)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .resizable(config.resizable);
    
    if let (Some(min_w), Some(min_h)) = (config.min_width, config.min_height) {
        builder = builder.min_inner_size(min_w, min_h);
    }
    
    builder.build().map_err(|e| format!("Failed to create window: {}", e))
}

#[tauri::command]
pub async fn show_widget(app: AppHandle, widget_label: String) -> Result<(), String> {
    // Prüfen ob Fenster existiert, wenn nicht -> erstellen (Lazy Loading)
    let window = match app.get_window(&widget_label) {
        Some(w) => w,
        None => {
            let config = get_widget_config(&widget_label)
                .ok_or_else(|| format!("Unknown widget: {}", widget_label))?;
            
            info!("Creating widget window lazily: {}", widget_label);
            create_widget_window(&app, config)?
        }
    };
    
    window.show().map_err(|e| format!("Show error: {}", e))?;
    window.set_focus().map_err(|e| format!("Focus error: {}", e))?;
    
    info!("Widget shown: {}", widget_label);
    Ok(())
}

#[tauri::command]
pub async fn hide_widget(app: AppHandle, widget_label: String) -> Result<(), String> {
    if let Some(window) = app.get_window(&widget_label) {
        window.hide().map_err(|e| format!("Hide error: {}", e))?;
        info!("Widget hidden: {}", widget_label);
    }
    Ok(())
}

#[tauri::command]
pub async fn close_widget(app: AppHandle, widget_label: String) -> Result<(), String> {
    if let Some(window) = app.get_window(&widget_label) {
        window.close().map_err(|e| format!("Close error: {}", e))?;
        info!("Widget closed (destroyed): {}", widget_label);
    }
    Ok(())
}

#[tauri::command]
pub async fn is_widget_visible(app: AppHandle, widget_label: String) -> Result<bool, String> {
    match app.get_window(&widget_label) {
        Some(window) => window.is_visible().map_err(|e| format!("Error: {}", e)),
        None => Ok(false), // Nicht erstellt = nicht sichtbar
    }
}

#[tauri::command]
pub async fn get_visible_widgets(app: AppHandle) -> Result<Vec<String>, String> {
    let mut visible = Vec::new();
    
    for config in WIDGET_CONFIGS {
        if let Some(window) = app.get_window(config.label) {
            if window.is_visible().unwrap_or(false) {
                visible.push(config.label.to_string());
            }
        }
    }
    
    Ok(visible)
}

#[tauri::command]
pub async fn reload_widgets(app: AppHandle) -> Result<(), String> {
    for name in ["custom1", "custom2"] {
        let label = format!("widget-{}", name);
        
        if let Some(window) = app.get_window(&label) {
            if let Some(data_dir) = app.path_resolver().app_data_dir() {
                let custom_path = data_dir.join("widgets").join(format!("{}.html", name));
                if custom_path.exists() {
                    if let Ok(content) = fs::read_to_string(&custom_path) {
                        let escaped = content
                            .replace("\\", "\\\\")
                            .replace("`", "\\`")
                            .replace("$", "\\$");
                        
                        let js = format!(
                            r#"document.open(); document.write(`{}`); document.close();"#,
                            escaped
                        );
                        let _ = window.eval(&js);
                        continue;
                    }
                }
            }
            
            let _ = window.eval("window.location.reload()");
        }
    }
    
    for label in ["widget-1", "widget-2"] {
        if let Some(window) = app.get_window(label) {
            let _ = window.eval("window.location.reload()");
        }
    }
    
    info!("Widgets neu geladen");
    Ok(())
}

#[tauri::command]
pub async fn set_widget_opacity(label: String, opacity: f64, app: AppHandle) -> Result<(), String> {
    let opacity = opacity.clamp(0.5, 1.0);
    
    if let Some(window) = app.get_window(&label) {
        let js = format!("document.body.style.opacity = '{}';", opacity);
        window.eval(&js).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn send_accent_to_widget(label: String, r: u8, g: u8, b: u8, app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window(&label) {
        let js = format!(
            r#"
            document.documentElement.style.setProperty('--accent-r', '{}');
            document.documentElement.style.setProperty('--accent-g', '{}');
            document.documentElement.style.setProperty('--accent-b', '{}');
            document.documentElement.style.setProperty('--accent', 'rgb({}, {}, {})');
            window.dispatchEvent(new CustomEvent('accent-color-change', {{ 
                detail: {{ r: {}, g: {}, b: {} }} 
            }}));
            "#,
            r, g, b, r, g, b, r, g, b
        );
        window.eval(&js).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn reset_widget_accent(label: String, app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window(&label) {
        let js = r#"window.dispatchEvent(new CustomEvent('accent-color-reset'));"#;
        window.eval(js).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn set_widget_autohide(label: String, enabled: bool, app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window(&label) {
        let js = format!(
            r#"window.autoHideEnabled = {}; window.dispatchEvent(new CustomEvent('autohide-change', {{ detail: {{ enabled: {} }} }}));"#,
            enabled, enabled
        );
        window.eval(&js).map_err(|e| e.to_string())?;
        info!("Widget {} autohide set to: {}", label, enabled);
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_custom_widget_content(name: String, app: AppHandle) -> Result<String, String> {
    // 1. Gespeicherte Custom-Version prüfen
    if let Some(data_dir) = app.path_resolver().app_data_dir() {
        let saved_path = data_dir.join("widgets").join(format!("{}.html", name));
        if saved_path.exists() {
            return fs::read_to_string(&saved_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 2. Bundled Resources prüfen
    if let Some(resource_path) = app.path_resolver().resolve_resource(format!("templates/{}.html", name)) {
        if resource_path.exists() {
            return fs::read_to_string(&resource_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    // 3. Development-Pfade prüfen
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
pub async fn load_custom_design(name: String, app: AppHandle) -> Result<String, String> {
    if let Some(data_dir) = app.path_resolver().app_data_dir() {
        let saved_path = data_dir.join("widgets").join(format!("{}.html", name));
        if saved_path.exists() {
            return fs::read_to_string(&saved_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
    if let Some(resource_path) = app.path_resolver().resolve_resource(format!("widgets/{}.html", name)) {
        if resource_path.exists() {
            return fs::read_to_string(&resource_path)
                .map_err(|e| format!("Fehler: {}", e));
        }
    }
    
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
pub async fn save_custom_design(name: String, content: String, app: AppHandle) -> Result<(), String> {
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

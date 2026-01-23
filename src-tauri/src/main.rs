//! DisplaySong - Spotify Now Playing Widget
//! 
//! Eine Tauri-Anwendung zur Anzeige des aktuellen Spotify-Tracks
//! mit anpassbaren Widget-Designs.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod spotify;
mod credentials;
mod color;
mod state;
mod commands;
mod tray;
mod logging;
mod polling;

use std::fs;
use log::{info, error};
use tauri::Manager;

use state::AppState;

fn main() {
    let state = AppState::new();

    tauri::Builder::default()
        .manage(state)
        .system_tray(tray::create_tray())
        .on_system_tray_event(tray::handle_tray_event)
        .invoke_handler(tauri::generate_handler![
            // Track & Status
            commands::get_track,
            commands::get_track_history,
            commands::get_status,
            // Auth
            commands::save_credentials,
            commands::get_auth_url,
            commands::start_auth_server,
            commands::disconnect_spotify,
            commands::check_credentials,
            // Widgets (Lazy Loading)
            commands::show_widget,
            commands::hide_widget,
            commands::close_widget,
            commands::is_widget_visible,
            commands::get_visible_widgets,
            commands::reload_widgets,
            commands::set_widget_opacity,
            commands::send_accent_to_widget,
            commands::reset_widget_accent,
            // Custom Widgets
            commands::get_custom_widget_content,
            commands::load_custom_design,
            commands::save_custom_design,
            // Settings
            commands::open_config_folder,
            commands::open_logs_folder,
            commands::set_polling_interval,
            commands::quit_app,
            commands::set_autostart,
            commands::get_autostart,
            commands::remove_autostart_entry,
            commands::set_history_length,
            // Cache Management
            commands::clear_color_cache,
            commands::get_color_cache_size,
        ])
        .setup(|app| {
            let data_dir = app.path_resolver().app_data_dir();
            
            // Logging initialisieren
            if let Err(e) = logging::setup_logging(data_dir.clone()) {
                eprintln!("Logging setup failed: {}", e);
            } else {
                info!("=== DisplaySong v2.2.0 gestartet ===");
                info!("Lazy Loading: Widgets werden bei Bedarf erstellt");
                if let Some(ref dir) = data_dir {
                    info!("App-Daten: {}", dir.display());
                }
            }
            
            // Panic Handler für Crash-Logs
            let log_dir = data_dir.map(|d| d.join("logs"));
            std::panic::set_hook(Box::new(move |panic_info| {
                let msg = format!("PANIC: {}", panic_info);
                error!("{}", msg);
                
                if let Some(ref dir) = log_dir {
                    let crash_file = dir.join(format!(
                        "crash_{}.log",
                        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")
                    ));
                    let _ = fs::write(&crash_file, &msg);
                }
            }));
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der App");
}

//! DisplaySong - Spotify Now Playing Widget
//! 
//! Eine Tauri-Anwendung zur Anzeige des aktuellen Spotify-Tracks
//! mit anpassbaren Widget-Designs.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod spotify;
mod twitch;
mod credentials;
mod color;
mod state;
mod commands;
mod tray;
mod logging;
mod polling;
mod plugins;
mod python;
mod events;
mod songlink;
mod windows_media;

use std::fs;
use log::{info, error};

use state::AppState;
use commands::twitch::TwitchState;
use commands::windows_media::WindowsMediaState;

fn main() {
    let state = AppState::new();
    let twitch_state = TwitchState::new();
    let windows_media_state = std::sync::Arc::new(WindowsMediaState::new());

    tauri::Builder::default()
        .manage(state)
        .manage(twitch_state)
        .manage(windows_media_state)
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
            // Polling Control
            commands::start_spotify_polling,
            commands::stop_spotify_polling,
            // Playback Control
            commands::add_to_queue,
            commands::play_track,
            commands::get_track_info,
            // Spotify Playlist Management
            commands::check_spotify_scopes,
            commands::create_spotify_playlist,
            commands::add_to_spotify_playlist,
            commands::remove_from_spotify_playlist,
            commands::delete_spotify_playlist,
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
            commands::set_widget_autohide,
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
            // Frontend Logging
            commands::log_frontend,
            // Plugins
            commands::check_plugins_folder_exists,
            commands::list_plugins,
            commands::load_plugin_code,
            commands::set_plugin_enabled,
            commands::open_plugins_folder,
            commands::install_plugin_from_zip,
            commands::uninstall_plugin,
            // Plugin API
            commands::plugin_store_data,
            commands::plugin_get_data,
            commands::plugin_delete_data,
            commands::plugin_store_secret,
            commands::plugin_get_secret,
            commands::plugin_delete_secret,
            commands::plugin_http_request,
            commands::plugin_invoke,
            commands::plugin_get_allowed_commands,
            // Twitch
            commands::twitch_connect,
            commands::save_twitch_credentials,
            commands::check_twitch_credentials,
            commands::twitch_get_auth_url,
            commands::twitch_start_auth,
            commands::twitch_get_connection,
            commands::twitch_disconnect,
            commands::twitch_set_mode,
            commands::twitch_set_sub_only,
            commands::twitch_set_use_bot,
            commands::get_song_request_queue,
            commands::add_song_request,
            commands::remove_song_request,
            commands::clear_song_request_queue,
            commands::check_request_cooldown,
            commands::update_request_cooldown,
            commands::queue::save_track_to_history,
            commands::queue::get_local_track_history,
            commands::i18n::get_custom_languages,
            commands::i18n::load_custom_language,
            commands::twitch_set_command,
            commands::twitch_set_cooldown,
            commands::twitch_set_reward_id,
            commands::twitch_get_settings,
            commands::twitch_send_chat,
            commands::twitch_delete_credentials,
            commands::twitch_get_rewards,
            commands::twitch_create_reward,
            commands::twitch_connect_eventsub,
            commands::twitch_update_redemption,
            // Python
            commands::python_available,
            commands::python_version,
            commands::python_run_code,
            commands::python_run_script,
            commands::python_pip_install,
            commands::python_package_installed,
            // Songlink - Convert streaming links to Spotify
            commands::convert_link_to_spotify,
            commands::is_streaming_link,
            commands::get_link_platform,
            commands::get_all_streaming_links,
            // Windows Media Session - Universal music detection
            commands::get_windows_media_track,
            commands::is_windows_media_available,
            // Access Request Data (420 code persistence)
            commands::save_access_data,
            commands::load_access_data,
            commands::delete_access_data,
        ])
        .setup(|app| {
            let data_dir = app.path_resolver().app_data_dir();
            
            // Logging initialisieren (clears log on each start)
            if let Err(e) = logging::setup_logging(data_dir.clone()) {
                eprintln!("Logging setup failed: {}", e);
            } else {
                info!("=== DisplaySong v3.0.0 gestartet ===");
                info!("Lazy Loading: Widgets werden bei Bedarf erstellt");
                if let Some(ref dir) = data_dir {
                    info!("App-Daten: {}", dir.display());
                }
            }
            
            // Initialize SQLite database (song_requests + track_history tables)
            if let Some(ref dir) = data_dir {
                if let Err(e) = commands::queue::init_queue_db(dir) {
                    error!("Database init failed: {}", e);
                }
            }
            
            // Python Runner initialisieren
            tauri::async_runtime::spawn(async {
                commands::python_cmd::init_python().await;
            });
            
            // Panic Handler - creates crash log with FULL log content
            let log_dir = data_dir.map(|d| d.join("logs"));
            std::panic::set_hook(Box::new(move |panic_info| {
                // Get full backtrace
                let backtrace = std::backtrace::Backtrace::force_capture();
                
                // Location Info
                let location = panic_info.location().map(|l| 
                    format!("{}:{}:{}", l.file(), l.line(), l.column())
                ).unwrap_or_else(|| "unknown location".to_string());
                
                // Panic message
                let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
                    s.clone()
                } else {
                    "Unknown panic payload".to_string()
                };
                
                // Get the full log content up to this point
                let log_content = logging::get_log_content();
                
                // Format crash report with nice formatting
                let crash_msg = format!(
                    "╔══════════════════════════════════════════════════════════════════════╗\n\
║  DisplaySong Crash Report                                          ║\n\
║  Version: 2.2.0                                                     ║\n\
║  Time: {:>50}  ║\n\
╚══════════════════════════════════════════════════════════════════════╝\n\n\
━━━ ERROR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\
{}\n\n\
━━━ LOCATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\
{}\n\n\
━━━ APPLICATION LOG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\
{}\n\n\
━━━ TRACEBACK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\
{}",
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                    payload,
                    location,
                    log_content,
                    backtrace
                );
                
                error!("CRASH: {} at {}", payload, location);
                
                // Write crash log file
                if let Some(ref dir) = log_dir {
                    let _ = fs::create_dir_all(dir);
                    let crash_file = dir.join(format!(
                        "crash_{}.log",
                        chrono::Local::now().format("%Y-%m-%d_%H-%M-%S")
                    ));
                    let _ = fs::write(&crash_file, &crash_msg);
                    eprintln!("Crash log saved to: {}", crash_file.display());
                }
            }));
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der App");
}

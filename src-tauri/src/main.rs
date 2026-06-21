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
    // Disable the WebView2 disk cache so frontend updates always load fresh.
    // Without this, WebView2 can serve a stale cached index.html/CSS/JS across
    // reloads and even app restarts, so UI changes (and app updates) don't appear.
    // Honored by the WebView2 runtime when set before the webview is created.
    #[cfg(windows)]
    {
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let mut args = existing.clone();
        if !args.contains("disk-cache-size") {
            args = format!("{} --disk-cache-size=1", args);
        }
        // Allow the hidden YouTube player to start playback without a user gesture
        // (auto-play hands songs over automatically, which Chromium would block by
        // default with "autoplay-policy=user-gesture-required").
        if !args.contains("autoplay-policy") {
            args = format!("{} --autoplay-policy=no-user-gesture-required", args);
        }
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", args.trim());
    }

    // Enforce a single running instance: hold a localhost lock port for the
    // whole process lifetime. Only "address already in use" means another
    // instance is running (then this duplicate exits). Any OTHER bind error
    // (e.g. a Hyper-V/WSL reserved dynamic-port range — which is why the port
    // must sit below 49152) must NOT block startup. The port frees on app exit.
    #[cfg(windows)]
    {
        use std::io::ErrorKind;
        match std::net::TcpListener::bind("127.0.0.1:41730") {
            Ok(listener) => {
                std::mem::forget(listener); // hold the lock until the process ends
            }
            Err(ref e) if e.kind() == ErrorKind::AddrInUse => {
                eprintln!("DisplaySong läuft bereits – zweite Instanz wird beendet.");
                std::process::exit(0);
            }
            Err(e) => {
                eprintln!("Single-Instance-Lock nicht verfügbar ({e}); starte trotzdem.");
            }
        }
    }

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
            commands::spotify_pause,
            commands::spotify_resume,
            commands::spotify_next,
            commands::spotify_get_volume,
            commands::set_external_playback,
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
            // Custom Widgets
            commands::get_custom_widget_content,
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
            commands::get_dominant_color,
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
            commands::twitch_check_scopes,
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
            commands::youtube_audio_url,
            // Songlink - Convert streaming links to Spotify
            commands::convert_link_to_spotify,
            commands::is_streaming_link,
            commands::get_link_platform,
            commands::get_all_streaming_links,
            commands::resolve_song_request,
            // Windows Media Session - Universal music detection
            commands::get_windows_media_track,
            commands::push_track_update,
            commands::is_windows_media_available,
            commands::detect_known_sources,
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
                info!("=== DisplaySong v{} gestartet ===", env!("CARGO_PKG_VERSION"));
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
║  Version: {:<59}║\n\
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
                    env!("CARGO_PKG_VERSION"),
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

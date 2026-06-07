// ============================================================================
// LOGGING SETUP
// ============================================================================

use std::fs::{self, OpenOptions};
use std::path::PathBuf;
use std::sync::Mutex;
use log::LevelFilter;
use once_cell::sync::Lazy;

// Store log file path globally for crash handler
pub static LOG_FILE_PATH: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

pub fn setup_logging(app_data_dir: Option<PathBuf>) -> Result<(), fern::InitError> {
    let log_dir = app_data_dir
        .map(|d| d.join("logs"))
        .unwrap_or_else(|| PathBuf::from("logs"));
    
    let _ = fs::create_dir_all(&log_dir);
    
    // Single log file - always the same name
    let log_file = log_dir.join("displaysong.log");
    
    // Store path for crash handler
    if let Ok(mut path) = LOG_FILE_PATH.lock() {
        *path = Some(log_file.clone());
    }
    
    // Clear log on app start (truncate existing file)
    let _ = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&log_file);
    
    // Clean up old crash logs (keep last 5)
    cleanup_old_crash_logs(&log_dir, 5);
    
    fern::Dispatch::new()
        .format(|out, message, record| {
            // Schönere Formatierung mit Symbolen
            let level_icon = match record.level() {
                log::Level::Error => "✖",
                log::Level::Warn  => "⚠",
                log::Level::Info  => "●",
                log::Level::Debug => "◌",
                log::Level::Trace => "·",
            };
            
            let level_str = match record.level() {
                log::Level::Error => "ERROR",
                log::Level::Warn  => "WARN ",
                log::Level::Info  => "INFO ",
                log::Level::Debug => "DEBUG",
                log::Level::Trace => "TRACE",
            };
            
            // Target kürzen für bessere Lesbarkeit
            let target = record.target();
            let short_target = if target.starts_with("displaysong::") {
                target.trim_start_matches("displaysong::")
            } else if target == "displaysong" {
                "app"
            } else if target == "frontend" {
                "js"
            } else {
                target
            };
            
            out.finish(format_args!(
                "{} {} [{:>5}] {:>12} │ {}",
                chrono::Local::now().format("%H:%M:%S"),
                level_icon,
                level_str,
                short_target,
                message
            ))
        })
        .level(LevelFilter::Warn)
        .level_for("displaysong", LevelFilter::Info)
        .level_for("frontend", LevelFilter::Info)
        .level_for("reqwest", LevelFilter::Error)
        .level_for("hyper", LevelFilter::Error)
        .level_for("rustls", LevelFilter::Error)
        .level_for("tao", LevelFilter::Error)
        .level_for("wry", LevelFilter::Error)
        .chain(fern::log_file(&log_file)?)
        .apply()?;
    
    Ok(())
}

/// Get the current log content for crash reports
pub fn get_log_content() -> String {
    if let Ok(path) = LOG_FILE_PATH.lock() {
        if let Some(ref log_path) = *path {
            if let Ok(content) = fs::read_to_string(log_path) {
                return content;
            }
        }
    }
    String::from("(Log content not available)")
}

/// Clean up old crash logs, keeping only the most recent ones
fn cleanup_old_crash_logs(log_dir: &PathBuf, keep_count: usize) {
    if let Ok(entries) = fs::read_dir(log_dir) {
        let mut crash_logs: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| n.starts_with("crash_") && n.ends_with(".log"))
            })
            .collect();
        
        // Sort by modification time (oldest first)
        crash_logs.sort_by(|a, b| {
            let time_a = a.metadata().and_then(|m| m.modified()).ok();
            let time_b = b.metadata().and_then(|m| m.modified()).ok();
            time_a.cmp(&time_b)
        });
        
        // Remove oldest files beyond keep_count
        while crash_logs.len() > keep_count {
            if let Some(old) = crash_logs.first() {
                let _ = fs::remove_file(old.path());
            }
            crash_logs.remove(0);
        }
    }
}

/// Log a message from the frontend (JavaScript)
pub fn log_frontend(level: &str, message: &str) {
    match level {
        "error" => log::error!(target: "frontend", "{}", message),
        "warn" => log::warn!(target: "frontend", "{}", message),
        "info" => log::info!(target: "frontend", "{}", message),
        "debug" => log::debug!(target: "frontend", "{}", message),
        _ => log::info!(target: "frontend", "{}", message),
    }
}

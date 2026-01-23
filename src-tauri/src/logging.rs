// ============================================================================
// LOGGING SETUP
// ============================================================================

use std::fs;
use std::path::PathBuf;
use log::LevelFilter;

pub fn setup_logging(app_data_dir: Option<PathBuf>) -> Result<(), fern::InitError> {
    let log_dir = app_data_dir
        .map(|d| d.join("logs"))
        .unwrap_or_else(|| PathBuf::from("logs"));
    
    let _ = fs::create_dir_all(&log_dir);
    
    let log_file = log_dir.join(format!(
        "displaysong_{}.log",
        chrono::Local::now().format("%Y-%m-%d")
    ));
    
    // Alte Log-Dateien aufräumen (max. 3 behalten)
    if let Ok(entries) = fs::read_dir(&log_dir) {
        let mut log_files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "log"))
            .collect();
        
        log_files.sort_by_key(|e| e.path());
        
        while log_files.len() > 3 {
            if let Some(old) = log_files.first() {
                let _ = fs::remove_file(old.path());
            }
            log_files.remove(0);
        }
    }
    
    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{} {} {}] {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                record.level(),
                record.target(),
                message
            ))
        })
        .level(LevelFilter::Warn)
        .level_for("displaysong", LevelFilter::Info)
        .level_for("reqwest", LevelFilter::Error)
        .level_for("hyper", LevelFilter::Error)
        .level_for("rustls", LevelFilter::Error)
        .level_for("tao", LevelFilter::Error)
        .level_for("wry", LevelFilter::Error)
        .chain(fern::log_file(log_file)?)
        .apply()?;
    
    Ok(())
}

// ============================================================================
// PYTHON COMMANDS - Execute Python from plugins
// ============================================================================

use std::path::PathBuf;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use crate::python::{PythonRunner, PythonResult};

// Global Python runner
static PYTHON: Lazy<Mutex<Option<PythonRunner>>> = Lazy::new(|| Mutex::new(None));

/// Initialize Python runner
pub async fn init_python() {
    let mut python = PYTHON.lock().await;
    *python = Some(PythonRunner::new());
}

/// Check if Python is available
#[tauri::command]
pub async fn python_available() -> Result<bool, String> {
    let python = PYTHON.lock().await;
    Ok(python.as_ref().map(|p| p.is_available()).unwrap_or(false))
}

/// Get Python version
#[tauri::command]
pub async fn python_version() -> Result<Option<String>, String> {
    let python = PYTHON.lock().await;
    Ok(python.as_ref().and_then(|p| p.get_version()))
}

/// Run Python code
#[tauri::command]
pub async fn python_run_code(code: String) -> Result<PythonResult, String> {
    let python = PYTHON.lock().await;
    let runner = python.as_ref().ok_or("Python not initialized")?;
    Ok(runner.run_code(&code).await)
}

/// Run Python script file
#[tauri::command]
pub async fn python_run_script(
    script_path: String,
    args: Vec<String>,
) -> Result<PythonResult, String> {
    let python = PYTHON.lock().await;
    let runner = python.as_ref().ok_or("Python not initialized")?;
    let path = PathBuf::from(script_path);
    Ok(runner.run_script(&path, args).await)
}

/// Install Python package
#[tauri::command]
pub async fn python_pip_install(package: String) -> Result<PythonResult, String> {
    let python = PYTHON.lock().await;
    let runner = python.as_ref().ok_or("Python not initialized")?;
    Ok(runner.pip_install(&package).await)
}

/// Check if package is installed
#[tauri::command]
pub async fn python_package_installed(package: String) -> Result<bool, String> {
    let python = PYTHON.lock().await;
    let runner = python.as_ref().ok_or("Python not initialized")?;
    Ok(runner.is_package_installed(&package).await)
}

// yt-dlp snippet: resolve a video's direct best-audio stream URL (+ duration,
// title). __VID__ is replaced with the validated video id. Printed as JSON.
const YT_DLP_CODE: &str = r#"import json,yt_dlp
o={'format':'bestaudio/best','quiet':True,'no_warnings':True,'noplaylist':True,'skip_download':True}
i=yt_dlp.YoutubeDL(o).extract_info('https://www.youtube.com/watch?v=__VID__',download=False)
u=i.get('url')
if not u:
 for f in (i.get('formats') or []):
  if f.get('url') and f.get('acodec') not in (None,'none'): u=f['url']
print(json.dumps({'url':u or '','duration':i.get('duration') or 0,'title':i.get('title') or ''}))
"#;

/// Resolve the direct audio stream URL for a YouTube video via yt-dlp. This plays
/// videos that block embedding (which the IFrame player can't), because we fetch
/// the raw audio stream instead of embedding. Installs yt-dlp on first use.
#[tauri::command]
pub async fn youtube_audio_url(video_id: String) -> Result<serde_json::Value, String> {
    if video_id.is_empty()
        || !video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid video id".to_string());
    }

    let python = PYTHON.lock().await;
    let runner = python.as_ref().ok_or("Python not initialized")?;

    if !runner.is_available() {
        return Err("Python ist nicht installiert (für YouTube-Wiedergabe benötigt)".to_string());
    }

    // Ensure yt-dlp is available (install on first use).
    if !runner.is_package_installed("yt_dlp").await {
        let r = runner.pip_install("yt-dlp").await;
        if !r.success {
            return Err(format!("yt-dlp Installation fehlgeschlagen: {}", r.stderr));
        }
    }

    let code = YT_DLP_CODE.replace("__VID__", &video_id);
    let res = runner.run_code(&code).await;
    if !res.success {
        return Err(format!("yt-dlp Fehler: {}", res.stderr.trim()));
    }

    let line = res.stdout.lines().last().unwrap_or("").trim();
    let v: serde_json::Value = serde_json::from_str(line)
        .map_err(|e| format!("yt-dlp Antwort ungültig: {} ({})", e, line))?;

    if v.get("url").and_then(|u| u.as_str()).unwrap_or("").is_empty() {
        return Err("Keine Audio-URL gefunden".to_string());
    }
    Ok(v)
}

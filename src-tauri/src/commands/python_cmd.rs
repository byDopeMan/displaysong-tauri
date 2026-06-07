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

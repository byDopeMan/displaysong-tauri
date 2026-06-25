// ============================================================================
// PYTHON SCRIPT RUNNER - Execute Python scripts from plugins
// ============================================================================

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use log::{info, warn};
use serde::{Deserialize, Serialize};

/// Python process manager
#[allow(dead_code)] // Fields used by daemon methods (future use)
pub struct PythonRunner {
    python_path: Option<PathBuf>,
    processes: Arc<Mutex<Vec<std::process::Child>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

impl PythonRunner {
    pub fn new() -> Self {
        let python_path = Self::find_python();
        
        if let Some(ref path) = python_path {
            info!("Python found: {:?}", path);
        } else {
            warn!("Python not found - Python plugins will be disabled");
        }
        
        Self {
            python_path,
            processes: Arc::new(Mutex::new(Vec::new())),
        }
    }
    
    /// Find Python executable (embedded or system)
    fn find_python() -> Option<PathBuf> {
        // 1. Check embedded Python in install directory. Two layouts:
        //    - <install>/python/python.exe         (legacy custom installer)
        //    - <install>/nsis/python/python.exe    (Tauri installer bundled resource)
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(install_dir) = exe_path.parent() {
                for rel in [
                    install_dir.join("python").join("python.exe"),
                    install_dir.join("nsis").join("python").join("python.exe"),
                ] {
                    if rel.exists() {
                        return Some(rel);
                    }
                }
            }
        }
        
        // 2. Check system Python
        let candidates = ["python", "python3", "py"];
        for cmd in candidates {
            if let Ok(output) = Command::new(cmd)
                .arg("--version")
                .output()
            {
                if output.status.success() {
                    return Some(PathBuf::from(cmd));
                }
            }
        }
        
        None
    }
    
    /// Check if Python is available
    pub fn is_available(&self) -> bool {
        self.python_path.is_some()
    }
    
    /// Get Python version
    pub fn get_version(&self) -> Option<String> {
        let python = self.python_path.as_ref()?;
        
        let output = Command::new(python)
            .arg("--version")
            .output()
            .ok()?;
        
        String::from_utf8(output.stdout)
            .or_else(|_| String::from_utf8(output.stderr))
            .ok()
            .map(|s| s.trim().to_string())
    }
    
    /// Run a Python script file
    pub async fn run_script(&self, script_path: &PathBuf, args: Vec<String>) -> PythonResult {
        let python = match &self.python_path {
            Some(p) => p,
            None => return PythonResult {
                success: false,
                stdout: String::new(),
                stderr: "Python not available".to_string(),
                exit_code: None,
            },
        };
        
        let output = Command::new(python)
            .arg(script_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
        
        match output {
            Ok(out) => PythonResult {
                success: out.status.success(),
                stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
                exit_code: out.status.code(),
            },
            Err(e) => PythonResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Failed to execute: {}", e),
                exit_code: None,
            },
        }
    }
    
    /// Run inline Python code
    pub async fn run_code(&self, code: &str) -> PythonResult {
        let python = match &self.python_path {
            Some(p) => p,
            None => return PythonResult {
                success: false,
                stdout: String::new(),
                stderr: "Python not available".to_string(),
                exit_code: None,
            },
        };
        
        let output = Command::new(python)
            .arg("-c")
            .arg(code)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
        
        match output {
            Ok(out) => PythonResult {
                success: out.status.success(),
                stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
                exit_code: out.status.code(),
            },
            Err(e) => PythonResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Failed to execute: {}", e),
                exit_code: None,
            },
        }
    }
    
    /// Run a long-running Python script (daemon)
    #[allow(dead_code)] // Future use for background Python processes
    pub async fn spawn_daemon(
        &self,
        script_path: &PathBuf,
        args: Vec<String>,
    ) -> Result<u32, String> {
        let python = self.python_path.as_ref()
            .ok_or("Python not available")?;
        
        let child = Command::new(python)
            .arg(script_path)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
        
        let pid = child.id();
        
        let mut processes = self.processes.lock().await;
        processes.push(child);
        
        info!("Python daemon spawned: PID {}", pid);
        Ok(pid)
    }
    
    /// Kill all spawned Python processes
    #[allow(dead_code)] // Future use for cleanup
    pub async fn kill_all(&self) {
        let mut processes = self.processes.lock().await;
        for mut child in processes.drain(..) {
            let _ = child.kill();
        }
        info!("All Python processes killed");
    }
    
    /// Install a Python package using pip
    pub async fn pip_install(&self, package: &str) -> PythonResult {
        let python = match &self.python_path {
            Some(p) => p,
            None => return PythonResult {
                success: false,
                stdout: String::new(),
                stderr: "Python not available".to_string(),
                exit_code: None,
            },
        };
        
        let output = Command::new(python)
            .args(["-m", "pip", "install", "--quiet", package])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
        
        match output {
            Ok(out) => PythonResult {
                success: out.status.success(),
                stdout: String::from_utf8_lossy(&out.stdout).to_string(),
                stderr: String::from_utf8_lossy(&out.stderr).to_string(),
                exit_code: out.status.code(),
            },
            Err(e) => PythonResult {
                success: false,
                stdout: String::new(),
                stderr: format!("pip install failed: {}", e),
                exit_code: None,
            },
        }
    }
    
    /// Check if a Python package is installed
    pub async fn is_package_installed(&self, package: &str) -> bool {
        let python = match &self.python_path {
            Some(p) => p,
            None => return false,
        };
        
        let output = Command::new(python)
            .args(["-c", &format!("import {}", package.split('[').next().unwrap_or(package))])
            .output();
        
        output.map(|o| o.status.success()).unwrap_or(false)
    }
}

impl Default for PythonRunner {
    fn default() -> Self {
        Self::new()
    }
}

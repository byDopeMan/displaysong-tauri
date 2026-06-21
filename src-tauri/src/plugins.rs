// ============================================================================
// PLUGIN SYSTEM - Core Module
// ============================================================================

mod types;
mod manager;
mod install;
mod storage;

pub use types::*;
pub use manager::*;
pub use install::*;
pub use storage::*;

/// Commands die für Plugins BLOCKIERT sind
pub const BLOCKED_COMMANDS: &[&str] = &[
    // Spotify Credentials - Niemals für Plugins
    "save_credentials",
    "check_credentials", 
    "disconnect_spotify",
    "get_auth_url",
    "start_auth_server",
    
    // System Commands
    "quit_app",
    "set_autostart",
    "remove_autostart_entry",
    
    // Plugin Management (keine Rekursion)
    "uninstall_plugin",
    "install_plugin_from_zip",
];

/// Prüft ob ein Command für Plugins erlaubt ist
pub fn is_command_allowed(command: &str) -> bool {
    !BLOCKED_COMMANDS.contains(&command)
}


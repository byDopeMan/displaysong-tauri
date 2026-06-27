// ============================================================================
// COMMANDS MODULE
// ============================================================================

pub mod widgets;
pub mod spotify;
pub mod settings;
pub mod i18n;
pub mod twitch;
pub mod queue;
pub mod python_cmd;
pub mod songlink;
pub mod windows_media;

// Re-export all commands for easy access
pub use widgets::*;
pub use spotify::*;
pub use settings::*;
// i18n commands are exported directly in main.rs
pub use twitch::*;
// Queue: commands are referenced directly via commands::queue:: in main.rs
pub use python_cmd::*;
pub use songlink::*;
pub use windows_media::*;

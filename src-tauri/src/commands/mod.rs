// ============================================================================
// COMMANDS MODULE
// ============================================================================

pub mod widgets;
pub mod spotify;
pub mod settings;

// Re-export all commands for easy access
pub use widgets::*;
pub use spotify::*;
pub use settings::*;

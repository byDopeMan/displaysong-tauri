//! Windows Media Session API Provider
//! 
//! Erkennt Musik von JEDEM Player: Spotify, YouTube, VLC, Browser, etc.
//! Keine API Keys oder Authentifizierung nötig!

use std::sync::Arc;
use tokio::sync::Mutex;
#[cfg(windows)]
use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
#[cfg(not(windows))]
use log::warn;

mod types;
pub use types::*;

#[cfg(windows)]
mod session;

/// Windows Media Session Manager
#[allow(dead_code)] // last_track used by get/set methods
pub struct WindowsMediaProvider {
    #[cfg(windows)]
    session_manager: Option<GlobalSystemMediaTransportControlsSessionManager>,
    last_track: Arc<Mutex<Option<MediaSessionTrack>>>,
}

impl WindowsMediaProvider {
    /// Create a new Windows Media Provider
    pub fn new() -> Self {
        Self {
            #[cfg(windows)]
            session_manager: Self::init_session_manager(),
            last_track: Arc::new(Mutex::new(None)),
        }
    }

    /// Get last cached track (for change detection)
    #[allow(dead_code)] // Public API for track change detection
    pub async fn get_last_track(&self) -> Option<MediaSessionTrack> {
        self.last_track.lock().await.clone()
    }

    /// Update last track cache
    #[allow(dead_code)] // Public API for track change detection
    pub async fn set_last_track(&self, track: Option<MediaSessionTrack>) {
        *self.last_track.lock().await = track;
    }

    /// Non-Windows stub
    #[cfg(not(windows))]
    pub async fn get_all_tracks(&self) -> Vec<MediaSessionTrack> {
        Vec::new()
    }

    /// Non-Windows stub
    #[cfg(not(windows))]
    pub async fn get_current_track(&self) -> Option<MediaSessionTrack> {
        warn!("[WindowsMedia] Not available on this platform");
        None
    }
}

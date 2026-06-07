// ============================================================================
// APP STATE
// ============================================================================

use std::sync::Arc;
use std::collections::HashMap;
use tauri::async_runtime::Mutex;
use tokio::sync::watch;
use crate::spotify;

pub struct AppState {
    pub spotify: Mutex<Option<spotify::SpotifyClient>>,
    pub current_track: Mutex<Option<spotify::TrackInfo>>,
    pub track_history: Mutex<Vec<spotify::TrackInfo>>,
    pub status: Mutex<AppStatus>,
    pub shutdown_tx: watch::Sender<bool>,
    pub history_length: Mutex<usize>,
    pub song_request_queue: Mutex<Vec<SongRequest>>,
    pub request_cooldowns: Mutex<HashMap<String, std::time::Instant>>,
}

pub const DEFAULT_HISTORY_SIZE: usize = 20;

#[derive(Default, serde::Serialize)]
pub struct AppStatus {
    pub spotify_connected: bool,
    pub is_polling: bool,
    pub last_error: Option<String>,
    #[serde(skip)]
    pub polling_interval: u64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SongRequest {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub spotify_uri: String,
    pub track_name: Option<String>,
    pub artist_name: Option<String>,
    pub timestamp: i64,
    pub source: String, // "command" or "points"
}

impl AppState {
    pub fn new() -> Arc<Self> {
        let (shutdown_tx, _) = watch::channel(false);
        
        Arc::new(Self {
            spotify: Mutex::new(None),
            current_track: Mutex::new(None),
            track_history: Mutex::new(Vec::new()),
            status: Mutex::new(AppStatus::default()),
            shutdown_tx,
            history_length: Mutex::new(DEFAULT_HISTORY_SIZE),
            song_request_queue: Mutex::new(Vec::new()),
            request_cooldowns: Mutex::new(HashMap::new()),
        })
    }
}

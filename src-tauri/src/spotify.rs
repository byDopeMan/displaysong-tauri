use serde::Deserialize;
use std::time::Instant;

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API_BASE: &str = "https://api.spotify.com/v1";
const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
// All scopes needed for the app
// - user-read-currently-playing: Read current track
// - user-read-playback-state: Read playback state
// - user-modify-playback-state: Add to queue, play tracks
// - playlist-modify-public: Create/modify public playlists
// - playlist-modify-private: Create/modify private playlists
const SCOPES: &str = "user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-modify-public playlist-modify-private";

// Required scopes for scope checking (used by check_scopes and external validation)
#[allow(dead_code)] // Public API for external scope validation
pub const REQUIRED_SCOPES: &[&str] = &[
    "user-read-currently-playing",
    "user-read-playback-state", 
    "user-modify-playback-state",
    "playlist-modify-public",
    "playlist-modify-private",
];

/// Get list of all required scopes (for external use)
#[allow(dead_code)] // Public API
pub fn get_required_scopes() -> Vec<&'static str> {
    REQUIRED_SCOPES.to_vec()
}

#[derive(Debug, Clone)]
pub struct SpotifyClient {
    client_id: String,
    client_secret: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expiry: Option<Instant>,
    http: reqwest::Client,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TrackInfo {
    pub track: String,
    pub artist: String,
    pub album: String,
    #[serde(rename = "albumCover")]
    pub album_cover: String,
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    #[serde(rename = "progressMs")]
    pub progress_ms: u64,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub color: Option<ColorInfo>,
    #[serde(rename = "trackId")]
    pub track_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ColorInfo {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct CurrentlyPlaying {
    is_playing: bool,
    progress_ms: Option<u64>,
    item: Option<TrackItem>,
}

#[derive(Deserialize)]
struct TrackItem {
    id: String,
    name: String,
    duration_ms: u64,
    artists: Vec<Artist>,
    album: Album,
}

#[derive(Deserialize)]
struct Artist {
    name: String,
}

#[derive(Deserialize)]
struct Album {
    name: String,
    images: Vec<Image>,
}

#[derive(Deserialize)]
struct Image {
    url: String,
    width: Option<u32>,
}

mod auth;
mod playback;
mod playlist;

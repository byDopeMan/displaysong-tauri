/// Track information from Windows Media Session
#[derive(Debug, Clone, serde::Serialize, Default)]
pub struct MediaSessionTrack {
    pub track: String,
    pub artist: String,
    pub album: String,
    #[serde(rename = "albumCover")]
    pub album_cover: Option<String>,  // Base64 encoded image
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    #[serde(rename = "progressMs")]
    pub progress_ms: u64,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub source: String,  // "Spotify", "Chrome", "Firefox", "VLC", etc.
    #[serde(rename = "trackId")]
    pub track_id: Option<String>,  // Only available for Spotify
}

/// Supported streaming platforms
#[derive(Debug, Clone, PartialEq)]
pub enum StreamingPlatform {
    Spotify,
    YouTube,
    YouTubeMusic,
    AppleMusic,
    SoundCloud,
    Deezer,
    Tidal,
    AmazonMusic,
    Pandora,
    Unknown,
}

/// Track info from Odesli
#[derive(Debug, Clone)]
#[allow(dead_code)] // Public API - fields may be used externally
pub struct OdesliTrackInfo {
    pub spotify_url: Option<String>,
    pub spotify_uri: Option<String>,
    pub track_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
}

/// All platform links for a track
#[derive(Debug, Clone, serde::Serialize)]
pub struct AllPlatformLinks {
    pub spotify: Option<String>,
    pub youtube: Option<String>,
    pub youtube_music: Option<String>,
    pub apple_music: Option<String>,
    pub soundcloud: Option<String>,
    pub deezer: Option<String>,
    pub tidal: Option<String>,
    pub amazon_music: Option<String>,
}

/// Unified resolution of a song request input (link / Spotify id) into BOTH a
/// Spotify version (if available) and a YouTube version, plus display metadata.
/// Lets the request flow accept YouTube-only songs instead of rejecting them.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ResolvedRequest {
    pub spotify_uri: Option<String>,
    pub track_id: Option<String>,
    pub youtube_url: Option<String>,
    pub youtube_video_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub thumbnail: Option<String>,
    pub platform: String,
    /// Whether the YouTube video can be played in an embedded player. Determined
    /// via oEmbed (401 = embedding disabled by the owner). Only meaningful for
    /// YouTube-only results; true/ignored when a Spotify version exists.
    pub embeddable: bool,
}

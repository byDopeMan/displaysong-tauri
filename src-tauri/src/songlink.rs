// ============================================================================
// SONGLINK / ODESLI API - Convert streaming links to Spotify
// ============================================================================

use log::{debug, info, warn};
use serde::Deserialize;

const ODESLI_API: &str = "https://api.song.link/v1-alpha.1/links";

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

/// Odesli API Response
#[derive(Debug, Deserialize)]
struct OdesliResponse {
    #[serde(rename = "linksByPlatform")]
    links_by_platform: Option<LinksByPlatform>,
    #[serde(rename = "entitiesByUniqueId")]
    entities_by_unique_id: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct LinksByPlatform {
    spotify: Option<PlatformLink>,
    youtube: Option<PlatformLink>,
    #[serde(rename = "youtubeMusic")]
    youtube_music: Option<PlatformLink>,
    #[serde(rename = "appleMusic")]
    apple_music: Option<PlatformLink>,
    soundcloud: Option<PlatformLink>,
    deezer: Option<PlatformLink>,
    tidal: Option<PlatformLink>,
    #[serde(rename = "amazonMusic")]
    amazon_music: Option<PlatformLink>,
}

#[derive(Debug, Deserialize)]
struct PlatformLink {
    url: String,
    #[serde(rename = "entityUniqueId")]
    entity_unique_id: Option<String>,
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

/// Detect which platform a URL belongs to
pub fn detect_platform(url: &str) -> StreamingPlatform {
    let url_lower = url.to_lowercase();
    
    if url_lower.contains("spotify.com") || url_lower.starts_with("spotify:") {
        StreamingPlatform::Spotify
    } else if url_lower.contains("music.youtube.com") {
        StreamingPlatform::YouTubeMusic
    } else if url_lower.contains("youtube.com") || url_lower.contains("youtu.be") {
        StreamingPlatform::YouTube
    } else if url_lower.contains("music.apple.com") || url_lower.contains("itunes.apple.com") {
        StreamingPlatform::AppleMusic
    } else if url_lower.contains("soundcloud.com") {
        StreamingPlatform::SoundCloud
    } else if url_lower.contains("deezer.com") || url_lower.contains("deezer.page.link") {
        StreamingPlatform::Deezer
    } else if url_lower.contains("tidal.com") {
        StreamingPlatform::Tidal
    } else if url_lower.contains("amazon.com/music") || url_lower.contains("music.amazon") {
        StreamingPlatform::AmazonMusic
    } else if url_lower.contains("pandora.com") {
        StreamingPlatform::Pandora
    } else {
        StreamingPlatform::Unknown
    }
}

/// Check if a string looks like a URL
pub fn is_url(input: &str) -> bool {
    input.starts_with("http://") || 
    input.starts_with("https://") || 
    input.starts_with("spotify:") ||
    input.contains(".com/") ||
    input.contains(".be/")
}

/// Check if input is a Spotify link/URI
pub fn is_spotify_input(input: &str) -> bool {
    input.starts_with("spotify:track:") ||
    input.contains("spotify.com/track/") ||
    input.contains("spotify.com/intl-")
}

/// Extract Spotify track ID from various Spotify URL formats
pub fn extract_spotify_track_id(input: &str) -> Option<String> {
    // spotify:track:ID format
    if input.starts_with("spotify:track:") {
        return Some(input.replace("spotify:track:", "").split('?').next()?.to_string());
    }
    
    // https://open.spotify.com/track/ID or /intl-xx/track/ID
    if input.contains("spotify.com") {
        // Match track/ID pattern
        let re = regex_lite::Regex::new(r"track/([a-zA-Z0-9]{22})").ok()?;
        if let Some(caps) = re.captures(input) {
            return caps.get(1).map(|m| m.as_str().to_string());
        }
    }
    
    // Raw 22-character ID
    if input.len() == 22 && input.chars().all(|c| c.is_alphanumeric()) {
        return Some(input.to_string());
    }
    
    None
}

/// Convert any streaming link to Spotify using Odesli API
pub async fn convert_to_spotify(url: &str) -> Result<OdesliTrackInfo, String> {
    let platform = detect_platform(url);
    
    // If already Spotify, just extract the track ID
    if platform == StreamingPlatform::Spotify {
        if let Some(track_id) = extract_spotify_track_id(url) {
            return Ok(OdesliTrackInfo {
                spotify_url: Some(format!("https://open.spotify.com/track/{}", track_id)),
                spotify_uri: Some(format!("spotify:track:{}", track_id)),
                track_id: Some(track_id),
                title: None,
                artist: None,
            });
        }
    }
    
    info!("Converting {} link to Spotify via Odesli: {}", format!("{:?}", platform), url);
    
    let client = reqwest::Client::new();
    
    let response = client.get(ODESLI_API)
        .query(&[("url", url)])
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Odesli request failed: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error = response.text().await.unwrap_or_default();
        warn!("Odesli API error: {} - {}", status, error);
        return Err(format!("Song nicht auf Spotify gefunden (Odesli: {})", status));
    }
    
    let data: OdesliResponse = response.json().await
        .map_err(|e| format!("Failed to parse Odesli response: {}", e))?;
    
    // Extract Spotify link
    let spotify = data.links_by_platform
        .and_then(|l| l.spotify)
        .ok_or("Song nicht auf Spotify verfügbar")?;
    
    let track_id = extract_spotify_track_id(&spotify.url);
    let spotify_uri = track_id.as_ref().map(|id| format!("spotify:track:{}", id));
    
    // Try to get track info from entities
    let (title, artist) = extract_track_info_from_entities(&data.entities_by_unique_id, &spotify.entity_unique_id);
    
    debug!("Odesli conversion successful: {:?} -> {:?}", url, spotify_uri);
    
    Ok(OdesliTrackInfo {
        spotify_url: Some(spotify.url),
        spotify_uri,
        track_id,
        title,
        artist,
    })
}

/// Extract track info from Odesli entities
fn extract_track_info_from_entities(
    entities: &Option<serde_json::Value>, 
    entity_id: &Option<String>
) -> (Option<String>, Option<String>) {
    if let (Some(entities), Some(id)) = (entities, entity_id) {
        if let Some(entity) = entities.get(id) {
            let title = entity.get("title").and_then(|v| v.as_str()).map(String::from);
            let artist = entity.get("artistName").and_then(|v| v.as_str()).map(String::from);
            return (title, artist);
        }
    }
    (None, None)
}

/// Check if input is a supported streaming link (not Spotify)
pub fn is_convertible_link(input: &str) -> bool {
    if !is_url(input) {
        return false;
    }
    
    let platform = detect_platform(input);
    matches!(platform, 
        StreamingPlatform::YouTube |
        StreamingPlatform::YouTubeMusic |
        StreamingPlatform::AppleMusic |
        StreamingPlatform::SoundCloud |
        StreamingPlatform::Deezer |
        StreamingPlatform::Tidal |
        StreamingPlatform::AmazonMusic |
        StreamingPlatform::Pandora
    )
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

/// Get links for all platforms from a song search query or existing link
pub async fn get_all_platform_links(query: &str) -> Result<AllPlatformLinks, String> {
    // If it's a Spotify track ID, construct the URL
    let search_url = if query.len() == 22 && query.chars().all(|c| c.is_alphanumeric()) {
        format!("https://open.spotify.com/track/{}", query)
    } else if query.starts_with("spotify:track:") {
        let id = query.replace("spotify:track:", "");
        format!("https://open.spotify.com/track/{}", id)
    } else if is_url(query) {
        query.to_string()
    } else {
        // Search query - use Spotify URL format
        return Err("Search queries not supported, need a URL or track ID".to_string());
    };
    
    info!("Getting all platform links for: {}", search_url);
    
    let client = reqwest::Client::new();
    
    let response = client.get(ODESLI_API)
        .query(&[("url", &search_url)])
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Odesli request failed: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("Odesli API error: {}", status));
    }
    
    let data: OdesliResponse = response.json().await
        .map_err(|e| format!("Failed to parse Odesli response: {}", e))?;
    
    let links = data.links_by_platform.unwrap_or(LinksByPlatform {
        spotify: None,
        youtube: None,
        youtube_music: None,
        apple_music: None,
        soundcloud: None,
        deezer: None,
        tidal: None,
        amazon_music: None,
    });
    
    Ok(AllPlatformLinks {
        spotify: links.spotify.map(|l| l.url),
        youtube: links.youtube.map(|l| l.url),
        youtube_music: links.youtube_music.map(|l| l.url),
        apple_music: links.apple_music.map(|l| l.url),
        soundcloud: links.soundcloud.map(|l| l.url),
        deezer: links.deezer.map(|l| l.url),
        tidal: links.tidal.map(|l| l.url),
        amazon_music: links.amazon_music.map(|l| l.url),
    })
}

/// Extract the YouTube video id from a watch/share/embed URL.
pub fn extract_youtube_video_id(url: &str) -> Option<String> {
    // youtube.com/watch?v=ID
    if let Some(re) = regex_lite::Regex::new(r"[?&]v=([^&]+)").ok() {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    // youtu.be/ID
    if let Some(re) = regex_lite::Regex::new(r"youtu\.be/([^?&/]+)").ok() {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    // youtube.com/embed/ID
    if let Some(re) = regex_lite::Regex::new(r"embed/([^?&/]+)").ok() {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    None
}

/// Extract (title, artist, thumbnail) for a given Odesli entity id.
fn extract_entity_meta(
    entities: &Option<serde_json::Value>,
    entity_id: &Option<String>,
) -> (Option<String>, Option<String>, Option<String>) {
    if let (Some(entities), Some(id)) = (entities, entity_id) {
        if let Some(entity) = entities.get(id) {
            let title = entity.get("title").and_then(|v| v.as_str()).map(String::from);
            let artist = entity.get("artistName").and_then(|v| v.as_str()).map(String::from);
            let thumb = entity.get("thumbnailUrl").and_then(|v| v.as_str()).map(String::from);
            return (title, artist, thumb);
        }
    }
    (None, None, None)
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
}

/// Best-effort YouTube metadata via the public oEmbed endpoint (no API key).
/// Returns (title, author/channel). Used as a fallback when Odesli can't
/// resolve the video.
async fn youtube_oembed(video_id: &str) -> (Option<String>, Option<String>) {
    let watch = format!("https://www.youtube.com/watch?v={}", video_id);
    let client = reqwest::Client::new();
    let resp = client.get("https://www.youtube.com/oembed")
        .query(&[("format", "json"), ("url", watch.as_str())])
        .timeout(std::time::Duration::from_secs(6))
        .send()
        .await;
    if let Ok(r) = resp {
        if r.status().is_success() {
            if let Ok(v) = r.json::<serde_json::Value>().await {
                let title = v.get("title").and_then(|x| x.as_str()).map(String::from);
                let author = v.get("author_name").and_then(|x| x.as_str()).map(String::from);
                return (title, author);
            }
        }
    }
    (None, None)
}

/// Build a YouTube-only result (no Spotify match) from a known video id.
fn youtube_only_result(
    video_id: &str,
    platform: &str,
    title: Option<String>,
    artist: Option<String>,
) -> ResolvedRequest {
    ResolvedRequest {
        spotify_uri: None,
        track_id: None,
        youtube_url: Some(format!("https://www.youtube.com/watch?v={}", video_id)),
        youtube_video_id: Some(video_id.to_string()),
        title,
        artist,
        thumbnail: Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id)),
        platform: platform.to_string(),
    }
}

pub async fn resolve_request(input: &str) -> Result<ResolvedRequest, String> {
    let platform = detect_platform(input);
    let platform_str = format!("{:?}", platform);

    // For YouTube links, work from the bare video id: build a clean watch URL for
    // Odesli (playlist/index params like &list=LL make Odesli return 400) and keep
    // the id so we can still accept the song if Odesli can't resolve it.
    let input_yt_id = if matches!(platform, StreamingPlatform::YouTube | StreamingPlatform::YouTubeMusic) {
        extract_youtube_video_id(input)
    } else {
        None
    };

    // Build the URL Odesli should look up.
    let lookup_url = if let Some(ref vid) = input_yt_id {
        format!("https://www.youtube.com/watch?v={}", vid)
    } else if is_spotify_input(input) {
        match extract_spotify_track_id(input) {
            Some(id) => format!("https://open.spotify.com/track/{}", id),
            None => input.to_string(),
        }
    } else if input.len() == 22 && input.chars().all(|c| c.is_alphanumeric()) {
        format!("https://open.spotify.com/track/{}", input)
    } else if is_url(input) {
        input.to_string()
    } else {
        return Err("Kein unterstützter Link".to_string());
    };

    let client = reqwest::Client::new();
    let send_result = client.get(ODESLI_API)
        .query(&[("url", &lookup_url)])
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    // If Odesli is unreachable or unhappy but we know it's a YouTube video,
    // accept it anyway (metadata via oEmbed, thumbnail from the video id).
    let response = match send_result {
        Ok(r) if r.status().is_success() => r,
        other => {
            if let Some(ref vid) = input_yt_id {
                let (t, a) = youtube_oembed(vid).await;
                return Ok(youtube_only_result(vid, &platform_str, t, a));
            }
            return Err(match other {
                Ok(r) => format!("Odesli API error: {}", r.status()),
                Err(e) => format!("Odesli request failed: {}", e),
            });
        }
    };

    let data: OdesliResponse = match response.json().await {
        Ok(d) => d,
        Err(e) => {
            if let Some(ref vid) = input_yt_id {
                let (t, a) = youtube_oembed(vid).await;
                return Ok(youtube_only_result(vid, &platform_str, t, a));
            }
            return Err(format!("Failed to parse Odesli response: {}", e));
        }
    };

    let entities = data.entities_by_unique_id;
    let links = data.links_by_platform;

    let spotify_link = links.as_ref().and_then(|l| l.spotify.as_ref());
    // Prefer plain YouTube, fall back to YouTube Music.
    let youtube_link = links.as_ref()
        .and_then(|l| l.youtube.as_ref().or(l.youtube_music.as_ref()));

    let track_id = spotify_link.and_then(|l| extract_spotify_track_id(&l.url));
    let spotify_uri = track_id.as_ref().map(|id| format!("spotify:track:{}", id));
    let youtube_url = youtube_link.map(|l| l.url.clone())
        .or_else(|| input_yt_id.as_ref().map(|v| format!("https://www.youtube.com/watch?v={}", v)));
    let youtube_video_id = youtube_url.as_deref().and_then(extract_youtube_video_id)
        .or_else(|| input_yt_id.clone());

    // Display metadata: prefer the Spotify entity, fall back to the YouTube one.
    let (mut title, mut artist, mut thumbnail) =
        extract_entity_meta(&entities, &spotify_link.and_then(|l| l.entity_unique_id.clone()));
    if title.is_none() || artist.is_none() {
        let (yt_t, yt_a, yt_th) =
            extract_entity_meta(&entities, &youtube_link.and_then(|l| l.entity_unique_id.clone()));
        title = title.or(yt_t);
        artist = artist.or(yt_a);
        thumbnail = thumbnail.or(yt_th);
    }
    // Last resort thumbnail: derive from the YouTube video id.
    if thumbnail.is_none() {
        if let Some(vid) = &youtube_video_id {
            thumbnail = Some(format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", vid));
        }
    }

    Ok(ResolvedRequest {
        spotify_uri,
        track_id,
        youtube_url,
        youtube_video_id,
        title,
        artist,
        thumbnail,
        platform: platform_str,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_platform() {
        assert_eq!(detect_platform("https://open.spotify.com/track/abc123"), StreamingPlatform::Spotify);
        assert_eq!(detect_platform("spotify:track:abc123"), StreamingPlatform::Spotify);
        assert_eq!(detect_platform("https://www.youtube.com/watch?v=abc"), StreamingPlatform::YouTube);
        assert_eq!(detect_platform("https://youtu.be/abc"), StreamingPlatform::YouTube);
        assert_eq!(detect_platform("https://music.youtube.com/watch?v=abc"), StreamingPlatform::YouTubeMusic);
        assert_eq!(detect_platform("https://music.apple.com/us/album/song"), StreamingPlatform::AppleMusic);
        assert_eq!(detect_platform("https://soundcloud.com/artist/track"), StreamingPlatform::SoundCloud);
        assert_eq!(detect_platform("https://www.deezer.com/track/123"), StreamingPlatform::Deezer);
        assert_eq!(detect_platform("https://tidal.com/track/123"), StreamingPlatform::Tidal);
    }
    
    #[test]
    fn test_extract_spotify_track_id() {
        assert_eq!(extract_spotify_track_id("spotify:track:6rqhFgbbKwnb9MLmUQDhG6"), Some("6rqhFgbbKwnb9MLmUQDhG6".to_string()));
        assert_eq!(extract_spotify_track_id("https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6"), Some("6rqhFgbbKwnb9MLmUQDhG6".to_string()));
        assert_eq!(extract_spotify_track_id("https://open.spotify.com/intl-de/track/6rqhFgbbKwnb9MLmUQDhG6?si=abc"), Some("6rqhFgbbKwnb9MLmUQDhG6".to_string()));
        assert_eq!(extract_spotify_track_id("6rqhFgbbKwnb9MLmUQDhG6"), Some("6rqhFgbbKwnb9MLmUQDhG6".to_string()));
    }
    
    #[test]
    fn test_is_convertible_link() {
        assert!(is_convertible_link("https://www.youtube.com/watch?v=abc"));
        assert!(is_convertible_link("https://music.apple.com/us/album/song"));
        assert!(!is_convertible_link("https://open.spotify.com/track/abc"));
        assert!(!is_convertible_link("spotify:track:abc"));
        assert!(!is_convertible_link("not a url"));
    }
}

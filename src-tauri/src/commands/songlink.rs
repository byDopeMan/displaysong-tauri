// ============================================================================
// SONGLINK COMMANDS - Convert streaming links to Spotify
// ============================================================================

use serde::Serialize;
use crate::songlink;

/// Result of link conversion
#[derive(Debug, Clone, Serialize)]
pub struct ConvertLinkResult {
    pub success: bool,
    pub spotify_uri: Option<String>,
    pub track_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub error: Option<String>,
    pub platform: String,
}

/// Convert any streaming link to Spotify
#[tauri::command]
pub async fn convert_link_to_spotify(url: String) -> ConvertLinkResult {
    let platform = songlink::detect_platform(&url);
    let platform_str = format!("{:?}", platform);
    
    // Check if it's already a Spotify link
    if songlink::is_spotify_input(&url) {
        if let Some(track_id) = songlink::extract_spotify_track_id(&url) {
            return ConvertLinkResult {
                success: true,
                spotify_uri: Some(format!("spotify:track:{}", track_id)),
                track_id: Some(track_id),
                title: None,
                artist: None,
                error: None,
                platform: platform_str,
            };
        }
    }
    
    // Check if it's a convertible link
    if !songlink::is_convertible_link(&url) && !songlink::is_spotify_input(&url) {
        // Might be a search query or raw track ID
        if url.len() == 22 && url.chars().all(|c| c.is_alphanumeric()) {
            // Looks like a raw Spotify track ID
            return ConvertLinkResult {
                success: true,
                spotify_uri: Some(format!("spotify:track:{}", url)),
                track_id: Some(url),
                title: None,
                artist: None,
                error: None,
                platform: "Spotify".to_string(),
            };
        }
        
        return ConvertLinkResult {
            success: false,
            spotify_uri: None,
            track_id: None,
            title: None,
            artist: None,
            error: Some("Kein unterstützter Streaming-Link".to_string()),
            platform: platform_str,
        };
    }
    
    // Convert via Odesli API
    match songlink::convert_to_spotify(&url).await {
        Ok(info) => ConvertLinkResult {
            success: info.spotify_uri.is_some(),
            spotify_uri: info.spotify_uri,
            track_id: info.track_id,
            title: info.title,
            artist: info.artist,
            error: None,
            platform: platform_str,
        },
        Err(e) => ConvertLinkResult {
            success: false,
            spotify_uri: None,
            track_id: None,
            title: None,
            artist: None,
            error: Some(e),
            platform: platform_str,
        },
    }
}

/// Check if a URL is a supported streaming link
#[tauri::command]
pub fn is_streaming_link(url: String) -> bool {
    songlink::is_url(&url) && (
        songlink::is_spotify_input(&url) || 
        songlink::is_convertible_link(&url)
    )
}

/// Get platform name for a URL
#[tauri::command]
pub fn get_link_platform(url: String) -> String {
    format!("{:?}", songlink::detect_platform(&url))
}

/// Get links for all streaming platforms
#[tauri::command]
pub async fn get_all_streaming_links(query: String) -> Result<songlink::AllPlatformLinks, String> {
    songlink::get_all_platform_links(&query).await
}

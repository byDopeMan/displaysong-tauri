use super::*;

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

/// Extract the YouTube video id from a watch/share/embed URL.
pub fn extract_youtube_video_id(url: &str) -> Option<String> {
    // youtube.com/watch?v=ID
    if let Ok(re) = regex_lite::Regex::new(r"[?&]v=([^&]+)") {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    // youtu.be/ID
    if let Ok(re) = regex_lite::Regex::new(r"youtu\.be/([^?&/]+)") {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    // youtube.com/embed/ID
    if let Ok(re) = regex_lite::Regex::new(r"embed/([^?&/]+)") {
        if let Some(c) = re.captures(url) {
            return c.get(1).map(|m| m.as_str().to_string());
        }
    }
    None
}

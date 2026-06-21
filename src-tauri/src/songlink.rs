// ============================================================================
// SONGLINK / ODESLI API - Convert streaming links to Spotify
// ============================================================================

const ODESLI_API: &str = "https://api.song.link/v1-alpha.1/links";

mod types;
mod detect;
mod odesli;

pub use types::*;
pub use detect::*;
pub use odesli::*;

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

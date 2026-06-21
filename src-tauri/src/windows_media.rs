//! Windows Media Session API Provider
//! 
//! Erkennt Musik von JEDEM Player: Spotify, YouTube, VLC, Browser, etc.
//! Keine API Keys oder Authentifizierung nötig!

use log::{debug, info, warn};
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg(windows)]
use windows::{
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    },
    Storage::Streams::{DataReader, IRandomAccessStreamReference},
};

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

    #[cfg(windows)]
    fn init_session_manager() -> Option<GlobalSystemMediaTransportControlsSessionManager> {
        match GlobalSystemMediaTransportControlsSessionManager::RequestAsync() {
            Ok(operation) => {
                match operation.get() {
                    Ok(manager) => {
                        info!("[WindowsMedia] Session manager initialized");
                        Some(manager)
                    }
                    Err(e) => {
                        warn!("[WindowsMedia] Failed to get session manager: {:?}", e);
                        None
                    }
                }
            }
            Err(e) => {
                warn!("[WindowsMedia] Failed to request session manager: {:?}", e);
                None
            }
        }
    }

    /// Get currently playing track from any media player.
    /// Single-session fallback; the command path uses `get_all_tracks` for priority.
    #[cfg(windows)]
    #[allow(dead_code)]
    pub async fn get_current_track(&self) -> Option<MediaSessionTrack> {
        let manager = self.session_manager.as_ref()?;

        // Get current session (the one that's playing or was last active)
        let session = match manager.GetCurrentSession() {
            Ok(s) => s,
            Err(_) => return None,
        };

        self.get_track_from_session(&session).await
    }

    /// Get a valid music track from EVERY active media session.
    ///
    /// `GetCurrentSession()` only returns the single OS-designated session, which
    /// is why source priority never worked. Enumerating all sessions lets the
    /// caller pick the highest-priority source.
    #[cfg(windows)]
    pub async fn get_all_tracks(&self) -> Vec<MediaSessionTrack> {
        let mut out = Vec::new();

        let manager = match self.session_manager.as_ref() {
            Some(m) => m,
            None => return out,
        };

        // Collect sessions in a synchronous helper so the !Send `IVectorView`
        // never becomes part of this async fn's state machine. The sessions
        // themselves are agile and safe to hold across `.await`.
        for session in Self::collect_sessions(manager) {
            if let Some(track) = self.get_track_from_session(&session).await {
                out.push(track);
            }
        }

        out
    }

    /// Snapshot all current sessions into an owned Vec (synchronous on purpose).
    #[cfg(windows)]
    fn collect_sessions(
        manager: &GlobalSystemMediaTransportControlsSessionManager,
    ) -> Vec<GlobalSystemMediaTransportControlsSession> {
        let mut list = Vec::new();
        match manager.GetSessions() {
            Ok(sessions) => {
                let size = sessions.Size().unwrap_or(0);
                list.reserve(size as usize);
                for i in 0..size {
                    if let Ok(session) = sessions.GetAt(i) {
                        list.push(session);
                    }
                }
            }
            Err(e) => debug!("[WindowsMedia] GetSessions failed: {:?}", e),
        }
        list
    }

    /// Non-Windows stub
    #[cfg(not(windows))]
    pub async fn get_all_tracks(&self) -> Vec<MediaSessionTrack> {
        Vec::new()
    }

    #[cfg(windows)]
    async fn get_track_from_session(&self, session: &GlobalSystemMediaTransportControlsSession) -> Option<MediaSessionTrack> {
        // Get source app name
        let source = session.SourceAppUserModelId()
            .ok()
            .map(|s| s.to_string())
            .map(|s| Self::clean_app_name(&s))
            .unwrap_or_else(|| "Unknown".to_string());

        // Get playback info
        let playback_info = session.GetPlaybackInfo().ok()?;
        let playback_status = playback_info.PlaybackStatus().ok()?;
        
        let is_playing = playback_status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;

        // Get media properties
        let media_props_async = session.TryGetMediaPropertiesAsync().ok()?;
        let media_props = media_props_async.get().ok()?;

        let track = media_props.Title()
            .ok()
            .map(|s| s.to_string())
            .unwrap_or_default();
        
        let artist = media_props.Artist()
            .ok()
            .map(|s| s.to_string())
            .unwrap_or_default();
        
        let album = media_props.AlbumTitle()
            .ok()
            .map(|s| s.to_string())
            .unwrap_or_default();

        // Skip if no track info
        if track.is_empty() && artist.is_empty() {
            return None;
        }
        
        // NOTE: We now return paused tracks too!
        // The frontend will handle showing paused state
        // We only skip non-music content if it's actually playing
        
        // Skip Twitch streams, URLs, and non-music content (both playing and paused)
        let track_lower = track.to_lowercase();
        let artist_lower = artist.to_lowercase();
        let album_lower = album.to_lowercase();
        let source_lower = source.to_lowercase();
        
        // AGGRESSIVE TWITCH CHECK - If "twitch" appears ANYWHERE, skip immediately
        let has_twitch = track_lower.contains("twitch")
            || artist_lower.contains("twitch")
            || album_lower.contains("twitch")
            || source_lower.contains("twitch");
        
        if has_twitch {
            debug!("[WindowsMedia] Skipping Twitch: {} - {} [{}] ({})", artist, track, album, source);
            return None;
        }
        
        // Skip common Twitch patterns even without "twitch" keyword
        // - Browser source + no album + live/streaming indicators
        let is_browser = source_lower.contains("chrome")
            || source_lower.contains("firefox")
            || source_lower.contains("edge")
            || source_lower.contains("opera")
            || source_lower.contains("brave");
        
        if is_browser {
            // Common Twitch categories in album field
            let is_twitch_category = album_lower.contains("just chatting")
                || album_lower.contains("music")
                || album_lower.contains("gaming")
                || album_lower.contains("irl")
                || album_lower.contains("art")
                || album_lower.contains("asmr")
                || album_lower.contains("pools")
                || album_lower.contains("talk show");
            
            // Live stream indicators
            let has_live_indicator = track_lower.contains(" live")
                || track_lower.contains("[live]")
                || track_lower.contains("(live)")
                || track_lower.contains("streaming")
                || track_lower.contains("viewers")
                || artist_lower.contains("viewers");
            
            if is_twitch_category || has_live_indicator {
                debug!("[WindowsMedia] Skipping browser stream: {} - {} [{}] ({})", artist, track, album, source);
                return None;
            }
        }
        
        // Check for URLs in track/artist
        let is_url = track_lower.starts_with("http://")
            || track_lower.starts_with("https://")
            || track_lower.contains("www.")
            || artist_lower.starts_with("http://")
            || artist_lower.starts_with("https://");
        
        if is_url {
            debug!("[WindowsMedia] Skipping URL: {} - {}", artist, track);
            return None;
        }

        // Get timeline (progress/duration)
        let timeline = session.GetTimelineProperties().ok();
        let (mut progress_ms, duration_ms) = if let Some(ref tl) = timeline {
            let position = tl.Position().ok()
                .map(|d| d.Duration as u64 / 10_000) // 100-nanoseconds to ms
                .unwrap_or(0);
            let end = tl.EndTime().ok()
                .map(|d| d.Duration as u64 / 10_000)
                .unwrap_or(0);
            (position, end)
        } else {
            (0, 0)
        };

        // Robust live-stream guard: real music/video has a sane, finite duration.
        // Browser live streams (Twitch, etc.) instead report either no EndTime
        // (duration 0) or a sentinel "infinite" duration (~u64::MAX/10000), as
        // confirmed by diagnostics (Twitch reported dur_ms ≈ 1.84e15). Treat any
        // browser playback whose duration falls outside [1 ms, 24 h] as a live
        // stream and skip it — this also catches titles with no "twitch"/"live"
        // keyword (e.g. a channel title like "🤏 MR. GEIL STREAMT 🤏 ... zarbex").
        const MAX_REAL_DURATION_MS: u64 = 24 * 60 * 60 * 1000; // 24h
        if is_browser && (duration_ms == 0 || duration_ms > MAX_REAL_DURATION_MS) {
            debug!("[WindowsMedia] Skipping live browser stream (dur_ms={}): {} - {} ({})", duration_ms, artist, track, source);
            return None;
        }

        // The reported Position is usually frozen at the moment of the last
        // play/pause/seek, so the progress bar drifts out of sync (unlike the
        // Spotify API, which returns a live progress_ms). Advance it by the time
        // elapsed since LastUpdatedTime while playing to get an accurate position.
        if is_playing {
            if let Some(ref tl) = timeline {
                if let Ok(last_updated) = tl.LastUpdatedTime() {
                    let last_ticks = last_updated.UniversalTime; // 100ns ticks since 1601-01-01 UTC
                    if last_ticks > 0 {
                        let now_ticks = windows_now_ticks();
                        if now_ticks > last_ticks as u64 {
                            let elapsed_ms = (now_ticks - last_ticks as u64) / 10_000;
                            progress_ms = progress_ms.saturating_add(elapsed_ms);
                        }
                    }
                }
            }
        }
        if duration_ms > 0 && progress_ms > duration_ms {
            progress_ms = duration_ms;
        }

        // Try to get album art
        let album_cover = self.get_thumbnail(&media_props).await;

        // Extract Spotify track ID if source is Spotify
        let track_id = if source.to_lowercase().contains("spotify") {
            // Spotify doesn't expose track ID through Media Session
            // We could potentially match it later via search
            None
        } else {
            None
        };

        debug!("[WindowsMedia] Track: {} - {} ({})", artist, track, source);

        Some(MediaSessionTrack {
            track,
            artist,
            album,
            album_cover,
            is_playing,
            progress_ms,
            duration_ms,
            source,
            track_id,
        })
    }

    #[cfg(windows)]
    async fn get_thumbnail(&self, media_props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties) -> Option<String> {
        let thumbnail_ref: IRandomAccessStreamReference = media_props.Thumbnail().ok()?;
        let stream = thumbnail_ref.OpenReadAsync().ok()?.get().ok()?;
        
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 10_000_000 { // Max 10MB
            return None;
        }

        let reader = DataReader::CreateDataReader(&stream).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;

        let mut buffer = vec![0u8; size as usize];
        reader.ReadBytes(&mut buffer).ok()?;

        // Convert to base64 data URL
        let base64 = base64_encode(&buffer);
        
        // Try to detect image type from magic bytes
        let mime_type = if buffer.starts_with(&[0xFF, 0xD8, 0xFF]) {
            "image/jpeg"
        } else if buffer.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            "image/png"
        } else {
            "image/jpeg" // Default
        };

        Some(format!("data:{};base64,{}", mime_type, base64))
    }

    /// Clean up app name for display
    fn clean_app_name(app_id: &str) -> String {
        // Common app ID patterns to clean names
        let name = app_id
            .split('\\').next_back()
            .unwrap_or(app_id)
            .split('!').next()
            .unwrap_or(app_id)
            .replace(".exe", "")
            .replace("_", " ");

        let lower = name.to_lowercase();
        
        // Known app mappings
        if lower.contains("spotify") { return "Spotify".to_string(); }
        if lower.contains("chrome") { return "Chrome".to_string(); }
        if lower.contains("firefox") { return "Firefox".to_string(); }
        if lower.contains("msedge") || lower.contains("edge") { return "Edge".to_string(); }
        if lower.contains("opera") { return "Opera".to_string(); }
        if lower.contains("brave") { return "Brave".to_string(); }
        if lower.contains("vivaldi") { return "Vivaldi".to_string(); }
        if lower.contains("vlc") { return "VLC".to_string(); }
        if lower.contains("itunes") { return "iTunes".to_string(); }
        if lower.contains("musicbee") { return "MusicBee".to_string(); }
        if lower.contains("foobar") { return "foobar2000".to_string(); }
        if lower.contains("winamp") { return "Winamp".to_string(); }
        if lower.contains("groove") { return "Groove Music".to_string(); }
        if lower.contains("deezer") { return "Deezer".to_string(); }
        if lower.contains("tidal") { return "TIDAL".to_string(); }
        if lower.contains("amazon") { return "Amazon Music".to_string(); }
        if lower.contains("youtube") { return "YouTube".to_string(); }
        
        // For unknown apps, try to extract a readable name
        // Skip long IDs like "OperaSoftware.OperaGXWebBrowser.1670061414"
        if name.len() > 20 || name.contains('.') {
            // Try to extract first meaningful part
            let parts: Vec<&str> = name.split(['.', ' ']).collect();
            if let Some(first) = parts.first() {
                if first.len() > 2 {
                    return first.to_string();
                }
            }
        }
        
        // Capitalize first letter
        let mut chars = name.chars();
        match chars.next() {
            None => name,
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        }
    }

    /// Non-Windows stub
    #[cfg(not(windows))]
    pub async fn get_current_track(&self) -> Option<MediaSessionTrack> {
        warn!("[WindowsMedia] Not available on this platform");
        None
    }
}

/// Current time as 100-nanosecond ticks since 1601-01-01 UTC, matching the
/// epoch of WinRT's `Foundation::DateTime::UniversalTime` (used for LastUpdatedTime).
#[cfg(windows)]
fn windows_now_ticks() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    // Seconds between 1601-01-01 and 1970-01-01 (the Unix epoch).
    const EPOCH_DIFF_SECS: u64 = 11_644_473_600;
    let unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    (unix.as_secs() + EPOCH_DIFF_SECS) * 10_000_000 + (unix.subsec_nanos() as u64) / 100
}

/// Simple base64 encoder (avoid adding another dependency)
fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    let mut result = String::new();
    let chunks = data.chunks(3);
    
    for chunk in chunks {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        
        result.push(ALPHABET[b0 >> 2] as char);
        result.push(ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        
        if chunk.len() > 1 {
            result.push(ALPHABET[((b1 & 0x0F) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        
        if chunk.len() > 2 {
            result.push(ALPHABET[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }
    
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_app_name() {
        assert_eq!(WindowsMediaProvider::clean_app_name("Spotify.exe"), "Spotify");
        assert_eq!(WindowsMediaProvider::clean_app_name("chrome.exe"), "Chrome");
        assert_eq!(WindowsMediaProvider::clean_app_name("C:\\Program Files\\VLC\\vlc.exe"), "VLC");
    }
}

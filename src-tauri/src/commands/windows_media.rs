// ============================================================================
// WINDOWS MEDIA COMMANDS
// ============================================================================

use std::sync::Arc;
use tauri::{State, AppHandle, Manager};
use tokio::sync::Mutex;
use log::debug;

use crate::windows_media::{WindowsMediaProvider, MediaSessionTrack};
use crate::color;
// image crate used for color extraction from base64 images

/// Broadcast a now-playing track to ALL windows (incl. widgets) via emit_all —
/// the same path the Windows-media poll uses. The frontend's own event.emit does
/// not reliably reach other windows, so YouTube now-playing is pushed through
/// here while the poll is suppressed.
#[tauri::command]
pub fn push_track_update(track: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let _ = app.emit_all("track-update", &track);
    Ok(())
}

/// Simple base64 decoder
fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const DECODE_TABLE: [i8; 128] = [
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
        -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
        52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
        -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
        15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
        -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
        41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1,
    ];
    
    let mut result = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    
    for c in input.bytes() {
        if c == b'=' {
            break;
        }
        if c >= 128 {
            continue; // Skip non-ASCII
        }
        let val = DECODE_TABLE[c as usize];
        if val < 0 {
            continue; // Skip invalid chars
        }
        buffer = (buffer << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    
    Ok(result)
}

/// Shared state for Windows Media Provider
pub struct WindowsMediaState {
    pub provider: Arc<WindowsMediaProvider>,
    pub last_track_key: Arc<Mutex<String>>,
}

impl WindowsMediaState {
    pub fn new() -> Self {
        Self {
            provider: Arc::new(WindowsMediaProvider::new()),
            last_track_key: Arc::new(Mutex::new(String::new())),
        }
    }
}

/// Pick the best track from all active sessions, honoring the user's source
/// priority order. Sources earlier in `priority` win; an unranked source loses
/// to any ranked one. Ties break toward a playing session, then session order.
fn select_by_priority(
    tracks: Vec<MediaSessionTrack>,
    priority: &[String],
) -> Option<MediaSessionTrack> {
    let pri: Vec<String> = priority.iter().map(|p| p.to_lowercase()).collect();
    let rank = |source: &str| -> usize {
        let s = source.to_lowercase();
        pri.iter().position(|p| *p == s).unwrap_or(usize::MAX)
    };

    tracks
        .into_iter()
        .enumerate()
        .min_by(|(ia, a), (ib, b)| {
            rank(&a.source)
                .cmp(&rank(&b.source))
                // playing (true) should come before paused (false)
                .then(b.is_playing.cmp(&a.is_playing))
                .then(ia.cmp(ib))
        })
        .map(|(_, t)| t)
}

/// Get current track from Windows Media Session
/// Also broadcasts track-update event to all windows (including widgets)
#[tauri::command]
pub async fn get_windows_media_track(
    app: AppHandle,
    state: State<'_, Arc<WindowsMediaState>>,
    priority: Option<Vec<String>>,
) -> Result<Option<MediaSessionTrack>, String> {
    let tracks = state.provider.get_all_tracks().await;
    let track = select_by_priority(tracks, &priority.unwrap_or_default());
    
    if let Some(ref t) = track {
        debug!("[WindowsMedia] Current: {} - {}", t.artist, t.track);
        
        // Check if track changed
        let track_key = format!("{}-{}", t.artist, t.track);
        let mut last_key = state.last_track_key.lock().await;
        let is_new = *last_key != track_key;
        
        if is_new {
            *last_key = track_key;
            drop(last_key);
            
            // Emit track-changed event
            let _ = app.emit_all("track-changed", &t);
        } else {
            drop(last_key);
        }
        
        // Get album cover string (empty if None)
        let album_cover_str = t.album_cover.clone().unwrap_or_default();
        
        // Build track info with color for widgets
        let mut track_info = serde_json::json!({
            "track": t.track,
            "artist": t.artist,
            "album": t.album,
            "albumCover": album_cover_str,
            "album_cover": album_cover_str,
            "isPlaying": t.is_playing,
            "progressMs": t.progress_ms,
            "durationMs": t.duration_ms,
            "source": t.source,
            "trackId": t.track_id
        });
        
        // Extract color from album cover if available (base64 data URLs supported)
        if !album_cover_str.is_empty() {
            // For base64 data URLs, extract color from the image data
            if album_cover_str.starts_with("data:image") {
                // Extract base64 data after the comma
                if let Some(base64_start) = album_cover_str.find(",") {
                    let base64_data = &album_cover_str[base64_start + 1..];
                    // Decode and extract color
                    if let Ok(img_bytes) = base64_decode(base64_data) {
                        if let Ok(img) = image::load_from_memory(&img_bytes) {
                            let resized = img.resize_exact(1, 1, image::imageops::FilterType::Lanczos3).to_rgb8();
                            let rgb = resized.get_pixel(0, 0);
                            track_info["color"] = serde_json::json!({
                                "r": rgb[0],
                                "g": rgb[1],
                                "b": rgb[2]
                            });
                        }
                    }
                }
            } else {
                // URL-based cover - use color extraction
                if let Ok(color_result) = color::extract_from_url(&album_cover_str).await {
                    track_info["color"] = serde_json::json!({
                        "r": color_result.r,
                        "g": color_result.g,
                        "b": color_result.b
                    });
                }
            }
        }
        
        // Broadcast to all windows (widgets will receive this)
        let _ = app.emit_all("track-update", &track_info);
    } else {
        // No track playing - emit null
        let _ = app.emit_all("track-update", &serde_json::Value::Null);
    }
    
    Ok(track)
}

/// Check if Windows Media Session is available
#[tauri::command]
pub async fn is_windows_media_available() -> Result<bool, String> {
    // On Windows, always available
    #[cfg(windows)]
    {
        Ok(true)
    }
    
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

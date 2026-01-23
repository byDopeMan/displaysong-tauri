// ============================================================================
// SPOTIFY POLLING
// ============================================================================

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use log::{info, warn, error, debug};

use crate::state::AppState;
use crate::spotify;
use crate::credentials;
use crate::color;

pub async fn start_polling(app: AppHandle, state: Arc<AppState>) {
    let mut shutdown_rx = state.shutdown_tx.subscribe();
    let mut backoff_until: Option<tokio::time::Instant> = None;
    
    state.status.lock().await.polling_interval = 2000;
    state.status.lock().await.is_polling = true;
    info!("Polling gestartet");
    
    loop {
        let interval = state.status.lock().await.polling_interval;
        
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    info!("Polling gestoppt");
                    state.status.lock().await.is_polling = false;
                    return;
                }
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(interval)) => {
                if let Some(until) = backoff_until {
                    if tokio::time::Instant::now() < until {
                        continue;
                    }
                    backoff_until = None;
                }
                
                match poll_track(&app, &state).await {
                    Ok(_) => {}
                    Err(e) if e.contains("Rate-Limit") => {
                        backoff_until = Some(tokio::time::Instant::now() + tokio::time::Duration::from_secs(30));
                        warn!("Rate limited, backing off for 30s");
                    }
                    Err(e) => {
                        debug!("Poll-Fehler: {}", e);
                        state.status.lock().await.last_error = Some(e);
                    }
                }
            }
        }
    }
}

async fn poll_track(app: &AppHandle, state: &Arc<AppState>) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    
    let client = spotify.as_mut()
        .ok_or("Spotify nicht verbunden")?;
    
    client.refresh_if_needed().await
        .map_err(|e| format!("Token refresh failed: {}", e))?;
    
    if let Some((access, refresh)) = client.get_tokens() {
        let _ = credentials::save_tokens(&access, &refresh);
    }
    
    let track = match client.get_currently_playing().await {
        Ok(t) => t,
        Err(e) if e.contains("401") => {
            info!("Got 401, forcing token refresh...");
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.get_currently_playing().await?
        }
        Err(e) if e.contains("429") => {
            warn!("Rate limited by Spotify, waiting...");
            return Err("Spotify Rate-Limit erreicht - bitte warten".to_string());
        }
        Err(e) if e.contains("502") || e.contains("503") || e.contains("504") => {
            warn!("Spotify server error: {}", e);
            return Err("Spotify ist vorübergehend nicht erreichbar".to_string());
        }
        Err(e) if e.contains("Failed to connect") || e.contains("connection") => {
            warn!("Network error: {}", e);
            return Err("Keine Internetverbindung".to_string());
        }
        Err(e) if e.contains("No active device") || e.contains("204") => {
            debug!("No active playback");
            None
        }
        Err(e) => {
            error!("Spotify API error: {}", e);
            return Err(format!("Spotify-Fehler: {}", e));
        }
    };
    
    drop(spotify);
    
    // Track mit Farbe anreichern (nutzt Cache!)
    let track_with_color = if let Some(mut t) = track {
        if !t.album_cover.is_empty() {
            t.color = color::extract_from_url(&t.album_cover).await.ok();
        }
        Some(t)
    } else {
        None
    };
    
    if let Some(ref new_track) = track_with_color {
        let current = state.current_track.lock().await;
        let is_new = current.as_ref()
            .map(|c| c.track != new_track.track || c.artist != new_track.artist)
            .unwrap_or(true);
        drop(current);
        
        if is_new {
            let mut history = state.track_history.lock().await;
            history.retain(|t| t.track != new_track.track || t.artist != new_track.artist);
            history.insert(0, new_track.clone());
            let max_size = *state.history_length.lock().await;
            history.truncate(max_size);
        }
    }
    
    *state.current_track.lock().await = track_with_color.clone();
    app.emit_all("track-update", &track_with_color)
        .map_err(|e| e.to_string())?;
    
    state.status.lock().await.last_error = None;
    
    Ok(())
}

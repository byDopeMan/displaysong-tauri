use std::sync::Arc;
use tauri::State;
use log::info;
use crate::state::AppState;
use crate::spotify;
use crate::credentials;

#[tauri::command]
pub async fn add_to_queue(
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    // Token refreshen falls nötig
    client.refresh_if_needed().await?;

    // Zur Queue hinzufügen (bei 401 Token erzwingen und einmal wiederholen)
    if let Err(e) = client.add_to_queue(&uri).await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.add_to_queue(&uri).await?;
        } else {
            return Err(e);
        }
    }

    info!("Zur Queue hinzugefügt: {}", uri);
    Ok(())
}

#[tauri::command]
pub async fn play_track(
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    // Token refreshen falls nötig
    client.refresh_if_needed().await?;

    // Track abspielen (bei 401 Token erzwingen und einmal wiederholen)
    if let Err(e) = client.play_track(&uri).await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.play_track(&uri).await?;
        } else {
            return Err(e);
        }
    }

    info!("Track abgespielt: {}", uri);
    Ok(())
}

#[tauri::command]
pub async fn spotify_pause(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;

    if let Err(e) = client.pause().await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.pause().await?;
        } else {
            return Err(e);
        }
    }

    info!("Spotify pausiert");
    Ok(())
}

#[tauri::command]
pub async fn spotify_resume(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;

    if let Err(e) = client.resume().await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.resume().await?;
        } else {
            return Err(e);
        }
    }

    info!("Spotify fortgesetzt");
    Ok(())
}

/// Skip to the next track on the active Spotify device (used to jump straight to
/// a just-queued request while keeping the streamer's playlist context).
#[tauri::command]
pub async fn spotify_next(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    client.refresh_if_needed().await?;
    client.next().await
}

/// Current Spotify playback volume (0-100), or null if no active device.
/// Used so YouTube-only requests can play at the same volume as Spotify.
#[tauri::command]
pub async fn spotify_get_volume(
    state: State<'_, Arc<AppState>>
) -> Result<Option<u32>, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    client.refresh_if_needed().await?;
    client.get_volume().await
}

/// Toggle "external playback" mode. While on, the Spotify poll stops emitting
/// track-update so the frontend can drive the now-playing display for a
/// YouTube-only request (played via a hidden YouTube IFrame).
#[tauri::command]
pub async fn set_external_playback(
    active: bool,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    state.external_playback.store(active, std::sync::atomic::Ordering::Relaxed);
    info!("External playback set to: {}", active);
    Ok(())
}

/// Get track info by Spotify URI or track ID
#[tauri::command]
pub async fn get_track_info(
    track_id: String,
    state: State<'_, Arc<AppState>>
) -> Result<spotify::TrackInfo, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;
    match client.get_track_info(&track_id).await {
        Ok(info) => Ok(info),
        Err(e) if e.contains("401") || e.contains("expired") => {
            // Token expired mid-flight — force a refresh and retry once.
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.get_track_info(&track_id).await
        }
        Err(e) => Err(e),
    }
}

// ============================================================================
// PLAYLIST MANAGEMENT (für Song Request Historie)
// ============================================================================


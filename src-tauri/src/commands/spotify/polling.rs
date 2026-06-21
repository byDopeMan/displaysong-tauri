use std::sync::Arc;
use tauri::{AppHandle, State};
use log::info;
use crate::state::AppState;
use crate::polling;

/// Start Spotify polling (called by frontend when provider is set to Spotify)
#[tauri::command]
pub async fn start_spotify_polling(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let is_polling = state.status.lock().await.is_polling;
    if is_polling {
        info!("Spotify polling already running");
        return Ok(());
    }
    
    let spotify = state.spotify.lock().await;
    if spotify.is_none() {
        return Err("Spotify nicht verbunden".to_string());
    }
    drop(spotify);
    
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        polling::start_polling(app, state_clone).await;
    });
    
    info!("Spotify polling started by frontend");
    Ok(())
}

/// Stop Spotify polling
#[tauri::command]
pub async fn stop_spotify_polling(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let _ = state.shutdown_tx.send(true);
    info!("Spotify polling stopped by frontend");
    Ok(())
}

// ============================================================================
// PLAYBACK CONTROL (für Plugins wie TwitchConnect)
// ============================================================================


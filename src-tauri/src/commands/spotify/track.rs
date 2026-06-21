use std::sync::Arc;
use tauri::State;
use crate::state::{AppState, AppStatus};
use crate::spotify;

#[tauri::command]
pub async fn get_track(state: State<'_, Arc<AppState>>) -> Result<Option<spotify::TrackInfo>, String> {
    let track = state.current_track.lock().await.clone();
    Ok(track)
}

#[tauri::command]
pub async fn get_track_history(state: State<'_, Arc<AppState>>) -> Result<Vec<spotify::TrackInfo>, String> {
    let history = state.track_history.lock().await.clone();
    Ok(history)
}

#[tauri::command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<AppStatus, String> {
    let status = state.status.lock().await;
    Ok(AppStatus {
        spotify_connected: status.spotify_connected,
        is_polling: status.is_polling,
        last_error: status.last_error.clone(),
        polling_interval: status.polling_interval,
    })
}


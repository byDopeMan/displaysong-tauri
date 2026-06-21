use std::sync::Arc;
use tauri::State;
use crate::state::AppState;

/// Check if we have all required scopes
#[tauri::command]
pub async fn check_spotify_scopes(
    state: State<'_, Arc<AppState>>
) -> Result<Vec<String>, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.check_scopes().await
}

/// Create a new playlist
#[tauri::command]
pub async fn create_spotify_playlist(
    name: String,
    description: String,
    public: bool,
    state: State<'_, Arc<AppState>>
) -> Result<String, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.create_playlist(&name, &description, public).await
}

/// Add track to playlist
#[tauri::command]
pub async fn add_to_spotify_playlist(
    playlist_id: String,
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.add_to_playlist(&playlist_id, &uri).await
}

/// Remove track from playlist
#[tauri::command]
pub async fn remove_from_spotify_playlist(
    playlist_id: String,
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.remove_from_playlist(&playlist_id, &uri).await
}

/// Delete playlist
#[tauri::command]
pub async fn delete_spotify_playlist(
    playlist_id: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.delete_playlist(&playlist_id).await
}

use tauri::{State, Manager, AppHandle};
use std::sync::Arc;
use log::info;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::state::{AppState, SongRequest};
use crate::commands::queue::{self, QueueSongRequest};
use super::TwitchState;

// ============================================================================
// SONG REQUEST QUEUE
// ============================================================================

#[tauri::command]
pub async fn get_song_request_queue(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SongRequest>, String> {
    // Load from SQLite
    let db_queue = queue::load_queue_from_db().unwrap_or_default();
    
    // Convert to SongRequest format
    let requests: Vec<SongRequest> = db_queue.into_iter().map(|q| SongRequest {
        id: q.id,
        user_id: q.user_id,
        user_name: q.user_name,
        spotify_uri: q.spotify_uri,
        track_name: q.track_name,
        artist_name: q.artist_name,
        timestamp: q.timestamp,
        source: q.source,
    }).collect();
    
    // Also update in-memory cache
    let mut queue_lock = state.song_request_queue.lock().await;
    *queue_lock = requests.clone();
    
    Ok(requests)
}

#[tauri::command]
pub async fn add_song_request(
    user_id: String,
    user_name: String,
    spotify_uri: String,
    source: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    let id = format!("{}_{}", user_id, timestamp);
    
    // Save to SQLite
    let db_request = QueueSongRequest {
        id: id.clone(),
        user_id: user_id.clone(),
        user_name: user_name.clone(),
        spotify_uri: spotify_uri.clone(),
        track_name: None,
        artist_name: None,
        album_cover: None,
        timestamp,
        source: source.clone(),
    };
    queue::save_request_to_db(&db_request)?;
    
    // Also update in-memory
    let request = SongRequest {
        id,
        user_id,
        user_name: user_name.clone(),
        spotify_uri: spotify_uri.clone(),
        track_name: None,
        artist_name: None,
        timestamp,
        source,
    };
    
    {
        let mut queue_lock = state.song_request_queue.lock().await;
        queue_lock.push(request);
    }
    
    let _ = app.emit_all("queue-updated", ());
    
    info!("Song request added: {} from {}", spotify_uri, user_name);
    Ok(())
}

#[tauri::command]
pub async fn remove_song_request(
    request_id: String,
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    // Remove from SQLite
    queue::remove_request_from_db(&request_id)?;
    
    // Remove from in-memory
    {
        let mut queue_lock = state.song_request_queue.lock().await;
        queue_lock.retain(|r| r.id != request_id);
    }
    let _ = app.emit_all("queue-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn clear_song_request_queue(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    // Clear SQLite
    queue::clear_queue_db()?;
    
    // Clear in-memory
    {
        let mut queue_lock = state.song_request_queue.lock().await;
        queue_lock.clear();
    }
    let _ = app.emit_all("queue-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn check_request_cooldown(
    user_id: String,
    state: State<'_, Arc<AppState>>,
    twitch: State<'_, TwitchState>,
) -> Result<bool, String> {
    let cooldown_seconds = *twitch.cooldown.read().await;
    let cooldowns = state.request_cooldowns.lock().await;
    
    if let Some(last_request) = cooldowns.get(&user_id) {
        let elapsed = last_request.elapsed();
        Ok(elapsed.as_secs() < cooldown_seconds as u64)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn update_request_cooldown(
    user_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut cooldowns = state.request_cooldowns.lock().await;
    cooldowns.insert(user_id, std::time::Instant::now());
    Ok(())
}


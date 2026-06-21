// ============================================================================
// SONG REQUEST QUEUE - SQLite Persistence
// ============================================================================

use std::path::Path;
use std::sync::Mutex;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use log::info;
use once_cell::sync::Lazy;

/// Global database connection
static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

/// Song Request Entry (compatible with existing state::SongRequest)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueSongRequest {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub spotify_uri: String,
    pub track_name: Option<String>,
    pub artist_name: Option<String>,
    pub album_cover: Option<String>,
    pub timestamp: i64,
    pub source: String,
}

/// Initialize the database (creates both song_requests and track_history tables)
/// Clears track_history on each app start for fresh session
pub fn init_queue_db(app_data_dir: &Path) -> Result<(), String> {
    let db_path = app_data_dir.join("songrequests.db");
    
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    // Create song_requests table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS song_requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            spotify_uri TEXT NOT NULL,
            track_name TEXT,
            artist_name TEXT,
            album_cover TEXT,
            timestamp INTEGER NOT NULL,
            source TEXT DEFAULT 'chat'
        )",
        [],
    ).map_err(|e| format!("Failed to create song_requests table: {}", e))?;
    
    // Create track_history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS track_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            album_cover TEXT,
            source TEXT DEFAULT 'Unknown',
            track_id TEXT,
            duration_ms INTEGER DEFAULT 0,
            played_at INTEGER NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create track_history table: {}", e))?;
    
    // Clear track_history on startup (fresh session each time)
    conn.execute("DELETE FROM track_history", [])
        .map_err(|e| format!("Failed to clear track_history: {}", e))?;
    info!("Track history cleared for new session");
    
    // Store connection
    let mut db = DB.lock().map_err(|e| e.to_string())?;
    *db = Some(conn);
    
    info!("Database initialized with both tables: {:?}", db_path);
    Ok(())
}

/// Load all requests from database
pub fn load_queue_from_db() -> Result<Vec<QueueSongRequest>, String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = match db.as_ref() {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };
    
    let mut stmt = conn.prepare(
        "SELECT id, user_id, user_name, spotify_uri, track_name, artist_name, album_cover, timestamp, source 
         FROM song_requests ORDER BY timestamp ASC"
    ).map_err(|e| e.to_string())?;
    
    let requests = stmt.query_map([], |row| {
        Ok(QueueSongRequest {
            id: row.get(0)?,
            user_id: row.get(1)?,
            user_name: row.get(2)?,
            spotify_uri: row.get(3)?,
            track_name: row.get(4)?,
            artist_name: row.get(5)?,
            album_cover: row.get(6)?,
            timestamp: row.get(7)?,
            source: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let result: Vec<QueueSongRequest> = requests.filter_map(|r| r.ok()).collect();
    Ok(result)
}

/// Save a request to database
pub fn save_request_to_db(request: &QueueSongRequest) -> Result<(), String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    
    conn.execute(
        "INSERT OR REPLACE INTO song_requests (id, user_id, user_name, spotify_uri, track_name, artist_name, album_cover, timestamp, source)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            request.id,
            request.user_id,
            request.user_name,
            request.spotify_uri,
            request.track_name,
            request.artist_name,
            request.album_cover,
            request.timestamp,
            request.source
        ],
    ).map_err(|e| format!("Failed to save: {}", e))?;
    
    Ok(())
}

/// Remove a request from database
pub fn remove_request_from_db(id: &str) -> Result<(), String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    
    conn.execute("DELETE FROM song_requests WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete: {}", e))?;
    
    Ok(())
}

/// Remove request by Spotify URI
#[allow(dead_code)] // Public API for future use
pub fn remove_request_by_uri_from_db(spotify_uri: &str) -> Result<(), String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    
    conn.execute("DELETE FROM song_requests WHERE spotify_uri = ?1", params![spotify_uri])
        .map_err(|e| format!("Failed to delete: {}", e))?;
    
    Ok(())
}

/// Clear all requests from database
pub fn clear_queue_db() -> Result<(), String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    
    conn.execute("DELETE FROM song_requests", [])
        .map_err(|e| format!("Failed to clear: {}", e))?;
    
    Ok(())
}

/// Check if song exists in database
#[allow(dead_code)] // Public API for future use
pub fn is_song_in_queue_db(spotify_uri: &str) -> Result<bool, String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = match db.as_ref() {
        Some(c) => c,
        None => return Ok(false),
    };
    
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM song_requests WHERE spotify_uri = ?1",
        params![spotify_uri],
        |row| row.get(0)
    ).unwrap_or(0);
    
    Ok(count > 0)
}

// ============================================================================
// TRACK HISTORY - Local storage for played tracks
// ============================================================================

/// Track History Entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackHistoryEntry {
    pub id: i64,
    pub track: String,
    pub artist: String,
    pub album: String,
    pub album_cover: String,
    pub source: String,
    pub track_id: Option<String>,
    pub duration_ms: i64,
    pub played_at: i64,
}

/// Initialize track history table (DEPRECATED - now done in init_queue_db)
/// Kept for backwards compatibility, does nothing if table already exists
#[allow(dead_code)]
pub fn init_track_history_db(_app_data_dir: &Path) -> Result<(), String> {
    // Table is now created in init_queue_db
    // This function is kept for backwards compatibility
    Ok(())
}

/// Save track to history
pub fn save_track_to_history_db(
    track: &str,
    artist: &str,
    album: &str,
    album_cover: &str,
    source: &str,
    track_id: Option<&str>,
    duration_ms: i64,
) -> Result<(), String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    
    conn.execute(
        "INSERT INTO track_history (track, artist, album, album_cover, source, track_id, duration_ms, played_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![track, artist, album, album_cover, source, track_id, duration_ms, now],
    ).map_err(|e| format!("Failed to save track history: {}", e))?;
    
    // Keep only last 100 entries
    conn.execute(
        "DELETE FROM track_history WHERE id NOT IN (
            SELECT id FROM track_history ORDER BY played_at DESC LIMIT 100
        )",
        [],
    ).ok();
    
    Ok(())
}

/// Get track history
pub fn get_track_history_db(limit: i64) -> Result<Vec<TrackHistoryEntry>, String> {
    let db = DB.lock().map_err(|e| e.to_string())?;
    let conn = match db.as_ref() {
        Some(c) => c,
        None => return Ok(Vec::new()),
    };
    
    let mut stmt = conn.prepare(
        "SELECT id, track, artist, album, album_cover, source, track_id, duration_ms, played_at 
         FROM track_history ORDER BY played_at DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;
    
    let entries = stmt.query_map(params![limit], |row| {
        Ok(TrackHistoryEntry {
            id: row.get(0)?,
            track: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            album_cover: row.get(4)?,
            source: row.get(5)?,
            track_id: row.get(6)?,
            duration_ms: row.get(7)?,
            played_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(entries.filter_map(|r| r.ok()).collect())
}

// ============================================================================
// TAURI COMMANDS - Track History only (queue commands are in twitch.rs)
// ============================================================================

#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_track_to_history(
    track: String,
    artist: String,
    album: String,
    albumCover: String,
    source: String,
    trackId: Option<String>,
    durationMs: i64,
) -> Result<(), String> {
    save_track_to_history_db(
        &track,
        &artist,
        &album,
        &albumCover,
        &source,
        trackId.as_deref(),
        durationMs,
    )
}

#[tauri::command]
pub async fn get_local_track_history(limit: Option<i64>) -> Result<Vec<TrackHistoryEntry>, String> {
    get_track_history_db(limit.unwrap_or(20))
}

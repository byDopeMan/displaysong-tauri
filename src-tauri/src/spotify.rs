use serde::Deserialize;
use std::time::{Duration, Instant};
use log::debug;

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API_BASE: &str = "https://api.spotify.com/v1";
const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
// All scopes needed for the app
// - user-read-currently-playing: Read current track
// - user-read-playback-state: Read playback state
// - user-modify-playback-state: Add to queue, play tracks
// - playlist-modify-public: Create/modify public playlists
// - playlist-modify-private: Create/modify private playlists
const SCOPES: &str = "user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-modify-public playlist-modify-private";

// Required scopes for scope checking (used by check_scopes and external validation)
#[allow(dead_code)] // Public API for external scope validation
pub const REQUIRED_SCOPES: &[&str] = &[
    "user-read-currently-playing",
    "user-read-playback-state", 
    "user-modify-playback-state",
    "playlist-modify-public",
    "playlist-modify-private",
];

/// Get list of all required scopes (for external use)
#[allow(dead_code)] // Public API
pub fn get_required_scopes() -> Vec<&'static str> {
    REQUIRED_SCOPES.to_vec()
}

#[derive(Debug, Clone)]
pub struct SpotifyClient {
    client_id: String,
    client_secret: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_expiry: Option<Instant>,
    http: reqwest::Client,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TrackInfo {
    pub track: String,
    pub artist: String,
    pub album: String,
    #[serde(rename = "albumCover")]
    pub album_cover: String,
    #[serde(rename = "isPlaying")]
    pub is_playing: bool,
    #[serde(rename = "progressMs")]
    pub progress_ms: u64,
    #[serde(rename = "durationMs")]
    pub duration_ms: u64,
    pub color: Option<ColorInfo>,
    #[serde(rename = "trackId")]
    pub track_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ColorInfo {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct CurrentlyPlaying {
    is_playing: bool,
    progress_ms: Option<u64>,
    item: Option<TrackItem>,
}

#[derive(Deserialize)]
struct TrackItem {
    id: String,
    name: String,
    duration_ms: u64,
    artists: Vec<Artist>,
    album: Album,
}

#[derive(Deserialize)]
struct Artist {
    name: String,
}

#[derive(Deserialize)]
struct Album {
    name: String,
    images: Vec<Image>,
}

#[derive(Deserialize)]
struct Image {
    url: String,
    width: Option<u32>,
}

impl SpotifyClient {
    pub fn new(client_id: &str, client_secret: &str) -> Self {
        Self {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            access_token: None,
            refresh_token: None,
            token_expiry: None,
            http: reqwest::Client::new(),
        }
    }

    pub fn get_auth_url(&self) -> String {
        format!(
            "{}?client_id={}&response_type=code&redirect_uri={}&scope={}",
            AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(REDIRECT_URI),
            urlencoding::encode(SCOPES)
        )
    }

    pub fn set_tokens(&mut self, access: &str, refresh: &str) {
        self.access_token = Some(access.to_string());
        self.refresh_token = Some(refresh.to_string());
        // Tokens loaded from storage have an UNKNOWN remaining lifetime (they may
        // be hours old and already expired). Don't assume an hour — leave expiry
        // None so refresh_if_needed() refreshes on first use. Assuming validity
        // here caused expired tokens to be used → 401 "access token expired".
        self.token_expiry = None;
    }

    pub async fn exchange_code(&mut self, code: &str) -> Result<(), String> {
        debug!("Exchanging auth code for tokens");
        
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token exchange failed: {}", error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        debug!("Token exchange successful");
        Ok(())
    }

    pub async fn refresh_if_needed(&mut self) -> Result<(), String> {
        let needs_refresh = match self.token_expiry {
            Some(expiry) => Instant::now() > expiry - Duration::from_secs(60),
            None => true,
        };

        if !needs_refresh {
            return Ok(());
        }

        self.force_refresh().await
    }

    pub async fn force_refresh(&mut self) -> Result<(), String> {
        let refresh_token = self.refresh_token.clone()
            .ok_or("No refresh token available")?;

        debug!("Refreshing access token");

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Refresh request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token refresh failed: {}", error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        debug!("Token refresh successful");
        Ok(())
    }

    pub fn get_tokens(&self) -> Option<(String, String)> {
        match (&self.access_token, &self.refresh_token) {
            (Some(a), Some(r)) => Some((a.clone(), r.clone())),
            _ => None,
        }
    }

    pub async fn get_currently_playing(&self) -> Result<Option<TrackInfo>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/me/player/currently-playing", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if response.status().as_u16() == 204 {
            return Ok(None);
        }

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let data: CurrentlyPlaying = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let item = match data.item {
            Some(i) => i,
            None => return Ok(None),
        };

        let album_cover = item.album.images
            .iter()
            .max_by_key(|img| img.width.unwrap_or(0))
            .map(|img| img.url.clone())
            .unwrap_or_default();

        let artist = item.artists
            .iter()
            .map(|a| a.name.clone())
            .collect::<Vec<_>>()
            .join(", ");

        Ok(Some(TrackInfo {
            track: item.name,
            artist,
            album: item.album.name,
            album_cover,
            is_playing: data.is_playing,
            progress_ms: data.progress_ms.unwrap_or(0),
            duration_ms: item.duration_ms,
            color: None,
            track_id: Some(item.id),
        }))
    }

    /// Song zur Warteschlange hinzufügen
    pub async fn add_to_queue(&self, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Adding to queue: {}", uri);

        // Spotify API requires Content-Length header, send empty body
        let response = self.http
            .post(format!("{}/me/player/queue", API_BASE))
            .bearer_auth(token)
            .query(&[("uri", uri)])
            .header("Content-Length", "0")
            .body("")
            .send()
            .await
            .map_err(|e| format!("Queue request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 204 {
            debug!("Added to queue successfully");
            return Ok(());
        }

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if status.as_u16() == 403 {
            return Err("Spotify Premium erforderlich für diese Funktion.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Queue failed: {} - {}", status, error));
        }

        debug!("Added to queue successfully");
        Ok(())
    }

    /// Song direkt abspielen
    pub async fn play_track(&self, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Playing track: {}", uri);

        let body = serde_json::json!({
            "uris": [uri]
        });

        let response = self.http
            .put(format!("{}/me/player/play", API_BASE))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Play request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if status.as_u16() == 403 {
            return Err("Spotify Premium erforderlich für diese Funktion.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Play failed: {} - {}", status, error));
        }

        debug!("Playing track successfully");
        Ok(())
    }

    /// Wiedergabe pausieren (z.B. um einen YouTube-only Request dazwischen zu spielen)
    pub async fn pause(&self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .put(format!("{}/me/player/pause", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Pause request failed: {}", e))?;

        let status = response.status();

        // 404 = kein aktives Gerät / nichts spielt -> als ok behandeln
        if status.as_u16() == 404 {
            return Ok(());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Pause failed: {} - {}", status, error));
        }

        Ok(())
    }

    /// Wiedergabe fortsetzen (kein Body -> Spotify spielt den aktuellen Kontext weiter)
    pub async fn resume(&self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .put(format!("{}/me/player/play", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Resume request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Resume failed: {} - {}", status, error));
        }

        Ok(())
    }

    /// Get track info by ID
    pub async fn get_track_info(&self, track_id: &str) -> Result<TrackInfo, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        // Clean track ID (remove spotify:track: prefix if present)
        let clean_id = track_id
            .trim_start_matches("spotify:track:")
            .split('?').next()
            .unwrap_or(track_id);

        debug!("Getting track info for: {}", clean_id);

        let response = self.http
            .get(format!("{}/tracks/{}", API_BASE, clean_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Track info request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Track info failed: {}", error));
        }

        let item: TrackItem = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let album_cover = item.album.images
            .iter()
            .max_by_key(|img| img.width.unwrap_or(0))
            .map(|img| img.url.clone())
            .unwrap_or_default();

        let artist = item.artists
            .iter()
            .map(|a| a.name.clone())
            .collect::<Vec<_>>()
            .join(", ");

        Ok(TrackInfo {
            track: item.name,
            artist,
            album: item.album.name,
            album_cover,
            is_playing: false,
            progress_ms: 0,
            duration_ms: item.duration_ms,
            color: None,
            track_id: Some(item.id),
        })
    }

    /// Get current user's Spotify ID
    pub async fn get_user_id(&self) -> Result<String, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/me", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("User info request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("User info failed: {}", response.status()));
        }

        #[derive(Deserialize)]
        struct UserResponse {
            id: String,
        }

        let user: UserResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(user.id)
    }

    /// Create a new playlist
    pub async fn create_playlist(&self, name: &str, description: &str, public: bool) -> Result<String, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let user_id = self.get_user_id().await?;

        debug!("Creating playlist '{}' for user {}", name, user_id);

        let body = serde_json::json!({
            "name": name,
            "description": description,
            "public": public
        });

        let response = self.http
            .post(format!("{}/users/{}/playlists", API_BASE, user_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Create playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Create playlist failed: {}", error));
        }

        #[derive(Deserialize)]
        struct PlaylistResponse {
            id: String,
        }

        let playlist: PlaylistResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        debug!("Created playlist with ID: {}", playlist.id);
        Ok(playlist.id)
    }

    /// Add track to playlist
    pub async fn add_to_playlist(&self, playlist_id: &str, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Adding {} to playlist {}", uri, playlist_id);

        let body = serde_json::json!({
            "uris": [uri]
        });

        let response = self.http
            .post(format!("{}/playlists/{}/tracks", API_BASE, playlist_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Add to playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Add to playlist failed: {}", error));
        }

        debug!("Added to playlist successfully");
        Ok(())
    }

    /// Remove track from playlist
    pub async fn remove_from_playlist(&self, playlist_id: &str, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Removing {} from playlist {}", uri, playlist_id);

        let body = serde_json::json!({
            "tracks": [{"uri": uri}]
        });

        let response = self.http
            .delete(format!("{}/playlists/{}/tracks", API_BASE, playlist_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Remove from playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Remove from playlist failed: {}", error));
        }

        debug!("Removed from playlist successfully");
        Ok(())
    }

    /// Delete playlist (unfollow)
    pub async fn delete_playlist(&self, playlist_id: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Deleting playlist {}", playlist_id);

        let response = self.http
            .delete(format!("{}/playlists/{}/followers", API_BASE, playlist_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Delete playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Delete playlist failed: {}", error));
        }

        debug!("Deleted playlist successfully");
        Ok(())
    }

    /// Check if we have the required scopes by testing API endpoints
    pub async fn check_scopes(&self) -> Result<Vec<String>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let mut missing_scopes = Vec::new();

        // Test user-read-currently-playing / user-read-playback-state
        let response = self.http
            .get(format!("{}/me/player", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Scope check failed: {}", e))?;

        if response.status().as_u16() == 403 {
            missing_scopes.push("user-read-playback-state".to_string());
        }

        // Test playlist-modify by checking if we can access user's playlists
        let response = self.http
            .get(format!("{}/me/playlists?limit=1", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Scope check failed: {}", e))?;

        if response.status().as_u16() == 403 {
            missing_scopes.push("playlist-modify-public".to_string());
            missing_scopes.push("playlist-modify-private".to_string());
        }

        Ok(missing_scopes)
    }
}

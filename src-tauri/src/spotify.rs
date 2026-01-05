use serde::Deserialize;
use std::time::{Duration, Instant};
use log::debug;

const AUTH_URL: &str = "https://accounts.spotify.com/authorize";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const API_BASE: &str = "https://api.spotify.com/v1";
const REDIRECT_URI: &str = "http://127.0.0.1:8888/callback";
const SCOPES: &str = "user-read-currently-playing user-read-playback-state";

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
        self.token_expiry = Some(Instant::now() + Duration::from_secs(3600));
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
}

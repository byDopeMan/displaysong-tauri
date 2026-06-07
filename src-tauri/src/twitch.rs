use serde::{Deserialize, Serialize};
use log::{debug, info, warn};
use std::time::{Duration, Instant};
use std::sync::RwLock;

const AUTH_URL: &str = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const REVOKE_URL: &str = "https://id.twitch.tv/oauth2/revoke";
pub const API_BASE: &str = "https://api.twitch.tv/helix";
const REDIRECT_URI: &str = "http://localhost:8889/callback";

// Worker API URLs
const BOT_API_URL: &str = "https://displaysong-api.bydopeman.workers.dev/api/bot-credentials";
const APP_API_URL: &str = "https://displaysong-api.bydopeman.workers.dev/api/app-credentials";

// Scopes für Chat und Channel Points
// - channel:read:redemptions + channel:manage:redemptions = für Channel Points
// - user:read:chat + user:write:chat = für Chat lesen und senden
// - chat:read + chat:edit = legacy IRC chat (backup)
// - moderator:read:chatters = zum lesen der Chat-Nachrichten via EventSub
const SCOPES: &str = "channel:read:redemptions channel:manage:redemptions user:read:chat user:write:chat chat:read chat:edit user:read:email moderator:read:chatters";

// ============================================================================
// CREDENTIALS STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotCredentials {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "clientSecret")]
    pub client_secret: String,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "userId")]
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppCredentials {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "clientSecret")]
    pub client_secret: String,
}

// Lazy-loaded credentials
use once_cell::sync::Lazy;

pub static BOT_CREDENTIALS: Lazy<RwLock<Option<BotCredentials>>> = Lazy::new(|| {
    RwLock::new(None)
});

pub static APP_CREDENTIALS: Lazy<RwLock<Option<AppCredentials>>> = Lazy::new(|| {
    RwLock::new(None)
});

/// Fetch Bot Credentials from Worker (for sending chat messages)
pub async fn fetch_bot_credentials() -> Result<BotCredentials, String> {
    // Check if already cached
    {
        let cached = BOT_CREDENTIALS.read().unwrap();
        if let Some(creds) = cached.as_ref() {
            return Ok(creds.clone());
        }
    }
    
    info!("Fetching bot credentials from worker...");
    
    let client = reqwest::Client::new();
    let response = client.get(BOT_API_URL)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Worker request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Worker returned status: {}", response.status()));
    }
    
    let creds: BotCredentials = response.json().await
        .map_err(|e| format!("Failed to parse bot credentials: {}", e))?;
    
    // Cache credentials
    {
        let mut cached = BOT_CREDENTIALS.write().unwrap();
        *cached = Some(creds.clone());
    }
    
    info!("Bot credentials loaded successfully");
    Ok(creds)
}

/// Fetch App Credentials from Worker (for user OAuth)
pub async fn fetch_app_credentials() -> Result<AppCredentials, String> {
    // Check if already cached
    {
        let cached = APP_CREDENTIALS.read().unwrap();
        if let Some(creds) = cached.as_ref() {
            return Ok(creds.clone());
        }
    }
    
    info!("Fetching app credentials from worker...");
    
    let client = reqwest::Client::new();
    let response = client.get(APP_API_URL)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Worker request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Worker returned status: {}", response.status()));
    }
    
    let creds: AppCredentials = response.json().await
        .map_err(|e| format!("Failed to parse app credentials: {}", e))?;
    
    // Cache credentials
    {
        let mut cached = APP_CREDENTIALS.write().unwrap();
        *cached = Some(creds.clone());
    }
    
    info!("App credentials loaded successfully");
    Ok(creds)
}

// ============================================================================
// TWITCH DATA STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Serialize)]
pub struct TwitchUser {
    pub id: String,
    pub login: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchReward {
    pub id: String,
    pub title: String,
    pub cost: u32,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchRedemption {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub user_input: String,
    pub reward_id: String,
    pub reward_title: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchChatMessage {
    pub user_id: String,
    pub user_name: String,
    pub message: String,
    pub badges: Vec<String>,
    pub is_subscriber: bool,
    pub is_moderator: bool,
    pub is_vip: bool,
}

// ============================================================================
// TWITCH CLIENT
// ============================================================================

#[derive(Debug, Clone)]
pub struct TwitchClient {
    pub client_id: String,
    pub client_secret: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expiry: Option<Instant>,
    pub user: Option<TwitchUser>,
    pub http: reqwest::Client,
    pub use_bot_for_chat: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

#[derive(Deserialize)]
struct UsersResponse {
    data: Vec<UserData>,
}

#[derive(Deserialize)]
struct UserData {
    id: String,
    login: String,
    display_name: String,
}

#[derive(Deserialize)]
struct RewardsResponse {
    data: Vec<RewardData>,
}

#[derive(Deserialize)]
struct RewardData {
    id: String,
    title: String,
    cost: u32,
    is_enabled: bool,
}

impl TwitchClient {
    pub fn new(client_id: &str, client_secret: &str) -> Self {
        Self {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            access_token: None,
            refresh_token: None,
            token_expiry: None,
            user: None,
            http: reqwest::Client::new(),
            use_bot_for_chat: true,
        }
    }

    /// Create TwitchClient from App Credentials (async)
    pub async fn from_app_credentials() -> Result<Self, String> {
        let creds = fetch_app_credentials().await?;
        Ok(Self::new(&creds.client_id, &creds.client_secret))
    }

    pub fn get_auth_url(&self) -> String {
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&force_verify=true",
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

    pub fn get_tokens(&self) -> Option<(String, String)> {
        match (&self.access_token, &self.refresh_token) {
            (Some(a), Some(r)) => Some((a.clone(), r.clone())),
            _ => None,
        }
    }

    pub fn get_user(&self) -> Option<TwitchUser> {
        self.user.clone()
    }

    pub fn get_client_id(&self) -> &str {
        &self.client_id
    }

    pub fn is_authenticated(&self) -> bool {
        self.access_token.is_some()
    }

    pub fn clear_tokens(&mut self) {
        self.access_token = None;
        self.refresh_token = None;
        self.token_expiry = None;
        self.user = None;
    }

    pub fn set_use_bot(&mut self, use_bot: bool) {
        self.use_bot_for_chat = use_bot;
        info!("Twitch: Chat mode set to {}", if use_bot { "Bot Account" } else { "User Account" });
    }

    /// Revoke token at Twitch (removes app authorization)
    pub async fn revoke_token(&self) -> Result<(), String> {
        let token = match &self.access_token {
            Some(t) => t,
            None => return Ok(()),
        };

        debug!("Twitch: Revoking access token");

        let params = [
            ("client_id", self.client_id.as_str()),
            ("token", token.as_str()),
        ];

        let response = self.http
            .post(REVOKE_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Revoke request failed: {}", e))?;

        if response.status().is_success() {
            info!("Twitch: Token revoked successfully");
            Ok(())
        } else {
            let error = response.text().await.unwrap_or_default();
            Err(format!("Token revoke failed: {}", error))
        }
    }

    pub async fn exchange_code(&mut self, code: &str) -> Result<(), String> {
        debug!("Twitch: Exchanging auth code for tokens");

        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", REDIRECT_URI),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token exchange failed: {} - {}", status, error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        // Fetch user info
        self.fetch_user_info().await?;

        debug!("Twitch: Token exchange successful");
        Ok(())
    }

    pub async fn force_refresh(&mut self) -> Result<(), String> {
        let refresh_token = self.refresh_token.clone()
            .ok_or("No refresh token available")?;

        debug!("Twitch: Refreshing access token");

        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token.as_str()),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Refresh request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token refresh failed: {} - {}", status, error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        debug!("Twitch: Token refresh successful");
        Ok(())
    }

    pub async fn validate_token(&self) -> Result<bool, String> {
        let token = match &self.access_token {
            Some(t) => t,
            None => return Ok(false),
        };

        let response = self.http
            .get(VALIDATE_URL)
            .header("Authorization", format!("OAuth {}", token))
            .send()
            .await
            .map_err(|e| format!("Validate request failed: {}", e))?;

        Ok(response.status().is_success())
    }

    pub async fn fetch_user_info(&mut self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/users", API_BASE))
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.client_id)
            .send()
            .await
            .map_err(|e| format!("User info request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("User info failed: {} - {}", status, error));
        }

        let users: UsersResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        if let Some(user) = users.data.into_iter().next() {
            self.user = Some(TwitchUser {
                id: user.id,
                login: user.login,
                display_name: user.display_name,
            });
        }

        Ok(())
    }

    /// Get channel point rewards
    pub async fn get_rewards(&self) -> Result<Vec<TwitchReward>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;
        let user = self.user.as_ref()
            .ok_or("User info not available")?;

        let response = self.http
            .get(format!("{}/channel_points/custom_rewards", API_BASE))
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.client_id)
            .query(&[("broadcaster_id", &user.id)])
            .send()
            .await
            .map_err(|e| format!("Rewards request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Rewards failed: {} - {}", status, error));
        }

        let rewards: RewardsResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(rewards.data.into_iter().map(|r| TwitchReward {
            id: r.id,
            title: r.title,
            cost: r.cost,
            is_enabled: r.is_enabled,
        }).collect())
    }

    /// Create a channel point reward for song requests
    pub async fn create_song_request_reward(&self, title: &str, cost: u32) -> Result<TwitchReward, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;
        let user = self.user.as_ref()
            .ok_or("User info not available")?;

        let body = serde_json::json!({
            "title": title,
            "cost": cost,
            "is_enabled": true,
            "is_user_input_required": true,
            "prompt": "Spotify Link oder Track ID eingeben",
            "background_color": "#1DB954"
        });

        let response = self.http
            .post(format!("{}/channel_points/custom_rewards", API_BASE))
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.client_id)
            .query(&[("broadcaster_id", &user.id)])
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Create reward failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Create reward failed: {} - {}", status, error));
        }

        let rewards: RewardsResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        rewards.data.into_iter().next()
            .map(|r| TwitchReward {
                id: r.id,
                title: r.title,
                cost: r.cost,
                is_enabled: r.is_enabled,
            })
            .ok_or("No reward returned".to_string())
    }

    /// Send a chat message (uses bot or user account based on settings)
    pub async fn send_chat_message(&self, message: &str) -> Result<(), String> {
        let user = self.user.as_ref()
            .ok_or("User info not available")?;

        // Use bot account if enabled
        let (token, client_id, sender_id) = if self.use_bot_for_chat {
            // Try to get bot credentials
            match fetch_bot_credentials().await {
                Ok(bot) => {
                    (bot.access_token, bot.client_id, bot.user_id)
                }
                Err(e) => {
                    warn!("Could not get bot credentials, falling back to user account: {}", e);
                    // Fallback to user account
                    let token = self.access_token.as_ref()
                        .ok_or("Not authenticated")?;
                    (token.clone(), self.client_id.clone(), user.id.clone())
                }
            }
        } else {
            // Use user account
            let token = self.access_token.as_ref()
                .ok_or("Not authenticated")?;
            (token.clone(), self.client_id.clone(), user.id.clone())
        };

        let body = serde_json::json!({
            "broadcaster_id": user.id,
            "sender_id": sender_id,
            "message": message
        });

        let response = self.http
            .post(format!("{}/chat/messages", API_BASE))
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &client_id)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Send chat failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Send chat failed: {} - {}", status, error));
        }

        Ok(())
    }

    /// Update redemption status (fulfill or cancel)
    pub async fn update_redemption(&self, reward_id: &str, redemption_id: &str, fulfill: bool) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;
        let user = self.user.as_ref()
            .ok_or("User info not available")?;

        let status_str = if fulfill { "FULFILLED" } else { "CANCELED" };

        let body = serde_json::json!({
            "status": status_str
        });

        let response = self.http
            .patch(format!("{}/channel_points/custom_rewards/redemptions", API_BASE))
            .header("Authorization", format!("Bearer {}", token))
            .header("Client-Id", &self.client_id)
            .query(&[
                ("broadcaster_id", user.id.as_str()),
                ("reward_id", reward_id),
                ("id", redemption_id),
            ])
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Update redemption failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Update redemption failed: {} - {}", status, error));
        }

        Ok(())
    }
}

// ============================================================================
// EventSub Helpers
// ============================================================================

/// Parse EventSub welcome message to get session ID
pub fn parse_eventsub_welcome(message: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    
    if json["metadata"]["message_type"].as_str()? == "session_welcome" {
        json["payload"]["session"]["id"].as_str().map(|s| s.to_string())
    } else {
        None
    }
}

/// Parse EventSub notification for channel point redemption
pub fn parse_redemption_event(message: &str) -> Option<TwitchRedemption> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    
    if json["metadata"]["message_type"].as_str()? != "notification" {
        return None;
    }
    
    let sub_type = json["metadata"]["subscription_type"].as_str()?;
    if sub_type != "channel.channel_points_custom_reward_redemption.add" {
        return None;
    }
    
    let event = &json["payload"]["event"];
    
    Some(TwitchRedemption {
        id: event["id"].as_str()?.to_string(),
        user_id: event["user_id"].as_str()?.to_string(),
        user_name: event["user_name"].as_str()?.to_string(),
        user_input: event["user_input"].as_str().unwrap_or("").to_string(),
        reward_id: event["reward"]["id"].as_str()?.to_string(),
        reward_title: event["reward"]["title"].as_str()?.to_string(),
    })
}

/// Parse EventSub notification for chat message
pub fn parse_chat_message_event(message: &str) -> Option<TwitchChatMessage> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    
    let msg_type = json["metadata"]["message_type"].as_str()?;
    if msg_type != "notification" {
        return None;
    }
    
    let sub_type = json["metadata"]["subscription_type"].as_str()?;
    if sub_type != "channel.chat.message" {
        return None;
    }
    
    let event = &json["payload"]["event"];
    
    // Parse badges
    let badges: Vec<String> = event["badges"]
        .as_array()
        .map(|arr| arr.iter()
            .filter_map(|b| b["set_id"].as_str().map(String::from))
            .collect())
        .unwrap_or_default();
    
    let is_subscriber = badges.iter().any(|b| b == "subscriber" || b == "founder");
    let is_moderator = badges.iter().any(|b| b == "moderator" || b == "broadcaster");
    let is_vip = badges.iter().any(|b| b == "vip");
    
    Some(TwitchChatMessage {
        user_id: event["chatter_user_id"].as_str()?.to_string(),
        user_name: event["chatter_user_name"].as_str()?.to_string(),
        message: event["message"]["text"].as_str()?.to_string(),
        badges,
        is_subscriber,
        is_moderator,
        is_vip,
    })
}

/// Check if message is a keepalive
pub fn is_keepalive(message: &str) -> bool {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(message) {
        json["metadata"]["message_type"].as_str() == Some("session_keepalive")
    } else {
        false
    }
}

/// Check if message is a reconnect request
pub fn parse_reconnect_url(message: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    
    if json["metadata"]["message_type"].as_str()? == "session_reconnect" {
        json["payload"]["session"]["reconnect_url"].as_str().map(|s| s.to_string())
    } else {
        None
    }
}

// ============================================================================
// OAuth Server
// ============================================================================

pub async fn start_oauth_server(
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let listener = TcpListener::bind("127.0.0.1:8889").await
        .map_err(|e| format!("Bind failed: {}", e))?;

    info!("Twitch OAuth server listening on :8889");

    let (mut socket, _) = listener.accept().await
        .map_err(|e| format!("Accept failed: {}", e))?;

    let mut buf = [0u8; 4096];
    let n = socket.read(&mut buf).await
        .map_err(|e| format!("Read failed: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);
    
    // Extract code
    let code = request.lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| path.split('?').nth(1))
        .and_then(|query| query.split('&').find(|p| p.starts_with("code=")))
        .and_then(|p| p.strip_prefix("code="))
        .map(|s| s.to_string());

    let response = if code.is_some() {
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='font-family:system-ui;text-align:center;padding:50px;background:#0e0e10;color:white'>\
        <h1 style='color:#9146ff'>✓ Twitch verbunden!</h1>\
        <p>Du kannst dieses Fenster schließen.</p>\
        <script>setTimeout(()=>window.close(),2000)</script>\
        </body></html>"
    } else {
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='font-family:system-ui;text-align:center;padding:50px;background:#0e0e10;color:white'>\
        <h1 style='color:#ef4444'>✗ Fehler</h1>\
        <p>Autorisierung fehlgeschlagen.</p>\
        </body></html>"
    };

    socket.write_all(response.as_bytes()).await.ok();
    socket.shutdown().await.ok();

    if let Some(code) = code {
        let _ = tx.send(code);
    }

    Ok(())
}

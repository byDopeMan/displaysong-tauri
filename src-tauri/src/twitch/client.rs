use serde::Deserialize;
use std::time::{Duration, Instant};
use log::{debug, info, warn};
use super::*;

/// Response shape of the Twitch token validation endpoint (only the part we need).
#[derive(Debug, Deserialize)]
struct ValidateResponse {
    #[serde(default)]
    scopes: Vec<String>,
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

    /// Returns the required scopes that the current token is MISSING.
    /// Empty = all good. Used to prompt a re-auth after the app's scope set grows
    /// (an existing token keeps its original, now-incomplete scopes until re-auth).
    pub async fn missing_scopes(&self) -> Result<Vec<String>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(VALIDATE_URL)
            .header("Authorization", format!("OAuth {}", token))
            .send()
            .await
            .map_err(|e| format!("Validate request failed: {}", e))?;

        if !response.status().is_success() {
            return Err("Token invalid".to_string());
        }

        let validated: ValidateResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let granted: std::collections::HashSet<&str> =
            validated.scopes.iter().map(|s| s.as_str()).collect();

        let missing = SCOPES
            .split_whitespace()
            .filter(|req| !granted.contains(req))
            .map(|s| s.to_string())
            .collect();

        Ok(missing)
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

use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::time::Duration;
use log::info;
use super::{BOT_API_URL, APP_API_URL};

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

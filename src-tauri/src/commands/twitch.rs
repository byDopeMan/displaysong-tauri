use tauri::{State, Manager, AppHandle};
use std::sync::Arc;
use tokio::sync::RwLock;
use log::{info, error, warn};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::twitch::{
    TwitchClient, TwitchUser, TwitchReward,
    parse_eventsub_welcome, parse_redemption_event, parse_chat_message_event,
    is_keepalive, parse_reconnect_url, start_oauth_server, API_BASE,
    fetch_app_credentials,
};
use crate::state::{AppState, SongRequest};
use super::queue::{self, QueueSongRequest};

// Twitch State
pub struct TwitchState {
    pub client: Arc<RwLock<Option<TwitchClient>>>,
    pub eventsub_connected: Arc<RwLock<bool>>,
    pub mode: Arc<RwLock<String>>,
    pub command: Arc<RwLock<String>>,
    pub cooldown: Arc<RwLock<u32>>,
    pub sub_only: Arc<RwLock<bool>>,
    pub reward_id: Arc<RwLock<Option<String>>>,
    pub use_bot_account: Arc<RwLock<bool>>,
}

impl TwitchState {
    pub fn new() -> Self {
        Self {
            client: Arc::new(RwLock::new(None)),
            eventsub_connected: Arc::new(RwLock::new(false)),
            mode: Arc::new(RwLock::new("commands".to_string())),
            command: Arc::new(RwLock::new("!sr".to_string())),
            cooldown: Arc::new(RwLock::new(30)),
            sub_only: Arc::new(RwLock::new(false)),
            reward_id: Arc::new(RwLock::new(None)),
            use_bot_account: Arc::new(RwLock::new(true)),
        }
    }
}

#[derive(serde::Serialize)]
pub struct TwitchConnectionInfo {
    pub connected: bool,
    pub user: Option<TwitchUser>,
    pub eventsub_connected: bool,
    pub use_bot_account: bool,
}

// ============================================================================
// CREDENTIALS & AUTH
// ============================================================================

#[tauri::command]
pub async fn twitch_connect(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let client = TwitchClient::from_app_credentials().await?;
    
    {
        let mut twitch_client = twitch.client.write().await;
        *twitch_client = Some(client);
    }
    
    let url = {
        let client = twitch.client.read().await;
        let c = client.as_ref().ok_or("Client nicht initialisiert")?;
        c.get_auth_url()
    };
    
    if let Err(e) = open::that(&url) {
        return Err(format!("Browser konnte nicht geöffnet werden: {}", e));
    }
    
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        if let Err(e) = start_oauth_server(tx).await {
            error!("Twitch OAuth server error: {}", e);
        }
    });
    
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        rx
    ).await
        .map_err(|_| "Timeout - OAuth nicht abgeschlossen")?
        .map_err(|_| "OAuth Callback fehlgeschlagen")?;
    
    {
        let mut client = twitch.client.write().await;
        let c = client.as_mut().ok_or("Client nicht initialisiert")?;
        c.exchange_code(&code).await?;
        
        if let Some((access, refresh)) = c.get_tokens() {
            let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                .ok().map(|e| e.set_password(&access));
            let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                .ok().map(|e| e.set_password(&refresh));
        }
    }
    
    info!("Twitch connected");
    Ok(())
}

#[tauri::command]
pub async fn check_twitch_credentials(
    twitch: State<'_, TwitchState>,
) -> Result<bool, String> {
    let access = keyring::Entry::new("displaysong", "twitch_access_token")
        .ok()
        .and_then(|e| e.get_password().ok());
    let refresh = keyring::Entry::new("displaysong", "twitch_refresh_token")
        .ok()
        .and_then(|e| e.get_password().ok());
    
    let (access_token, refresh_token) = match (access, refresh) {
        (Some(a), Some(r)) => (a, r),
        _ => return Ok(false),
    };
    
    let app_creds = match fetch_app_credentials().await {
        Ok(c) => c,
        Err(_) => return Ok(false),
    };
    
    let mut client = TwitchClient::new(&app_creds.client_id, &app_creds.client_secret);
    client.set_tokens(&access_token, &refresh_token);
    
    match client.validate_token().await {
        Ok(true) => {
            if client.fetch_user_info().await.is_ok() {
                let mut twitch_client = twitch.client.write().await;
                *twitch_client = Some(client);
                return Ok(true);
            }
        }
        _ => {
            if client.force_refresh().await.is_ok() {
                if let Some((a, r)) = client.get_tokens() {
                    let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                        .ok().map(|e| e.set_password(&a));
                    let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                        .ok().map(|e| e.set_password(&r));
                }
                
                if client.fetch_user_info().await.is_ok() {
                    let mut twitch_client = twitch.client.write().await;
                    *twitch_client = Some(client);
                    return Ok(true);
                }
            }
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn twitch_get_auth_url(
    twitch: State<'_, TwitchState>,
) -> Result<String, String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Twitch nicht konfiguriert")?;
    Ok(c.get_auth_url())
}

#[tauri::command]
pub async fn twitch_start_auth(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    {
        let client = twitch.client.read().await;
        if client.is_none() {
            drop(client);
            let new_client = TwitchClient::from_app_credentials().await?;
            let mut twitch_client = twitch.client.write().await;
            *twitch_client = Some(new_client);
        }
    }
    
    let url = {
        let client = twitch.client.read().await;
        let c = client.as_ref().ok_or("Twitch nicht konfiguriert")?;
        c.get_auth_url()
    };

    if let Err(e) = open::that(&url) {
        return Err(format!("Browser konnte nicht geöffnet werden: {}", e));
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        if let Err(e) = start_oauth_server(tx).await {
            error!("Twitch OAuth server error: {}", e);
        }
    });

    let code = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        rx
    ).await
        .map_err(|_| "Timeout - OAuth nicht abgeschlossen")?
        .map_err(|_| "OAuth Callback fehlgeschlagen")?;

    {
        let mut client = twitch.client.write().await;
        let c = client.as_mut().ok_or("Twitch nicht konfiguriert")?;
        c.exchange_code(&code).await?;
        
        if let Some((access, refresh)) = c.get_tokens() {
            let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                .ok().map(|e| e.set_password(&access));
            let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                .ok().map(|e| e.set_password(&refresh));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn twitch_get_connection(
    twitch: State<'_, TwitchState>,
) -> Result<TwitchConnectionInfo, String> {
    let client = twitch.client.read().await;
    let eventsub = *twitch.eventsub_connected.read().await;
    let use_bot = *twitch.use_bot_account.read().await;
    
    if let Some(c) = client.as_ref() {
        Ok(TwitchConnectionInfo {
            connected: c.is_authenticated(),
            user: c.get_user(),
            eventsub_connected: eventsub,
            use_bot_account: use_bot,
        })
    } else {
        Ok(TwitchConnectionInfo {
            connected: false,
            user: None,
            eventsub_connected: false,
            use_bot_account: use_bot,
        })
    }
}

#[tauri::command]
pub async fn twitch_disconnect(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    {
        let client = twitch.client.read().await;
        if let Some(c) = client.as_ref() {
            let _ = c.revoke_token().await;
        }
    }
    
    {
        let mut client = twitch.client.write().await;
        if let Some(c) = client.as_mut() {
            c.clear_tokens();
        }
        *client = None;
    }
    
    {
        let mut es = twitch.eventsub_connected.write().await;
        *es = false;
    }
    
    let _ = keyring::Entry::new("displaysong", "twitch_access_token")
        .ok().map(|e| e.delete_password());
    let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
        .ok().map(|e| e.delete_password());
    
    info!("Twitch disconnected");
    Ok(())
}

#[tauri::command]
pub async fn save_twitch_credentials(
    _client_id: String,
    _client_secret: String,
    _twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn twitch_delete_credentials(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    twitch_disconnect(twitch).await
}

// ============================================================================
// SETTINGS
// ============================================================================

#[tauri::command]
pub async fn twitch_get_settings(
    twitch: State<'_, TwitchState>,
) -> Result<serde_json::Value, String> {
    let mode = twitch.mode.read().await;
    let command = twitch.command.read().await;
    let cooldown = twitch.cooldown.read().await;
    let sub_only = twitch.sub_only.read().await;
    let reward_id = twitch.reward_id.read().await;
    let use_bot = *twitch.use_bot_account.read().await;
    
    Ok(serde_json::json!({
        "mode": *mode,
        "command": *command,
        "cooldown": *cooldown,
        "subOnly": *sub_only,
        "rewardId": *reward_id,
        "useBotAccount": use_bot
    }))
}

#[tauri::command]
pub async fn twitch_set_mode(
    mode: String,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    if mode != "commands" && mode != "points" {
        return Err("Ungültiger Modus".to_string());
    }
    let mut m = twitch.mode.write().await;
    *m = mode;
    Ok(())
}

#[tauri::command]
pub async fn twitch_set_command(
    command: String,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let mut cmd = twitch.command.write().await;
    *cmd = if command.starts_with('!') { command } else { format!("!{}", command) };
    Ok(())
}

#[tauri::command]
pub async fn twitch_set_cooldown(
    seconds: u32,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let mut cd = twitch.cooldown.write().await;
    *cd = seconds.min(300);
    Ok(())
}

#[tauri::command]
pub async fn twitch_set_sub_only(
    enabled: bool,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let mut sub = twitch.sub_only.write().await;
    *sub = enabled;
    Ok(())
}

#[tauri::command]
pub async fn twitch_set_reward_id(
    reward_id: Option<String>,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let mut rid = twitch.reward_id.write().await;
    *rid = reward_id;
    Ok(())
}

#[tauri::command]
pub async fn twitch_set_use_bot(
    use_bot: bool,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    {
        let mut client = twitch.client.write().await;
        if let Some(c) = client.as_mut() {
            c.set_use_bot(use_bot);
        }
    }
    let mut bot = twitch.use_bot_account.write().await;
    *bot = use_bot;
    Ok(())
}

// ============================================================================
// CHANNEL POINTS
// ============================================================================

#[tauri::command]
pub async fn twitch_get_rewards(
    twitch: State<'_, TwitchState>,
) -> Result<Vec<TwitchReward>, String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Nicht verbunden")?;
    c.get_rewards().await
}

#[tauri::command]
pub async fn twitch_create_reward(
    title: String,
    cost: u32,
    twitch: State<'_, TwitchState>,
) -> Result<TwitchReward, String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Nicht verbunden")?;
    c.create_song_request_reward(&title, cost).await
}

// ============================================================================
// CHAT
// ============================================================================

#[tauri::command]
pub async fn twitch_send_chat(
    message: String,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Nicht verbunden")?;
    c.send_chat_message(&message).await
}

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

// ============================================================================
// EVENTSUB
// ============================================================================

#[tauri::command]
pub async fn twitch_connect_eventsub(
    app: AppHandle,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    
    // Check if already connected - prevent multiple connections!
    {
        let is_connected = *twitch.eventsub_connected.read().await;
        if is_connected {
            return Ok(());
        }
    }
    
    let (client_id, access_token, user_id) = {
        let client = twitch.client.read().await;
        let c = client.as_ref().ok_or("Nicht verbunden")?;
        let user = c.get_user().ok_or("User nicht geladen")?;
        (c.get_client_id().to_string(), c.get_tokens().ok_or("Keine Tokens")?.0, user.id)
    };
    
    let reward_id = twitch.reward_id.read().await.clone();
    let command = twitch.command.read().await.clone();
    let sub_only = *twitch.sub_only.read().await;
    let mode = twitch.mode.read().await.clone();
    
    let eventsub_connected = twitch.eventsub_connected.clone();
    let http = reqwest::Client::new();
    
    tokio::spawn(async move {
        let (ws_stream, _) = match connect_async("wss://eventsub.wss.twitch.tv/ws").await {
            Ok(s) => s,
            Err(e) => {
                error!("EventSub connection failed: {}", e);
                return;
            }
        };
        
        let (mut write, mut read) = ws_stream.split();
        
        // Wait for welcome message
        let session_id = loop {
            match tokio::time::timeout(std::time::Duration::from_secs(10), read.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    if let Some(sid) = parse_eventsub_welcome(&text) {
                        break sid;
                    }
                }
                Ok(Some(Ok(Message::Ping(data)))) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Err(_) => {
                    error!("EventSub timeout waiting for welcome");
                    return;
                }
                _ => continue,
            }
        };
        
        // Subscribe to channel point redemptions if in points mode
        if mode == "points" && reward_id.is_some() {
            let sub_body = serde_json::json!({
                "type": "channel.channel_points_custom_reward_redemption.add",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": user_id,
                    "reward_id": reward_id
                },
                "transport": {
                    "method": "websocket",
                    "session_id": session_id
                }
            });
            
            let _ = http.post(format!("{}/eventsub/subscriptions", API_BASE))
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Client-Id", &client_id)
                .json(&sub_body)
                .send()
                .await;
        }
        
        // Subscribe to chat messages
        {
            let sub_body = serde_json::json!({
                "type": "channel.chat.message",
                "version": "1",
                "condition": {
                    "broadcaster_user_id": user_id,
                    "user_id": user_id
                },
                "transport": {
                    "method": "websocket",
                    "session_id": session_id
                }
            });
            
            let _ = http.post(format!("{}/eventsub/subscriptions", API_BASE))
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Client-Id", &client_id)
                .json(&sub_body)
                .send()
                .await;
        }
        
        // Mark as connected
        {
            let mut es = eventsub_connected.write().await;
            *es = true;
        }
        
        info!("EventSub connected, listening for command: {}", command);
        
        // Listen for events
        while let Some(msg_result) = read.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    if is_keepalive(&text) {
                        continue;
                    }
                    
                    if let Some(reconnect_url) = parse_reconnect_url(&text) {
                        warn!("EventSub reconnect requested: {}", reconnect_url);
                        break;
                    }
                    
                    if let Some(redemption) = parse_redemption_event(&text) {
                        let _ = app.emit_all("twitch-redemption", &redemption);
                    }
                    
                    if let Some(chat_msg) = parse_chat_message_event(&text) {
                        // Always emit raw chat message for permit system
                        let _ = app.emit_all("twitch-chat-message", serde_json::json!({
                            "userId": chat_msg.user_id,
                            "userName": chat_msg.user_name,
                            "message": chat_msg.message
                        }));
                        
                        if chat_msg.message.to_lowercase().starts_with(&command.to_lowercase()) {
                            if sub_only && !chat_msg.is_subscriber && !chat_msg.is_moderator {
                                continue;
                            }
                            
                            let parts: Vec<&str> = chat_msg.message.split_whitespace().collect();
                            
                            // Get everything after the command as input
                            let input = if parts.len() >= 2 {
                                parts[1..].join(" ")
                            } else {
                                String::new() // Empty = user wants permit
                            };
                            
                            let _ = app.emit_all("twitch-chat-command", serde_json::json!({
                                "userId": chat_msg.user_id,
                                "userName": chat_msg.user_name,
                                "spotifyInput": input,
                                "source": "command"
                            }));
                        }
                    }
                }
                Ok(Message::Ping(data)) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Ok(Message::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }
        
        {
            let mut es = eventsub_connected.write().await;
            *es = false;
        }
    });
    
    Ok(())
}

#[tauri::command]
pub async fn twitch_update_redemption(
    reward_id: String,
    redemption_id: String,
    fulfill: bool,
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Nicht verbunden")?;
    c.update_redemption(&reward_id, &redemption_id, fulfill).await
}

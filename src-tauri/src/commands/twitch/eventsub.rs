use tauri::{State, Manager, AppHandle};
use log::{info, error, warn};
use crate::twitch::{parse_eventsub_welcome, parse_redemption_event, parse_chat_message_event, is_keepalive, parse_reconnect_url, API_BASE};
use super::TwitchState;

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
    
    // If an EventSub task is already running, tell it to stop and wait for it to
    // tear down before starting a new one. This makes a mode/reward switch
    // re-subscribe with the correct subscriptions (chat vs. redemptions) instead
    // of silently keeping the old connection's subscriptions.
    {
        let already = *twitch.eventsub_connected.read().await;
        if already {
            for _ in 0..40 {
                twitch.eventsub_shutdown.notify_waiters();
                if !*twitch.eventsub_connected.read().await {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
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
    let shutdown = twitch.eventsub_shutdown.clone();
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
        
        // Subscribe to chat messages — only in command mode. In channel-points
        // mode we deliberately do NOT subscribe to chat, so chat !sr commands do
        // nothing and only redemptions create requests (and vice versa).
        if mode == "commands" {
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

            match http.post(format!("{}/eventsub/subscriptions", API_BASE))
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Client-Id", &client_id)
                .json(&sub_body)
                .send()
                .await
            {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        info!("EventSub chat subscription OK ({})", status);
                    } else {
                        let body = resp.text().await.unwrap_or_default();
                        error!("EventSub chat subscription FAILED: {} - {}", status, body);
                    }
                }
                Err(e) => error!("EventSub chat subscription request error: {}", e),
            }
        }

        // Mark as connected
        {
            let mut es = eventsub_connected.write().await;
            *es = true;
        }
        
        info!("EventSub connected, listening for command: {}", command);
        
        // Listen for events until a shutdown is requested (e.g. on mode switch).
        loop {
            let msg_result = tokio::select! {
                _ = shutdown.notified() => {
                    info!("EventSub shutdown requested (reconnect)");
                    break;
                }
                maybe = read.next() => match maybe {
                    Some(m) => m,
                    None => break,
                },
            };
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
                            
                            info!("Chat command '{}' from {} (input: '{}')", command, chat_msg.user_name, input);
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


use tauri::State;
use crate::twitch::TwitchReward;
use super::TwitchState;

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
    // Empty (or whitespace-only) messages are intentionally not sent — this lets
    // users clear a chat-message template to disable that particular message.
    if message.trim().is_empty() {
        return Ok(());
    }
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Nicht verbunden")?;
    c.send_chat_message(&message).await
}


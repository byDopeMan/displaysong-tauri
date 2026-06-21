use tauri::State;
use super::TwitchState;

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

/// Returns the required Twitch scopes the current token is missing.
/// Empty = up to date. Non-empty = the user should reconnect (e.g. after the
/// app added new scopes like channel point redemptions).
#[tauri::command]
pub async fn twitch_check_scopes(
    twitch: State<'_, TwitchState>,
) -> Result<Vec<String>, String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Twitch nicht verbunden")?;
    c.missing_scopes().await
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


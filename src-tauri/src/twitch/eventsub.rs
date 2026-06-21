use super::{TwitchRedemption, TwitchChatMessage};

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

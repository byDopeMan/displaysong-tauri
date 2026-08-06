use super::{
    TwitchRedemption, TwitchChatMessage,
    TwitchFollowEvent, TwitchSubscribeEvent, TwitchRaidEvent, TwitchCheerEvent,
};

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

/// The EventSub notification's unique message id (`metadata.message_id`).
/// Twitch may deliver the same notification more than once, so callers cache the
/// last N ids and drop repeats.
pub fn parse_message_id(message: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    json["metadata"]["message_id"].as_str().map(|s| s.to_string())
}

/// Helper: return the event object for a notification of the given subscription
/// type, or None if this message isn't that notification.
fn notification_event<'a>(json: &'a serde_json::Value, sub_type: &str) -> Option<&'a serde_json::Value> {
    if json["metadata"]["message_type"].as_str()? != "notification" {
        return None;
    }
    if json["metadata"]["subscription_type"].as_str()? != sub_type {
        return None;
    }
    Some(&json["payload"]["event"])
}

/// Parse a `channel.follow` (v2) notification.
pub fn parse_follow_event(message: &str) -> Option<TwitchFollowEvent> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    let event = notification_event(&json, "channel.follow")?;
    Some(TwitchFollowEvent {
        user_id: event["user_id"].as_str()?.to_string(),
        user_name: event["user_name"].as_str().unwrap_or("").to_string(),
    })
}

/// Parse a `channel.raid` notification (incoming raid → us).
pub fn parse_raid_event(message: &str) -> Option<TwitchRaidEvent> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    let event = notification_event(&json, "channel.raid")?;
    Some(TwitchRaidEvent {
        from_id: event["from_broadcaster_user_id"].as_str().unwrap_or("").to_string(),
        from_name: event["from_broadcaster_user_name"].as_str().unwrap_or("").to_string(),
        viewers: event["viewers"].as_u64().unwrap_or(0) as u32,
    })
}

/// Parse a `channel.cheer` notification.
pub fn parse_cheer_event(message: &str) -> Option<TwitchCheerEvent> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    let event = notification_event(&json, "channel.cheer")?;
    let is_anonymous = event["is_anonymous"].as_bool().unwrap_or(false);
    Some(TwitchCheerEvent {
        user_id: event["user_id"].as_str().unwrap_or("").to_string(),
        user_name: if is_anonymous {
            "Anonymous".to_string()
        } else {
            event["user_name"].as_str().unwrap_or("").to_string()
        },
        bits: event["bits"].as_u64().unwrap_or(0) as u32,
        message: event["message"].as_str().unwrap_or("").to_string(),
    })
}

/// Parse a subscription notification, normalizing the three EventSub types into
/// exactly one `TwitchSubscribeEvent` per real event:
/// - `channel.subscribe`          → new sub. A gift here (`is_gift=true`) is
///   IGNORED (returns None) because the gifter is reported via
///   `channel.subscription.gift`; otherwise the recipient would double-count.
/// - `channel.subscription.message` → resub (carries `message` + months).
/// - `channel.subscription.gift`    → the gifter (carries `total`).
pub fn parse_subscribe_event(message: &str) -> Option<TwitchSubscribeEvent> {
    let json: serde_json::Value = serde_json::from_str(message).ok()?;
    if json["metadata"]["message_type"].as_str()? != "notification" {
        return None;
    }
    let sub_type = json["metadata"]["subscription_type"].as_str()?;
    let event = &json["payload"]["event"];

    match sub_type {
        "channel.subscribe" => {
            // Gift subs arrive again via subscription.gift — drop the duplicate.
            if event["is_gift"].as_bool().unwrap_or(false) {
                return None;
            }
            Some(TwitchSubscribeEvent {
                user_id: event["user_id"].as_str().unwrap_or("").to_string(),
                user_name: event["user_name"].as_str().unwrap_or("").to_string(),
                tier: normalize_tier(event["tier"].as_str().unwrap_or("1000")),
                is_gift: false,
                cumulative_months: 1,
                streak_months: 0,
                message: String::new(),
                total: 0,
                recipient_name: None,
            })
        }
        "channel.subscription.message" => Some(TwitchSubscribeEvent {
            user_id: event["user_id"].as_str().unwrap_or("").to_string(),
            user_name: event["user_name"].as_str().unwrap_or("").to_string(),
            tier: normalize_tier(event["tier"].as_str().unwrap_or("1000")),
            is_gift: false,
            cumulative_months: event["cumulative_months"].as_u64().unwrap_or(1) as u32,
            streak_months: event["streak_months"].as_u64().unwrap_or(0) as u32,
            message: event["message"]["text"].as_str().unwrap_or("").to_string(),
            total: 0,
            recipient_name: None,
        }),
        "channel.subscription.gift" => {
            let is_anonymous = event["is_anonymous"].as_bool().unwrap_or(false);
            Some(TwitchSubscribeEvent {
                user_id: event["user_id"].as_str().unwrap_or("").to_string(),
                user_name: if is_anonymous {
                    "Anonymous".to_string()
                } else {
                    event["user_name"].as_str().unwrap_or("").to_string()
                },
                tier: normalize_tier(event["tier"].as_str().unwrap_or("1000")),
                is_gift: true,
                cumulative_months: 0,
                streak_months: 0,
                message: String::new(),
                total: event["total"].as_u64().unwrap_or(1) as u32,
                recipient_name: None,
            })
        }
        _ => None,
    }
}

/// Twitch sends "1000"/"2000"/"3000" for tiers and "prime" is signalled via the
/// `is_prime` flag on some payloads; we keep the raw tier string, mapping the
/// empty/prime case to "prime".
fn normalize_tier(tier: &str) -> String {
    match tier {
        "" | "prime" | "Prime" => "prime".to_string(),
        other => other.to_string(),
    }
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

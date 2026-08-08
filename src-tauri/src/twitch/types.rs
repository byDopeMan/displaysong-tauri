use serde::Serialize;

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

// ---------------------------------------------------------------------------
// EventSub alert payloads that plugins can subscribe to (Follow/Sub/Raid/Cheer).
// These are the normalized shapes emitted to the frontend as Tauri events
// (`twitch-follow`, `twitch-subscribe`, `twitch-raid`, `twitch-cheer`).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct TwitchFollowEvent {
    pub user_id: String,
    pub user_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchSubscribeEvent {
    pub user_id: String,
    pub user_name: String,
    /// "1000" | "2000" | "3000" | "prime"
    pub tier: String,
    pub is_gift: bool,
    pub cumulative_months: u32,
    pub streak_months: u32,
    pub message: String,
    /// Number of subs in a gift (gift events only), else 0.
    pub total: u32,
    pub recipient_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchRaidEvent {
    pub from_id: String,
    pub from_name: String,
    pub viewers: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct TwitchCheerEvent {
    pub user_id: String,
    pub user_name: String,
    pub bits: u32,
    pub message: String,
}

/// channel.update — stream title / category changed.
#[derive(Debug, Clone, Serialize)]
pub struct TwitchCategoryChange {
    pub category_id: String,
    pub category_name: String,
    pub title: String,
}

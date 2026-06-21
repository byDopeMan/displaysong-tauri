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

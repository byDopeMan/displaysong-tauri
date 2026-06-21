use std::sync::Arc;
use tokio::sync::{RwLock, Notify};
use crate::twitch::{TwitchClient, TwitchUser};

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
    /// Signals the running EventSub task to tear down, so a reconnect (e.g. after
    /// switching request mode) can re-subscribe with the correct subscriptions.
    pub eventsub_shutdown: Arc<Notify>,
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
            eventsub_shutdown: Arc::new(Notify::new()),
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

mod connection;
mod settings;
mod rewards;
mod requests;
mod eventsub;

pub use connection::*;
pub use settings::*;
pub use rewards::*;
pub use requests::*;
pub use eventsub::*;

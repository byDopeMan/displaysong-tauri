const AUTH_URL: &str = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const REVOKE_URL: &str = "https://id.twitch.tv/oauth2/revoke";
pub const API_BASE: &str = "https://api.twitch.tv/helix";
const REDIRECT_URI: &str = "http://localhost:8889/callback";

// Worker API URLs
const BOT_API_URL: &str = "https://displaysong-api.bydopeman.workers.dev/api/bot-credentials";
const APP_API_URL: &str = "https://displaysong-api.bydopeman.workers.dev/api/app-credentials";

// Scopes für Chat und Channel Points
// - channel:read:redemptions + channel:manage:redemptions = für Channel Points
// - user:read:chat + user:write:chat = für Chat lesen und senden
// - chat:read + chat:edit = legacy IRC chat (backup)
// - moderator:read:chatters = zum lesen der Chat-Nachrichten via EventSub
const SCOPES: &str = "channel:read:redemptions channel:manage:redemptions user:read:chat user:write:chat chat:read chat:edit user:read:email moderator:read:chatters";

mod types;
mod credentials;
mod client;
mod eventsub;
mod oauth;

pub use types::*;
pub use credentials::*;
pub use client::*;
pub use eventsub::*;
pub use oauth::*;

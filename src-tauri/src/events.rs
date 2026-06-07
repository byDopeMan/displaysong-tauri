#![allow(dead_code)] // Event system prepared for future plugin API

// ============================================================================
// EVENT SYSTEM - Extended events for plugins
// ============================================================================

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use serde::{Deserialize, Serialize};
use log::info;

/// Event types that plugins can subscribe to
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum EventType {
    // Track Events
    TrackChange,
    TrackPlay,
    TrackPause,
    TrackProgress,
    
    // Queue Events
    QueueAdd,
    QueueRemove,
    QueuePlay,
    QueueClear,
    
    // Twitch Events
    TwitchChat,
    TwitchRedemption,
    TwitchFollow,
    TwitchSubscribe,
    TwitchRaid,
    
    // App Events
    AppReady,
    AppMinimize,
    AppRestore,
    AppClose,
    
    // Widget Events
    WidgetShow,
    WidgetHide,
    WidgetMove,
    
    // Plugin Events
    PluginLoad,
    PluginUnload,
    
    // Custom events from plugins
    Custom(String),
}

/// Event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub event_type: EventType,
    pub data: serde_json::Value,
    pub timestamp: i64,
    pub source: String,
}

impl Event {
    pub fn new(event_type: EventType, data: serde_json::Value, source: &str) -> Self {
        Self {
            event_type,
            data,
            timestamp: chrono::Utc::now().timestamp_millis(),
            source: source.to_string(),
        }
    }
}

/// Event bus for broadcasting events
pub struct EventBus {
    sender: broadcast::Sender<Event>,
    _receiver: broadcast::Receiver<Event>,
}

impl EventBus {
    pub fn new() -> Self {
        let (sender, receiver) = broadcast::channel(1000);
        Self {
            sender,
            _receiver: receiver,
        }
    }
    
    /// Emit an event
    pub fn emit(&self, event: Event) {
        let _ = self.sender.send(event);
    }
    
    /// Emit a simple event with JSON data
    pub fn emit_simple(&self, event_type: EventType, data: serde_json::Value, source: &str) {
        self.emit(Event::new(event_type, data, source));
    }
    
    /// Subscribe to events
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl Clone for EventBus {
    fn clone(&self) -> Self {
        Self {
            sender: self.sender.clone(),
            _receiver: self.sender.subscribe(),
        }
    }
}

/// Event handler registry for plugins
pub struct EventRegistry {
    handlers: Arc<RwLock<HashMap<String, Vec<EventHandler>>>>,
}

#[derive(Clone)]
pub struct EventHandler {
    pub plugin_id: String,
    pub event_type: EventType,
    pub handler_id: String,
}

impl EventRegistry {
    pub fn new() -> Self {
        Self {
            handlers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Register an event handler for a plugin
    pub async fn register(&self, plugin_id: &str, event_type: EventType) -> String {
        let handler_id = format!("{}_{:?}_{}", plugin_id, event_type, uuid::Uuid::new_v4());
        let key = format!("{:?}", event_type);
        
        let handler = EventHandler {
            plugin_id: plugin_id.to_string(),
            event_type,
            handler_id: handler_id.clone(),
        };
        
        let mut handlers = self.handlers.write().await;
        handlers.entry(key).or_insert_with(Vec::new).push(handler);
        
        handler_id
    }
    
    /// Unregister a handler
    pub async fn unregister(&self, handler_id: &str) {
        let mut handlers = self.handlers.write().await;
        for handlers_list in handlers.values_mut() {
            handlers_list.retain(|h| h.handler_id != handler_id);
        }
    }
    
    /// Unregister all handlers for a plugin
    pub async fn unregister_plugin(&self, plugin_id: &str) {
        let mut handlers = self.handlers.write().await;
        for handlers_list in handlers.values_mut() {
            handlers_list.retain(|h| h.plugin_id != plugin_id);
        }
        info!("Unregistered all handlers for plugin: {}", plugin_id);
    }
    
    /// Get handlers for an event type
    pub async fn get_handlers(&self, event_type: &EventType) -> Vec<EventHandler> {
        let key = format!("{:?}", event_type);
        let handlers = self.handlers.read().await;
        handlers.get(&key).cloned().unwrap_or_default()
    }
}

impl Default for EventRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// UUID generation without external crate
mod uuid {
    use std::sync::atomic::{AtomicU64, Ordering};
    
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    
    pub struct Uuid;
    
    impl Uuid {
        pub fn new_v4() -> String {
            let count = COUNTER.fetch_add(1, Ordering::SeqCst);
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            format!("{:x}{:x}", now, count)
        }
    }
}

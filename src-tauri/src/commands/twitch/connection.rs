use tauri::State;
use log::{info, error};
use crate::twitch::{TwitchClient, start_oauth_server, fetch_app_credentials};
use super::{TwitchState, TwitchConnectionInfo};

// ============================================================================
// CREDENTIALS & AUTH
// ============================================================================

#[tauri::command]
pub async fn twitch_connect(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    let client = TwitchClient::from_app_credentials().await?;
    
    {
        let mut twitch_client = twitch.client.write().await;
        *twitch_client = Some(client);
    }
    
    let url = {
        let client = twitch.client.read().await;
        let c = client.as_ref().ok_or("Client nicht initialisiert")?;
        c.get_auth_url()
    };
    
    if let Err(e) = open::that(&url) {
        return Err(format!("Browser konnte nicht geöffnet werden: {}", e));
    }
    
    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        if let Err(e) = start_oauth_server(tx).await {
            error!("Twitch OAuth server error: {}", e);
        }
    });
    
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        rx
    ).await
        .map_err(|_| "Timeout - OAuth nicht abgeschlossen")?
        .map_err(|_| "OAuth Callback fehlgeschlagen")?;
    
    {
        let mut client = twitch.client.write().await;
        let c = client.as_mut().ok_or("Client nicht initialisiert")?;
        c.exchange_code(&code).await?;
        
        if let Some((access, refresh)) = c.get_tokens() {
            let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                .ok().map(|e| e.set_password(&access));
            let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                .ok().map(|e| e.set_password(&refresh));
        }
    }
    
    info!("Twitch connected");
    Ok(())
}

#[tauri::command]
pub async fn check_twitch_credentials(
    twitch: State<'_, TwitchState>,
) -> Result<bool, String> {
    let access = keyring::Entry::new("displaysong", "twitch_access_token")
        .ok()
        .and_then(|e| e.get_password().ok());
    let refresh = keyring::Entry::new("displaysong", "twitch_refresh_token")
        .ok()
        .and_then(|e| e.get_password().ok());
    
    let (access_token, refresh_token) = match (access, refresh) {
        (Some(a), Some(r)) => (a, r),
        _ => return Ok(false),
    };
    
    let app_creds = match fetch_app_credentials().await {
        Ok(c) => c,
        Err(_) => return Ok(false),
    };
    
    let mut client = TwitchClient::new(&app_creds.client_id, &app_creds.client_secret);
    client.set_tokens(&access_token, &refresh_token);
    
    match client.validate_token().await {
        Ok(true) => {
            if client.fetch_user_info().await.is_ok() {
                let mut twitch_client = twitch.client.write().await;
                *twitch_client = Some(client);
                return Ok(true);
            }
        }
        _ => {
            if client.force_refresh().await.is_ok() {
                if let Some((a, r)) = client.get_tokens() {
                    let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                        .ok().map(|e| e.set_password(&a));
                    let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                        .ok().map(|e| e.set_password(&r));
                }
                
                if client.fetch_user_info().await.is_ok() {
                    let mut twitch_client = twitch.client.write().await;
                    *twitch_client = Some(client);
                    return Ok(true);
                }
            }
        }
    }
    
    Ok(false)
}

#[tauri::command]
pub async fn twitch_get_auth_url(
    twitch: State<'_, TwitchState>,
) -> Result<String, String> {
    let client = twitch.client.read().await;
    let c = client.as_ref().ok_or("Twitch nicht konfiguriert")?;
    Ok(c.get_auth_url())
}

#[tauri::command]
pub async fn twitch_start_auth(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    {
        let client = twitch.client.read().await;
        if client.is_none() {
            drop(client);
            let new_client = TwitchClient::from_app_credentials().await?;
            let mut twitch_client = twitch.client.write().await;
            *twitch_client = Some(new_client);
        }
    }
    
    let url = {
        let client = twitch.client.read().await;
        let c = client.as_ref().ok_or("Twitch nicht konfiguriert")?;
        c.get_auth_url()
    };

    if let Err(e) = open::that(&url) {
        return Err(format!("Browser konnte nicht geöffnet werden: {}", e));
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    
    tokio::spawn(async move {
        if let Err(e) = start_oauth_server(tx).await {
            error!("Twitch OAuth server error: {}", e);
        }
    });

    let code = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        rx
    ).await
        .map_err(|_| "Timeout - OAuth nicht abgeschlossen")?
        .map_err(|_| "OAuth Callback fehlgeschlagen")?;

    {
        let mut client = twitch.client.write().await;
        let c = client.as_mut().ok_or("Twitch nicht konfiguriert")?;
        c.exchange_code(&code).await?;
        
        if let Some((access, refresh)) = c.get_tokens() {
            let _ = keyring::Entry::new("displaysong", "twitch_access_token")
                .ok().map(|e| e.set_password(&access));
            let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
                .ok().map(|e| e.set_password(&refresh));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn twitch_get_connection(
    twitch: State<'_, TwitchState>,
) -> Result<TwitchConnectionInfo, String> {
    let client = twitch.client.read().await;
    let eventsub = *twitch.eventsub_connected.read().await;
    let use_bot = *twitch.use_bot_account.read().await;
    
    if let Some(c) = client.as_ref() {
        Ok(TwitchConnectionInfo {
            connected: c.is_authenticated(),
            user: c.get_user(),
            eventsub_connected: eventsub,
            use_bot_account: use_bot,
            scopes: c.get_scopes(),
        })
    } else {
        Ok(TwitchConnectionInfo {
            connected: false,
            user: None,
            eventsub_connected: false,
            use_bot_account: use_bot,
            scopes: Vec::new(),
        })
    }
}

#[tauri::command]
pub async fn twitch_disconnect(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    {
        let client = twitch.client.read().await;
        if let Some(c) = client.as_ref() {
            let _ = c.revoke_token().await;
        }
    }
    
    {
        let mut client = twitch.client.write().await;
        if let Some(c) = client.as_mut() {
            c.clear_tokens();
        }
        *client = None;
    }
    
    {
        let mut es = twitch.eventsub_connected.write().await;
        *es = false;
    }
    
    let _ = keyring::Entry::new("displaysong", "twitch_access_token")
        .ok().map(|e| e.delete_password());
    let _ = keyring::Entry::new("displaysong", "twitch_refresh_token")
        .ok().map(|e| e.delete_password());
    
    info!("Twitch disconnected");
    Ok(())
}

#[tauri::command]
pub async fn save_twitch_credentials(
    _client_id: String,
    _client_secret: String,
    _twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn twitch_delete_credentials(
    twitch: State<'_, TwitchState>,
) -> Result<(), String> {
    twitch_disconnect(twitch).await
}


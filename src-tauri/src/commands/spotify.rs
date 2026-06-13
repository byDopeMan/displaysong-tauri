// ============================================================================
// SPOTIFY COMMANDS
// ============================================================================

use std::sync::Arc;
use tauri::{AppHandle, State, Manager};
use log::info;

use crate::state::{AppState, AppStatus};
use crate::spotify;
use crate::credentials;
use crate::polling;

#[tauri::command]
pub async fn get_track(state: State<'_, Arc<AppState>>) -> Result<Option<spotify::TrackInfo>, String> {
    let track = state.current_track.lock().await.clone();
    Ok(track)
}

#[tauri::command]
pub async fn get_track_history(state: State<'_, Arc<AppState>>) -> Result<Vec<spotify::TrackInfo>, String> {
    let history = state.track_history.lock().await.clone();
    Ok(history)
}

#[tauri::command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<AppStatus, String> {
    let status = state.status.lock().await;
    Ok(AppStatus {
        spotify_connected: status.spotify_connected,
        is_polling: status.is_polling,
        last_error: status.last_error.clone(),
        polling_interval: status.polling_interval,
    })
}

#[tauri::command]
pub async fn save_credentials(
    client_id: String,
    client_secret: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    credentials::save(&client_id, &client_secret)?;
    
    let client = spotify::SpotifyClient::new(&client_id, &client_secret);
    *state.spotify.lock().await = Some(client);
    
    info!("Credentials gespeichert");
    Ok(())
}

#[tauri::command]
pub async fn get_auth_url(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    let spotify = state.spotify.lock().await;
    let client = spotify.as_ref().ok_or("Keine Credentials")?;
    Ok(client.get_auth_url())
}

#[tauri::command]
pub async fn start_auth_server(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let state_clone = state.inner().clone();
    let app_clone = app.clone();
    
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_auth_server(app_clone, state_clone).await {
            eprintln!("Auth server error: {}", e);
        }
    });
    
    Ok(())
}

async fn run_auth_server(app: AppHandle, state: Arc<AppState>) -> Result<(), String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    
    let listener = TcpListener::bind("127.0.0.1:8888").await
        .map_err(|e| format!("Server bind failed: {}", e))?;
    
    info!("Auth server listening on 127.0.0.1:8888");
    
    let (mut socket, _) = listener.accept().await
        .map_err(|e| format!("Accept failed: {}", e))?;
    
    let mut buffer = [0; 2048];
    let n = socket.read(&mut buffer).await
        .map_err(|e| format!("Read failed: {}", e))?;
    
    let request = String::from_utf8_lossy(&buffer[..n]);
    
    let code = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| {
            if path.starts_with("/callback?code=") {
                Some(path.trim_start_matches("/callback?code=").split('&').next().unwrap_or(""))
            } else {
                None
            }
        });
    
    let response = if let Some(code) = code {
        let mut spotify = state.spotify.lock().await;
        if let Some(client) = spotify.as_mut() {
            match client.exchange_code(code).await {
                Ok(_) => {
                    if let Some((access, refresh)) = client.get_tokens() {
                        let _ = credentials::save_tokens(&access, &refresh);
                    }
                    
                    state.status.lock().await.spotify_connected = true;
                    let _ = app.emit_all("auth-success", ());
                    
                    // DO NOT auto-start polling here!
                    // Let the frontend control when to poll based on provider setting
                    // The frontend will call start_spotify_polling if needed
                    
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Erfolgreich!</h1><p>Du kannst dieses Fenster schliessen.</p><script>window.close()</script></body></html>"
                }
                Err(e) => {
                    let _ = app.emit_all("auth-error", e.clone());
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n<html><body><h1>Fehler</h1><p>Authentifizierung fehlgeschlagen.</p></body></html>"
                }
            }
        } else {
            "HTTP/1.1 500 Error\r\n\r\nNo client"
        }
    } else {
        "HTTP/1.1 400 Bad Request\r\n\r\nNo code"
    };
    
    socket.write_all(response.as_bytes()).await
        .map_err(|e| format!("Write failed: {}", e))?;
    
    info!("Auth server finished");
    Ok(())
}

#[tauri::command]
pub async fn disconnect_spotify(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let _ = state.shutdown_tx.send(true);
    
    *state.spotify.lock().await = None;
    *state.current_track.lock().await = None;
    state.status.lock().await.spotify_connected = false;
    
    credentials::delete()?;
    
    info!("Spotify getrennt");
    Ok(())
}

#[tauri::command]
pub async fn check_credentials(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<bool, String> {
    {
        let status = state.status.lock().await;
        if status.spotify_connected && status.is_polling {
            info!("Bereits verbunden und Polling aktiv");
            return Ok(true);
        }
    }
    
    if let Ok((client_id, client_secret)) = credentials::load() {
        let mut client = spotify::SpotifyClient::new(&client_id, &client_secret);
        
        if let Ok((access, refresh)) = credentials::load_tokens() {
            client.set_tokens(&access, &refresh);
            
            if client.refresh_if_needed().await.is_ok() {
                if let Some((new_access, new_refresh)) = client.get_tokens() {
                    let _ = credentials::save_tokens(&new_access, &new_refresh);
                }
                
                *state.spotify.lock().await = Some(client);
                state.status.lock().await.spotify_connected = true;
                
                // DO NOT auto-start polling here!
                // Let the frontend control when to poll based on provider setting
                // Just return that credentials are valid
                
                return Ok(true);
            }
        }
        
        *state.spotify.lock().await = Some(client);
    }
    
    Ok(false)
}

// ============================================================================
// POLLING CONTROL
// ============================================================================

/// Start Spotify polling (called by frontend when provider is set to Spotify)
#[tauri::command]
pub async fn start_spotify_polling(
    app: AppHandle,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let is_polling = state.status.lock().await.is_polling;
    if is_polling {
        info!("Spotify polling already running");
        return Ok(());
    }
    
    let spotify = state.spotify.lock().await;
    if spotify.is_none() {
        return Err("Spotify nicht verbunden".to_string());
    }
    drop(spotify);
    
    let state_clone = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        polling::start_polling(app, state_clone).await;
    });
    
    info!("Spotify polling started by frontend");
    Ok(())
}

/// Stop Spotify polling
#[tauri::command]
pub async fn stop_spotify_polling(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let _ = state.shutdown_tx.send(true);
    info!("Spotify polling stopped by frontend");
    Ok(())
}

// ============================================================================
// PLAYBACK CONTROL (für Plugins wie TwitchConnect)
// ============================================================================

#[tauri::command]
pub async fn add_to_queue(
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    // Token refreshen falls nötig
    client.refresh_if_needed().await?;

    // Zur Queue hinzufügen (bei 401 Token erzwingen und einmal wiederholen)
    if let Err(e) = client.add_to_queue(&uri).await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.add_to_queue(&uri).await?;
        } else {
            return Err(e);
        }
    }

    info!("Zur Queue hinzugefügt: {}", uri);
    Ok(())
}

#[tauri::command]
pub async fn play_track(
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    // Token refreshen falls nötig
    client.refresh_if_needed().await?;

    // Track abspielen (bei 401 Token erzwingen und einmal wiederholen)
    if let Err(e) = client.play_track(&uri).await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.play_track(&uri).await?;
        } else {
            return Err(e);
        }
    }

    info!("Track abgespielt: {}", uri);
    Ok(())
}

#[tauri::command]
pub async fn spotify_pause(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;

    if let Err(e) = client.pause().await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.pause().await?;
        } else {
            return Err(e);
        }
    }

    info!("Spotify pausiert");
    Ok(())
}

#[tauri::command]
pub async fn spotify_resume(
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;

    if let Err(e) = client.resume().await {
        if e.contains("401") || e.contains("expired") {
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.resume().await?;
        } else {
            return Err(e);
        }
    }

    info!("Spotify fortgesetzt");
    Ok(())
}

/// Get track info by Spotify URI or track ID
#[tauri::command]
pub async fn get_track_info(
    track_id: String,
    state: State<'_, Arc<AppState>>
) -> Result<spotify::TrackInfo, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;

    client.refresh_if_needed().await?;
    match client.get_track_info(&track_id).await {
        Ok(info) => Ok(info),
        Err(e) if e.contains("401") || e.contains("expired") => {
            // Token expired mid-flight — force a refresh and retry once.
            client.force_refresh().await?;
            if let Some((access, refresh)) = client.get_tokens() {
                let _ = credentials::save_tokens(&access, &refresh);
            }
            client.get_track_info(&track_id).await
        }
        Err(e) => Err(e),
    }
}

// ============================================================================
// PLAYLIST MANAGEMENT (für Song Request Historie)
// ============================================================================

/// Check if we have all required scopes
#[tauri::command]
pub async fn check_spotify_scopes(
    state: State<'_, Arc<AppState>>
) -> Result<Vec<String>, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.check_scopes().await
}

/// Create a new playlist
#[tauri::command]
pub async fn create_spotify_playlist(
    name: String,
    description: String,
    public: bool,
    state: State<'_, Arc<AppState>>
) -> Result<String, String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.create_playlist(&name, &description, public).await
}

/// Add track to playlist
#[tauri::command]
pub async fn add_to_spotify_playlist(
    playlist_id: String,
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.add_to_playlist(&playlist_id, &uri).await
}

/// Remove track from playlist
#[tauri::command]
pub async fn remove_from_spotify_playlist(
    playlist_id: String,
    uri: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.remove_from_playlist(&playlist_id, &uri).await
}

/// Delete playlist
#[tauri::command]
pub async fn delete_spotify_playlist(
    playlist_id: String,
    state: State<'_, Arc<AppState>>
) -> Result<(), String> {
    let mut spotify = state.spotify.lock().await;
    let client = spotify.as_mut().ok_or("Nicht mit Spotify verbunden")?;
    
    client.refresh_if_needed().await?;
    client.delete_playlist(&playlist_id).await
}

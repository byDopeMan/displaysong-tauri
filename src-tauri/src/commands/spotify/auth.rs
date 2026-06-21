use std::sync::Arc;
use tauri::{AppHandle, State, Manager};
use log::info;
use crate::state::AppState;
use crate::spotify;
use crate::credentials;

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
    _app: AppHandle,
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


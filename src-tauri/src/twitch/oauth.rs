use log::info;

// ============================================================================
// OAuth Server
// ============================================================================

pub async fn start_oauth_server(
    tx: tokio::sync::oneshot::Sender<String>,
) -> Result<(), String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let listener = TcpListener::bind("127.0.0.1:8889").await
        .map_err(|e| format!("Bind failed: {}", e))?;

    info!("Twitch OAuth server listening on :8889");

    let (mut socket, _) = listener.accept().await
        .map_err(|e| format!("Accept failed: {}", e))?;

    let mut buf = [0u8; 4096];
    let n = socket.read(&mut buf).await
        .map_err(|e| format!("Read failed: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);
    
    // Extract code
    let code = request.lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| path.split('?').nth(1))
        .and_then(|query| query.split('&').find(|p| p.starts_with("code=")))
        .and_then(|p| p.strip_prefix("code="))
        .map(|s| s.to_string());

    let response = if code.is_some() {
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='font-family:system-ui;text-align:center;padding:50px;background:#0e0e10;color:white'>\
        <h1 style='color:#9146ff'>✓ Twitch verbunden!</h1>\
        <p>Du kannst dieses Fenster schließen.</p>\
        <script>setTimeout(()=>window.close(),2000)</script>\
        </body></html>"
    } else {
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='font-family:system-ui;text-align:center;padding:50px;background:#0e0e10;color:white'>\
        <h1 style='color:#ef4444'>✗ Fehler</h1>\
        <p>Autorisierung fehlgeschlagen.</p>\
        </body></html>"
    };

    socket.write_all(response.as_bytes()).await.ok();
    socket.shutdown().await.ok();

    if let Some(code) = code {
        let _ = tx.send(code);
    }

    Ok(())
}


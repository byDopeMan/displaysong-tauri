use keyring::Entry;
use log::debug;

const SERVICE: &str = "displaysong";

pub fn save(client_id: &str, client_secret: &str) -> Result<(), String> {
    let id_entry = Entry::new(SERVICE, "client_id")
        .map_err(|e| format!("Keyring error: {}", e))?;
    let secret_entry = Entry::new(SERVICE, "client_secret")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    id_entry.set_password(client_id)
        .map_err(|e| format!("Speichern fehlgeschlagen: {}", e))?;
    secret_entry.set_password(client_secret)
        .map_err(|e| format!("Speichern fehlgeschlagen: {}", e))?;
    
    debug!("Credentials gespeichert");
    Ok(())
}

pub fn load() -> Result<(String, String), String> {
    let id_entry = Entry::new(SERVICE, "client_id")
        .map_err(|e| format!("Keyring error: {}", e))?;
    let secret_entry = Entry::new(SERVICE, "client_secret")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    let client_id = id_entry.get_password()
        .map_err(|_| "Client ID nicht gefunden")?;
    let client_secret = secret_entry.get_password()
        .map_err(|_| "Client Secret nicht gefunden")?;
    
    debug!("Credentials geladen");
    Ok((client_id, client_secret))
}

pub fn save_tokens(access_token: &str, refresh_token: &str) -> Result<(), String> {
    let access_entry = Entry::new(SERVICE, "access_token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    let refresh_entry = Entry::new(SERVICE, "refresh_token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    access_entry.set_password(access_token)
        .map_err(|e| format!("Speichern fehlgeschlagen: {}", e))?;
    refresh_entry.set_password(refresh_token)
        .map_err(|e| format!("Speichern fehlgeschlagen: {}", e))?;
    
    debug!("Tokens gespeichert");
    Ok(())
}

pub fn load_tokens() -> Result<(String, String), String> {
    let access_entry = Entry::new(SERVICE, "access_token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    let refresh_entry = Entry::new(SERVICE, "refresh_token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    
    let access_token = access_entry.get_password()
        .map_err(|_| "Access Token nicht gefunden")?;
    let refresh_token = refresh_entry.get_password()
        .map_err(|_| "Refresh Token nicht gefunden")?;
    
    debug!("Tokens geladen");
    Ok((access_token, refresh_token))
}

pub fn delete() -> Result<(), String> {
    let entries = ["client_id", "client_secret", "access_token", "refresh_token"];
    
    for key in entries {
        if let Ok(entry) = Entry::new(SERVICE, key) {
            let _ = entry.delete_password();
        }
    }
    
    debug!("Credentials gelöscht");
    Ok(())
}

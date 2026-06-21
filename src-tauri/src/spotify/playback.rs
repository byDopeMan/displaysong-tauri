use super::*;
use log::debug;

impl SpotifyClient {
    pub async fn get_currently_playing(&self) -> Result<Option<TrackInfo>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/me/player/currently-playing", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("API request failed: {}", e))?;

        if response.status().as_u16() == 204 {
            return Ok(None);
        }

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let data: CurrentlyPlaying = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let item = match data.item {
            Some(i) => i,
            None => return Ok(None),
        };

        let album_cover = item.album.images
            .iter()
            .max_by_key(|img| img.width.unwrap_or(0))
            .map(|img| img.url.clone())
            .unwrap_or_default();

        let artist = item.artists
            .iter()
            .map(|a| a.name.clone())
            .collect::<Vec<_>>()
            .join(", ");

        Ok(Some(TrackInfo {
            track: item.name,
            artist,
            album: item.album.name,
            album_cover,
            is_playing: data.is_playing,
            progress_ms: data.progress_ms.unwrap_or(0),
            duration_ms: item.duration_ms,
            color: None,
            track_id: Some(item.id),
        }))
    }

    /// Song zur Warteschlange hinzufügen
    pub async fn add_to_queue(&self, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Adding to queue: {}", uri);

        // Spotify API requires Content-Length header, send empty body
        let response = self.http
            .post(format!("{}/me/player/queue", API_BASE))
            .bearer_auth(token)
            .query(&[("uri", uri)])
            .header("Content-Length", "0")
            .body("")
            .send()
            .await
            .map_err(|e| format!("Queue request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 204 {
            debug!("Added to queue successfully");
            return Ok(());
        }

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if status.as_u16() == 403 {
            return Err("Spotify Premium erforderlich für diese Funktion.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Queue failed: {} - {}", status, error));
        }

        debug!("Added to queue successfully");
        Ok(())
    }

    /// Song direkt abspielen
    pub async fn play_track(&self, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Playing track: {}", uri);

        let body = serde_json::json!({
            "uris": [uri]
        });

        let response = self.http
            .put(format!("{}/me/player/play", API_BASE))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Play request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if status.as_u16() == 403 {
            return Err("Spotify Premium erforderlich für diese Funktion.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Play failed: {} - {}", status, error));
        }

        debug!("Playing track successfully");
        Ok(())
    }

    /// Wiedergabe pausieren (z.B. um einen YouTube-only Request dazwischen zu spielen)
    pub async fn pause(&self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .put(format!("{}/me/player/pause", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Pause request failed: {}", e))?;

        let status = response.status();

        // 404 = kein aktives Gerät / nichts spielt -> als ok behandeln
        if status.as_u16() == 404 {
            return Ok(());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Pause failed: {} - {}", status, error));
        }

        Ok(())
    }

    /// Wiedergabe fortsetzen (kein Body -> Spotify spielt den aktuellen Kontext weiter)
    pub async fn resume(&self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .put(format!("{}/me/player/play", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Resume request failed: {}", e))?;

        let status = response.status();

        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden. Starte Spotify und spiele etwas ab.".to_string());
        }

        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Resume failed: {} - {}", status, error));
        }

        Ok(())
    }

    /// Skip to the next track in the active device's queue/context.
    pub async fn next(&self) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .post(format!("{}/me/player/next", API_BASE))
            .bearer_auth(token)
            .header("Content-Length", "0")
            .send()
            .await
            .map_err(|e| format!("Next request failed: {}", e))?;

        let status = response.status();
        if status.as_u16() == 404 {
            return Err("Kein aktives Gerät gefunden.".to_string());
        }
        if !status.is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Next failed: {} - {}", status, error));
        }
        Ok(())
    }

    /// Current playback volume (0-100) of the active Spotify device, if any.
    /// Used to play YouTube requests at the same volume the streamer uses.
    pub async fn get_volume(&self) -> Result<Option<u32>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/me/player", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Player request failed: {}", e))?;

        // 204 = no active device -> volume unknown
        if response.status().as_u16() == 204 {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(format!("Player query failed: {}", response.status()));
        }

        let v: serde_json::Value = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;
        let vol = v.get("device")
            .and_then(|d| d.get("volume_percent"))
            .and_then(|x| x.as_u64())
            .map(|n| n as u32);
        Ok(vol)
    }

    /// Get track info by ID
    pub async fn get_track_info(&self, track_id: &str) -> Result<TrackInfo, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        // Clean track ID (remove spotify:track: prefix if present)
        let clean_id = track_id
            .trim_start_matches("spotify:track:")
            .split('?').next()
            .unwrap_or(track_id);

        debug!("Getting track info for: {}", clean_id);

        let response = self.http
            .get(format!("{}/tracks/{}", API_BASE, clean_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Track info request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Track info failed: {}", error));
        }

        let item: TrackItem = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        let album_cover = item.album.images
            .iter()
            .max_by_key(|img| img.width.unwrap_or(0))
            .map(|img| img.url.clone())
            .unwrap_or_default();

        let artist = item.artists
            .iter()
            .map(|a| a.name.clone())
            .collect::<Vec<_>>()
            .join(", ");

        Ok(TrackInfo {
            track: item.name,
            artist,
            album: item.album.name,
            album_cover,
            is_playing: false,
            progress_ms: 0,
            duration_ms: item.duration_ms,
            color: None,
            track_id: Some(item.id),
        })
    }
}

use super::*;
use log::debug;

impl SpotifyClient {
    /// Get current user's Spotify ID
    pub async fn get_user_id(&self) -> Result<String, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let response = self.http
            .get(format!("{}/me", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("User info request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("User info failed: {}", response.status()));
        }

        #[derive(Deserialize)]
        struct UserResponse {
            id: String,
        }

        let user: UserResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(user.id)
    }

    /// Create a new playlist
    pub async fn create_playlist(&self, name: &str, description: &str, public: bool) -> Result<String, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let user_id = self.get_user_id().await?;

        debug!("Creating playlist '{}' for user {}", name, user_id);

        let body = serde_json::json!({
            "name": name,
            "description": description,
            "public": public
        });

        let response = self.http
            .post(format!("{}/users/{}/playlists", API_BASE, user_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Create playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Create playlist failed: {}", error));
        }

        #[derive(Deserialize)]
        struct PlaylistResponse {
            id: String,
        }

        let playlist: PlaylistResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        debug!("Created playlist with ID: {}", playlist.id);
        Ok(playlist.id)
    }

    /// Add track to playlist
    pub async fn add_to_playlist(&self, playlist_id: &str, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Adding {} to playlist {}", uri, playlist_id);

        let body = serde_json::json!({
            "uris": [uri]
        });

        let response = self.http
            .post(format!("{}/playlists/{}/tracks", API_BASE, playlist_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Add to playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Add to playlist failed: {}", error));
        }

        debug!("Added to playlist successfully");
        Ok(())
    }

    /// Remove track from playlist
    pub async fn remove_from_playlist(&self, playlist_id: &str, uri: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Removing {} from playlist {}", uri, playlist_id);

        let body = serde_json::json!({
            "tracks": [{"uri": uri}]
        });

        let response = self.http
            .delete(format!("{}/playlists/{}/tracks", API_BASE, playlist_id))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Remove from playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Remove from playlist failed: {}", error));
        }

        debug!("Removed from playlist successfully");
        Ok(())
    }

    /// Delete playlist (unfollow)
    pub async fn delete_playlist(&self, playlist_id: &str) -> Result<(), String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        debug!("Deleting playlist {}", playlist_id);

        let response = self.http
            .delete(format!("{}/playlists/{}/followers", API_BASE, playlist_id))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Delete playlist request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Delete playlist failed: {}", error));
        }

        debug!("Deleted playlist successfully");
        Ok(())
    }

    /// Check if we have the required scopes by testing API endpoints
    pub async fn check_scopes(&self) -> Result<Vec<String>, String> {
        let token = self.access_token.as_ref()
            .ok_or("Not authenticated")?;

        let mut missing_scopes = Vec::new();

        // Test user-read-currently-playing / user-read-playback-state
        let response = self.http
            .get(format!("{}/me/player", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Scope check failed: {}", e))?;

        if response.status().as_u16() == 403 {
            missing_scopes.push("user-read-playback-state".to_string());
        }

        // Test playlist-modify by checking if we can access user's playlists
        let response = self.http
            .get(format!("{}/me/playlists?limit=1", API_BASE))
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| format!("Scope check failed: {}", e))?;

        if response.status().as_u16() == 403 {
            missing_scopes.push("playlist-modify-public".to_string());
            missing_scopes.push("playlist-modify-private".to_string());
        }

        Ok(missing_scopes)
    }
}

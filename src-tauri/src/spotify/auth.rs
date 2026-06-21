use super::*;
use std::time::{Duration, Instant};
use log::debug;

impl SpotifyClient {
    pub fn new(client_id: &str, client_secret: &str) -> Self {
        Self {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            access_token: None,
            refresh_token: None,
            token_expiry: None,
            http: reqwest::Client::new(),
        }
    }

    pub fn get_auth_url(&self) -> String {
        format!(
            "{}?client_id={}&response_type=code&redirect_uri={}&scope={}",
            AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(REDIRECT_URI),
            urlencoding::encode(SCOPES)
        )
    }

    pub fn set_tokens(&mut self, access: &str, refresh: &str) {
        self.access_token = Some(access.to_string());
        self.refresh_token = Some(refresh.to_string());
        // Tokens loaded from storage have an UNKNOWN remaining lifetime (they may
        // be hours old and already expired). Don't assume an hour — leave expiry
        // None so refresh_if_needed() refreshes on first use. Assuming validity
        // here caused expired tokens to be used → 401 "access token expired".
        self.token_expiry = None;
    }

    pub async fn exchange_code(&mut self, code: &str) -> Result<(), String> {
        debug!("Exchanging auth code for tokens");
        
        let params = [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token exchange failed: {}", error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        debug!("Token exchange successful");
        Ok(())
    }

    pub async fn refresh_if_needed(&mut self) -> Result<(), String> {
        let needs_refresh = match self.token_expiry {
            Some(expiry) => Instant::now() > expiry - Duration::from_secs(60),
            None => true,
        };

        if !needs_refresh {
            return Ok(());
        }

        self.force_refresh().await
    }

    pub async fn force_refresh(&mut self) -> Result<(), String> {
        let refresh_token = self.refresh_token.clone()
            .ok_or("No refresh token available")?;

        debug!("Refreshing access token");

        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ];

        let response = self.http
            .post(TOKEN_URL)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Refresh request failed: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            return Err(format!("Token refresh failed: {}", error));
        }

        let token: TokenResponse = response.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        self.access_token = Some(token.access_token);
        if let Some(refresh) = token.refresh_token {
            self.refresh_token = Some(refresh);
        }
        self.token_expiry = Some(Instant::now() + Duration::from_secs(token.expires_in));

        debug!("Token refresh successful");
        Ok(())
    }

    pub fn get_tokens(&self) -> Option<(String, String)> {
        match (&self.access_token, &self.refresh_token) {
            (Some(a), Some(r)) => Some((a.clone(), r.clone())),
            _ => None,
        }
    }
}

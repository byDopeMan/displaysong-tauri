/**
 * Access session handlers – everything that reacts to an access decision:
 * auto-login, developer-credential connect, approval/block handling, logout.
 *
 * Forms a runtime cycle with ./connection.js (the connection layer triggers
 * these handlers, and these handlers start/stop connections). The cycle is
 * safe because every cross-reference happens inside a function body, never at
 * module-evaluation time.
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { getString, setString } from '../../utils/storage';
import { showNotification } from '../../ui/notifications';
import { showView, openExternal } from '../../ui/navigation.js';
import { fetchDeveloperCredentials } from './api.js';
import { stopSSEConnection, stopStatusPolling, startBlockCheckSSE } from './connection.js';

// ============================================================================
// Auto-Login
// ============================================================================

export async function autoLoginAfterUnblock() {
  const email = getString('user_email');

  if (!email) {
    showNotification('❌ Keine E-Mail gefunden');
    return;
  }

  // ✅ Status auf approved setzen (wurde unblocked!)
  setString('accessRequestStatus', 'approved');

  showNotification('✅ Verbinde mit Spotify...');

  const { clientId, clientSecret } = await fetchDeveloperCredentials(email);

  if (!clientId || !clientSecret) {
    showNotification('❌ Keine Developer Credentials verfügbar');
    return;
  }

  const invoke = getTauriInvoke();
  if (!invoke) return;

  try {
    await invoke('save_credentials', { clientId, clientSecret });
    await invoke('start_auth_server');
    const authUrl = await invoke('get_auth_url');

    if (authUrl) {
      showView('auth');
      openExternal(authUrl);

      state.isAuthenticated = true;
    }
  } catch (e) {
    console.error('Auto-login after unblock failed:', e);
    showNotification('Fehler beim Login: ' + e);
  }
}

export async function autoLogin() {
  const userEmail = getString('accessRequestEmail') || getString('user_email');

  if (!userEmail) {
    showNotification('❌ Keine E-Mail gefunden - bitte erneut anmelden');
    return;
  }

  showNotification('✅ Zugang genehmigt! Verbinde mit Spotify...');

  const invoke = getTauriInvoke();
  if (!invoke) return;

  const { clientId, clientSecret } = await fetchDeveloperCredentials(userEmail);

  if (!clientId || !clientSecret) {
    showNotification('❌ Keine Developer Credentials verfügbar');
    return;
  }

  try {
    await invoke('save_credentials', {
      clientId: clientId,
      clientSecret: clientSecret
    });

    await invoke('start_auth_server');
    const authUrl = await invoke('get_auth_url');

    if (authUrl) {
      showView('auth');
      openExternal(authUrl);
    }

  } catch (e) {
    console.error('Auto-login failed:', e);
    showNotification('Fehler beim Auto-Login: ' + e);
  }
}

// ============================================================================
// Status Handlers
// ============================================================================

export async function handleApproved() {
  const requestId = getString('accessRequestId');
  const email = getString('accessRequestEmail');

  if (!requestId || !email) {
    console.warn('handleApproved without active request');
    return;
  }

  const statusDiv = document.getElementById('access-status');
  const modal = document.getElementById('access-request-modal');

  if (statusDiv) {
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = '<div class="status-approved">✅ Zugang genehmigt! Verbinde mit Spotify...</div>';
  }

  await new Promise(r => setTimeout(r, 1000));
  modal?.classList.add('hidden');

  const success = await connectWithDeveloperCredentials(email);

  if (!success) {
    console.warn('Developer connect failed – keeping requestId');
    return;
  }

  // ✅ Status auf approved setzen (Daten bleiben!)
  setString('accessRequestStatus', 'approved');

  stopSSEConnection();
  stopStatusPolling();

  startBlockCheckSSE();
}

export async function handleBlocked() {
  // ✅ Status auf blocked setzen (Daten bleiben!)
  setString('accessRequestStatus', 'blocked');

  showNotification('❌ Dein Zugang wurde blockiert!');

  if (state.isAuthenticated) {
    await forceLogout('Du wurdest blockiert');
  }
}

export async function connectWithDeveloperCredentials(userEmail) {
  try {
    const { clientId, clientSecret } = await fetchDeveloperCredentials(userEmail);

    if (!clientId || !clientSecret) {
      console.error('Missing credentials');
      return false;
    }

    const clientIdInput = document.getElementById('client-id');
    const clientSecretInput = document.getElementById('client-secret');
    if (clientIdInput) clientIdInput.value = clientId;
    if (clientSecretInput) clientSecretInput.value = clientSecret;

    setString('using_developer_credentials', 'true');

    const invoke = getTauriInvoke();
    await invoke('save_credentials', { clientId, clientSecret });

    // Fast path: if a stored token can still be refreshed we're already
    // connected — skip the full OAuth flow (no browser, no auth server). This
    // avoids re-running the fragile OAuth on every startup, which is what made
    // the Spotify login occasionally get lost. Only when there's no valid token
    // do we fall through to the interactive OAuth below.
    try {
      const alreadyConnected = await invoke('check_credentials');
      if (alreadyConnected) {
        state.isAuthenticated = true;
        const { setSpotifyConnected } = await import('../provider/provider-ui.js');
        setSpotifyConnected(true);
        return true;
      }
    } catch (e) {
      // fall through to interactive OAuth
    }

    await invoke('start_auth_server');

    const authUrl = await invoke('get_auth_url');
    if (authUrl) {
      showView('auth');
      openExternal(authUrl);
    }

    return true;
  } catch (e) {
    console.error('connectWithDeveloperCredentials failed', e);
    return false;
  }
}

export async function forceLogout(reason) {
  const client = document.getElementById('client-id');
  const secret = document.getElementById('client-secret');

  showNotification(reason);

  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      await invoke('disconnect_spotify');

      state.isAuthenticated = false;
      state.currentTrack = null;
      state.activeWidgets.clear();
      if (client) client.value = '';
      if (secret) secret.value = '';

      const { updateWidgetList } = await import('../widgets.js');
      const { updateSpotifyStatus } = await import('../provider/auth.js');

      updateWidgetList();
      showView('setup');
      updateSpotifyStatus(false);

      // ✅ Status auf blocked setzen (Email & Request-ID bleiben für Unblock!)
      setString('accessRequestStatus', 'blocked');

    } catch (e) {
      console.error('Force logout failed:', e);
    }
  }
}

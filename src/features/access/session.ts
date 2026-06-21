/**
 * Access session handlers – everything that reacts to an access decision:
 * auto-login, developer-credential connect, approval/block handling, logout.
 *
 * Forms a runtime cycle with ./connection.ts (the connection layer triggers
 * these handlers, and these handlers start/stop connections). The cycle is
 * safe because every cross-reference happens inside a function body, never at
 * module-evaluation time.
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { getString, setString } from '../../utils/storage';
import { showNotification } from '../../ui/notifications';
import { t } from '../../utils/i18n';
import { showView, openExternal } from '../../ui/navigation';
import { fetchDeveloperCredentials } from './api';
import { stopSSEConnection, stopStatusPolling, startBlockCheckSSE } from './connection';

// ============================================================================
// Auto-Login
// ============================================================================

export async function autoLoginAfterUnblock(): Promise<void> {
  const email = getString('user_email');

  if (!email) {
    showNotification(t('notifications.noEmail', {}, 'Keine E-Mail gefunden'));
    return;
  }

  // ✅ Status auf approved setzen (wurde unblocked!)
  setString('accessRequestStatus', 'approved');

  showNotification(t('notifications.connectingSpotify', {}, 'Verbinde mit Spotify...'));

  const { clientId, clientSecret } = await fetchDeveloperCredentials(email);

  if (!clientId || !clientSecret) {
    showNotification(t('notifications.noDevCredentials', {}, 'Keine Developer Credentials verfügbar'));
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
    showNotification(t('notifications.loginError', { error: String(e) }, 'Fehler beim Login: ' + e));
  }
}

export async function autoLogin(): Promise<void> {
  const userEmail = getString('accessRequestEmail') || getString('user_email');

  if (!userEmail) {
    showNotification(t('notifications.noEmailReauth', {}, 'Keine E-Mail gefunden - bitte erneut anmelden'));
    return;
  }

  showNotification(t('notifications.accessApprovedConnecting', {}, 'Zugang genehmigt! Verbinde mit Spotify...'));

  const invoke = getTauriInvoke();
  if (!invoke) return;

  const { clientId, clientSecret } = await fetchDeveloperCredentials(userEmail);

  if (!clientId || !clientSecret) {
    showNotification(t('notifications.noDevCredentials', {}, 'Keine Developer Credentials verfügbar'));
    return;
  }

  try {
    await invoke('save_credentials', {
      clientId: clientId,
      clientSecret: clientSecret,
    });

    await invoke('start_auth_server');
    const authUrl = await invoke('get_auth_url');

    if (authUrl) {
      showView('auth');
      openExternal(authUrl);
    }
  } catch (e) {
    console.error('Auto-login failed:', e);
    showNotification(t('notifications.autoLoginError', { error: String(e) }, 'Fehler beim Auto-Login: ' + e));
  }
}

// ============================================================================
// Status Handlers
// ============================================================================

export async function handleApproved(): Promise<void> {
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

  await new Promise((r) => setTimeout(r, 1000));
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

export async function handleBlocked(): Promise<void> {
  // ✅ Status auf blocked setzen (Daten bleiben!)
  setString('accessRequestStatus', 'blocked');

  showNotification(t('notifications.accessBlocked', {}, 'Dein Zugang wurde blockiert!'));

  if (state.isAuthenticated) {
    await forceLogout('Du wurdest blockiert');
  }
}

export async function connectWithDeveloperCredentials(userEmail: string): Promise<boolean> {
  try {
    const { clientId, clientSecret } = await fetchDeveloperCredentials(userEmail);

    if (!clientId || !clientSecret) {
      console.error('Missing credentials');
      return false;
    }

    const clientIdInput = document.getElementById('client-id') as HTMLInputElement | null;
    const clientSecretInput = document.getElementById('client-secret') as HTMLInputElement | null;
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
        const { setSpotifyConnected } = await import('../provider/provider-ui');
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

export async function forceLogout(reason: string): Promise<void> {
  const client = document.getElementById('client-id') as HTMLInputElement | null;
  const secret = document.getElementById('client-secret') as HTMLInputElement | null;

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

      const { updateWidgetList } = await import('../widgets');
      const { updateSpotifyStatus } = await import('../provider/auth');

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

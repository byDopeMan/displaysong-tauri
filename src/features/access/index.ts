/**
 * Access Request System with SSE + Status Flag
 * Option B: Status wird getrackt statt Daten zu löschen
 *
 * This is the public entry point for the access subsystem. app.js wires up
 * setupAccessRequestListeners() and initAccessSystem(); the heavy lifting lives
 * in the sibling modules:
 *   - api.ts        low-level HTTP helpers
 *   - connection.ts SSE + polling transports
 *   - session.ts    login/logout/approval handlers
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { getString, setString } from '../../utils/storage';
import { showNotification } from '../../ui/notifications';
import { ACCESS_API_URL } from './api';
import {
  startSSEConnection,
  stopSSEConnection,
  startStatusPolling,
  stopStatusPolling,
  startBlockCheckSSE,
  checkAccessStatus,
} from './connection';
import { autoLogin, handleApproved } from './session';
import { accessModalOpen } from './store';

// Re-export the public API surface other modules rely on.
export { fetchDeveloperCredentials } from './api';
export {
  startSSEConnection,
  stopSSEConnection,
  startStatusPolling,
  stopStatusPolling,
  startBlockCheckSSE,
  startBlockCheckPolling,
  stopBlockCheckPolling,
} from './connection';
export { autoLogin } from './session';

// ============================================================================
// Access Request Form
// ============================================================================

export async function submitAccessRequest(): Promise<void> {
  const name = (document.getElementById('access-name') as HTMLInputElement | null)?.value?.trim();
  const email = (document.getElementById('access-email') as HTMLInputElement | null)?.value?.trim();
  const discord = (document.getElementById('access-discord') as HTMLInputElement | null)?.value?.trim();
  const submitBtn = document.getElementById('btn-submit-access-a') as HTMLButtonElement | null;
  const statusDiv = document.getElementById('access-status');

  if (!name || !email) {
    showNotification('Name und E-Mail sind erforderlich!');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gesendet...';
  }

  const invoke = getTauriInvoke();

  try {
    const response = await fetch(`${ACCESS_API_URL}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, discord }),
    });

    if (response.ok) {
      const data = await response.json();

      setString('user_email', email);
      setString('accessRequestEmail', email);

      if (data.status === 'approved') {
        setString('accessRequestStatus', 'approved');
        // Save persistently to Windows Credential Manager
        if (invoke) await invoke('save_access_data', { email, requestId: data.id || '', status: 'approved' });
        if (statusDiv) {
          statusDiv.classList.remove('hidden');
          statusDiv.innerHTML = '<div class="status-approved">✅ Zugang bereits genehmigt! Verbinde...</div>';
        }
        await autoLogin();
        return;
      } else if (data.status === 'blocked') {
        setString('accessRequestStatus', 'blocked');
        if (invoke) await invoke('save_access_data', { email, requestId: data.id || '', status: 'blocked' });
        if (statusDiv) {
          statusDiv.classList.remove('hidden');
          statusDiv.innerHTML = '<div class="status-denied">🚫 Du wurdest blockiert.</div>';
        }
        return;
      } else if (data.status === 'pending') {
        setString('accessRequestId', data.id);
        setString('accessRequestStatus', 'pending');
        // Save persistently to Windows Credential Manager
        if (invoke) await invoke('save_access_data', { email, requestId: data.id, status: 'pending' });
        if (statusDiv) {
          statusDiv.classList.remove('hidden');
          statusDiv.innerHTML = '<div class="status-pending">📡 Anfrage gesendet! Live-Updates aktiviert...</div>';
        }
        showNotification('Anfrage gesendet!');

        startSSEConnection();
        startStatusPolling();
      }
    } else {
      throw new Error('Server error');
    }
  } catch (e) {
    showNotification('Fehler beim Senden. Versuche es später.');
    console.error('Access request failed:', e);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Anfrage senden';
    }
  }
}

// ============================================================================
// Status Checks
// ============================================================================

export async function checkAccessStatusOnStartup(): Promise<void> {
  const requestId = getString('accessRequestId');
  const btnRequestAccess = document.getElementById('btn-request-access') as HTMLButtonElement | null;

  if (!requestId) return;

  try {
    const response = await fetch(`${ACCESS_API_URL}/status/${requestId}`);
    if (!response.ok) return;

    const data = await response.json();

    if (data.status === 'approved') {
      setString('accessRequestStatus', 'approved');
      if (btnRequestAccess) {
        btnRequestAccess.textContent = '✅ Zugang genehmigt';
        btnRequestAccess.disabled = true;
      }
      stopSSEConnection();
      stopStatusPolling();

      // Nur wenn NICHT bereits authentifiziert
      if (!state.isAuthenticated) {
        await handleApproved();
      }
    } else if (data.status === 'denied') {
      setString('accessRequestStatus', 'denied');
    } else if (data.status === 'blocked') {
      setString('accessRequestStatus', 'blocked');
      if (btnRequestAccess) {
        btnRequestAccess.textContent = '🚫 Zugang blockiert';
        btnRequestAccess.disabled = true;
      }
    } else if (data.status === 'pending') {
      setString('accessRequestStatus', 'pending');
      if (btnRequestAccess) {
        btnRequestAccess.textContent = '⏳ Anfrage wird bearbeitet...';
      }
      startSSEConnection();
      startStatusPolling();
    }
  } catch (e) {
    /* best-effort */
  }
}

// ============================================================================
// Event Listeners & Init
// ============================================================================

export function setupAccessRequestListeners(): void {
  // The modal itself (form submit + close) is AccessRequestModal.svelte; here we
  // only handle the startup status check and the 420 key sequence that opens it.
  const requestId = getString('accessRequestId');
  if (requestId) {
    checkAccessStatusOnStartup();
  }

  let secretBuffer = '';

  document.addEventListener('keydown', (e) => {
    // Allow 420 code on setup views (setup-view, spotify-setup-view) or when not authenticated
    const setupView = document.getElementById('setup-view');
    const spotifySetupView = document.getElementById('spotify-setup-view');
    const isOnSetupView = (setupView && !setupView.classList.contains('hidden')) ||
                          (spotifySetupView && !spotifySetupView.classList.contains('hidden'));

    if ((isOnSetupView || !state.isAuthenticated) && e.key >= '0' && e.key <= '9') {
      secretBuffer += e.key;
      if (secretBuffer.length > 3) secretBuffer = secretBuffer.slice(-3);

      if (secretBuffer === '420') {
        secretBuffer = '';
        accessModalOpen.set(true);
        const reqId = getString('accessRequestId');
        if (reqId) checkAccessStatus();
      }
    }
  });
}

export async function initAccessSystem(): Promise<void> {
  const invoke = getTauriInvoke();

  // Try to load persistent data from Windows Credential Manager first
  if (invoke) {
    try {
      const [email, requestId, status] = await invoke('load_access_data');
      if (email && requestId) {
        // Restore to localStorage
        setString('user_email', email);
        setString('accessRequestEmail', email);
        setString('accessRequestId', requestId);
        setString('accessRequestStatus', status);
        setString('using_developer_credentials', 'true');
        console.log('[Access] Restored persistent data:', { email, status });
      }
    } catch (e) {
      // No persistent data found - that's OK
      console.log('[Access] No persistent access data found');
    }
  }

  const userEmail = getString('user_email');
  const requestId = getString('accessRequestId');
  const requestStatus = getString('accessRequestStatus');
  const usingDevCredentials = getString('using_developer_credentials') === 'true';

  // ✅ SSE NUR wenn Developer-Credentials genutzt werden!
  if (!usingDevCredentials) {
    return;
  }

  // ✅ Wenn blockiert: Trotzdem Block-Check-SSE für Unblock-Detection!
  if (requestStatus === 'blocked') {
    if (userEmail) {
      startBlockCheckSSE();
    }
    return;
  }

  // PRIORITÄT 1: Pending Request → Request-SSE
  if (requestId && !state.isAuthenticated && requestStatus === 'pending') {
    startSSEConnection();
    startStatusPolling();
    return;
  }

  // PRIORITÄT 2: Approved & Eingeloggt → Block-Check-SSE
  if (requestStatus === 'approved' && state.isAuthenticated && userEmail) {
    startBlockCheckSSE();
  }
}

/**
 * Access Request System with SSE + Status Flag
 * Option B: Status wird getrackt statt Daten zu löschen
 *
 * This is the public entry point for the access subsystem. app.js wires up
 * setupAccessRequestListeners() and initAccessSystem(); the heavy lifting lives
 * in the sibling modules:
 *   - api.js        low-level HTTP helpers
 *   - connection.js SSE + polling transports
 *   - session.js    login/logout/approval handlers
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { getString, setString } from '../../utils/storage';
import { showNotification } from '../../ui/notifications.js';
import { ACCESS_API_URL } from './api.js';
import {
  startSSEConnection,
  stopSSEConnection,
  startStatusPolling,
  stopStatusPolling,
  startBlockCheckSSE,
  checkAccessStatus
} from './connection.js';
import { autoLogin, handleApproved } from './session.js';

// Re-export the public API surface other modules rely on.
export { fetchDeveloperCredentials } from './api.js';
export {
  startSSEConnection,
  stopSSEConnection,
  startStatusPolling,
  stopStatusPolling,
  startBlockCheckSSE,
  startBlockCheckPolling,
  stopBlockCheckPolling
} from './connection.js';
export { autoLogin } from './session.js';

// ============================================================================
// Access Request Form
// ============================================================================

async function submitAccessRequest() {
  const name = document.getElementById('access-name')?.value?.trim();
  const email = document.getElementById('access-email')?.value?.trim();
  const discord = document.getElementById('access-discord')?.value?.trim();
  const submitBtn = document.getElementById('btn-submit-access-a');
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
      body: JSON.stringify({ name, email, discord })
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

export async function checkAccessStatusOnStartup() {
  const requestId = getString('accessRequestId');
  const btnRequestAccess = document.getElementById('btn-request-access');

  if (!requestId) return;

  try {
    const response = await fetch(`${ACCESS_API_URL}/status/${requestId}`);
    if (!response.ok) return;

    const data = await response.json();

    if (data.status === 'approved') {
      // ✅ Status setzen
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
      // ✅ Status setzen
      setString('accessRequestStatus', 'denied');

    } else if (data.status === 'blocked') {
      // ✅ Status setzen
      setString('accessRequestStatus', 'blocked');
      if (btnRequestAccess) {
        btnRequestAccess.textContent = '🚫 Zugang blockiert';
        btnRequestAccess.disabled = true;
      }

    } else if (data.status === 'pending') {
      // ✅ Status setzen
      setString('accessRequestStatus', 'pending');
      if (btnRequestAccess) {
        btnRequestAccess.textContent = '⏳ Anfrage wird bearbeitet...';
      }
      startSSEConnection();
      startStatusPolling();
    }
  } catch (e) {
  }
}

// ============================================================================
// Event Listeners & Init
// ============================================================================

export function setupAccessRequestListeners() {
  const modal = document.getElementById('access-request-modal');
  const form = document.getElementById('access-request-form');

  modal?.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => modal.classList.add('hidden'));
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitAccessRequest();
    });
  }

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
        modal?.classList.remove('hidden');
        const reqId = getString('accessRequestId');
        if (reqId) checkAccessStatus();
      }
    }
  });
}

export async function initAccessSystem() {
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

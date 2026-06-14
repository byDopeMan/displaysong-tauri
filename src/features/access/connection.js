/**
 * Access connection layer – real-time + polling transports.
 *
 *  - Request-status SSE (+ polling fallback) for a pending access request
 *  - Block-check SSE (+ polling fallback) for an already-approved user
 *
 * Forms a runtime cycle with ./session.js – see the note there. All
 * cross-references are inside function bodies, so the cycle is safe.
 */

import { state } from '../../core/state';
import { getTauriInvoke } from '../../core/tauri';
import { getString, setString, removeItem } from '../../utils/storage';
import { showNotification } from '../../ui/notifications';
import { ACCESS_API_URL } from './api.js';
import {
  handleApproved,
  handleBlocked,
  autoLoginAfterUnblock,
  forceLogout
} from './session.js';

let eventSource = null;
// Pending auto-reconnect timer for the request-status SSE. Tracked so an
// intentional stopSSEConnection() can cancel a queued reconnect (otherwise a
// reconnect scheduled just before stop would resurrect the connection).
let sseReconnectTimer = null;

// ============================================================================
// SSE: Real-time Request Status Updates
// ============================================================================

export function startSSEConnection() {
  const requestId = getString('accessRequestId');
  if (!requestId) return;

  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  eventSource = new EventSource(`${ACCESS_API_URL}/events/${requestId}`);

  eventSource.onopen = () => {
    updateConnectionStatus(true);
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 SSE Message:', data);
      handleSSEUpdate(data);
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = (error) => {
    console.error('❌ SSE Error:', error);
    updateConnectionStatus(false);

    if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
    sseReconnectTimer = setTimeout(() => {
      sseReconnectTimer = null;
      if (getString('accessRequestId')) {
        startSSEConnection();
      }
    }, 5000);
  };
}

export function stopSSEConnection() {
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    updateConnectionStatus(false);
  }
}

async function handleSSEUpdate(data) {
  const { status } = data;
  const invoke = getTauriInvoke();
  const email = getString('user_email') || getString('accessRequestEmail');
  const requestId = getString('accessRequestId');

  switch (status) {
    case 'approved':
      showNotification('🎉 Dein Zugang wurde genehmigt!');
      stopSSEConnection();
      setString('accessRequestStatus', 'approved');
      if (invoke && email) await invoke('save_access_data', { email, requestId: requestId || '', status: 'approved' });
      await handleApproved();
      break;

    case 'blocked':
      console.warn('🚫 BLOCKED via SSE!');
      showNotification('⛔ Dein Zugang wurde blockiert!');
      stopSSEConnection();
      setString('accessRequestStatus', 'blocked');
      if (invoke && email) await invoke('save_access_data', { email, requestId: requestId || '', status: 'blocked' });
      await handleBlocked();
      break;

    case 'unblocked':
      showNotification('🎉 Du wurdest entsperrt - automatisches Login...');
      stopSSEConnection();
      setString('accessRequestStatus', 'approved');
      if (invoke && email) await invoke('save_access_data', { email, requestId: requestId || '', status: 'approved' });
      await autoLoginAfterUnblock();
      break;

    case 'denied':
      showNotification('❌ Anfrage abgelehnt');
      stopSSEConnection();
      setString('accessRequestStatus', 'denied');
      if (invoke && email) await invoke('save_access_data', { email, requestId: requestId || '', status: 'denied' });
      break;

    case 'deleted':
      showNotification('🗑️ Anfrage wurde gelöscht');
      stopSSEConnection();
      removeItem('accessRequestId');
      removeItem('accessRequestEmail');
      removeItem('accessRequestStatus');
      if (invoke) await invoke('delete_access_data');
      break;

    default:
  }
}

function updateConnectionStatus(connected) {
  const statusIndicator = document.getElementById('sse-status');
  if (statusIndicator) {
    statusIndicator.classList.toggle('connected', connected);
    statusIndicator.title = connected ? 'Live verbunden' : 'Nicht verbunden';
  }
}

// ============================================================================
// FALLBACK: Polling
// ============================================================================

export function startStatusPolling() {
  const requestId = getString('accessRequestId');
  if (!requestId || state.statusCheckInterval) return;

  state.statusCheckInterval = setInterval(async () => {
    await checkAccessStatus();
  }, 30000);
}

export function stopStatusPolling() {
  if (state.statusCheckInterval) {
    clearInterval(state.statusCheckInterval);
    state.statusCheckInterval = null;
  }
}

export async function checkAccessStatus() {
  const requestId = getString('accessRequestId');
  if (!requestId) {
    stopStatusPolling();
    return;
  }

  try {
    const response = await fetch(`${ACCESS_API_URL}/status/${requestId}`);
    if (!response.ok) return;

    const data = await response.json();

    if (data.status === 'approved') {
      stopStatusPolling();
      await handleApproved();
    } else if (data.status === 'blocked') {
      stopStatusPolling();
      await handleBlocked();
    }
  } catch (e) {
    console.error('Status check failed:', e);
  }
}

// ============================================================================
// SSE: Block-Check for logged-in users
// ============================================================================

export function startBlockCheckSSE() {
  const email = getString('user_email');
  if (!email) return;

  if (state.blockCheckSSE) {
    state.blockCheckSSE.close();
  }

  state.blockCheckSSE = new EventSource(`${ACCESS_API_URL}/block-check/${encodeURIComponent(email)}`);

  state.blockCheckSSE.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'block' && data.blocked) {
        console.warn('🚫 User BLOCKED via SSE!');
        state.blockCheckSSE.close();
        await forceLogout('Du wurdest vom Developer blockiert.');
      }

      else if (data.type === 'unblock' && !data.blocked) {
        state.blockCheckSSE.close();
        showNotification('🎉 Du wurdest entsperrt! Anmeldung läuft...');
        await autoLoginAfterUnblock();
      }
    } catch (e) {
      console.error('Block-check SSE parse error:', e);
    }
  };

  state.blockCheckSSE.onerror = () => {
    state.blockCheckSSE.close();
    startBlockCheckPolling();
  };
}

export function startBlockCheckPolling() {
  if (state.blockCheckInterval) return;

  const email = getString('user_email');
  if (!email) return;

  state.blockCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(`${ACCESS_API_URL}/check-block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        const data = await response.json();

        if (data.blocked) {
          console.warn('🚫 User blocked (polling)!');
          stopBlockCheckPolling();
          await forceLogout('Du wurdest vom Developer blockiert.');
        }
      }
    } catch (e) {
      console.error('Block check failed:', e);
    }
  }, 60000);
}

export function stopBlockCheckPolling() {
  if (state.blockCheckInterval) {
    clearInterval(state.blockCheckInterval);
    state.blockCheckInterval = null;
  }
  if (state.blockCheckSSE) {
    state.blockCheckSSE.close();
    state.blockCheckSSE = null;
  }
}

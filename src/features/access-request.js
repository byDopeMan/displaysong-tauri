/**
 * Access Request System with SSE + Status Flag
 * Option B: Status wird getrackt statt Daten zu löschen
 */

import { state } from '../core/state.js';
import { getTauriInvoke } from '../core/tauri.js';
import { getString, setString, removeItem } from '../utils/storage.js';
import { showNotification } from '../ui/notifications.js';
import { showView, openExternal } from '../ui/navigation.js';

const ACCESS_API_URL = 'https://displaysong-api.bydopeman.workers.dev';

let eventSource = null;

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
  
  console.log('📡 Starting SSE connection for request:', requestId);
  
  eventSource = new EventSource(`${ACCESS_API_URL}/events/${requestId}`);
  
  eventSource.onopen = () => {
    console.log('✅ SSE Connected');
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
    
    setTimeout(() => {
      if (getString('accessRequestId')) {
        console.log('🔄 Reconnecting SSE...');
        startSSEConnection();
      }
    }, 5000);
  };
}

export function stopSSEConnection() {
  if (eventSource) {
    console.log('📡 Closing SSE connection');
    eventSource.close();
    eventSource = null;
    updateConnectionStatus(false);
  }
}

async function handleSSEUpdate(data) {
  const { status } = data;
  
  switch (status) {
    case 'approved':
      console.log('✅ APPROVED via SSE!');
      showNotification('🎉 Dein Zugang wurde genehmigt!');
      stopSSEConnection();
      await handleApproved();
      break;
      
    case 'blocked':
      console.warn('🚫 BLOCKED via SSE!');
      showNotification('⛔ Dein Zugang wurde blockiert!');
      stopSSEConnection();
      await handleBlocked();
      break;

    case 'unblocked':
      console.log('🔓 UNBLOCKED via SSE!');
      showNotification('🎉 Du wurdest entsperrt - automatisches Login...');
      stopSSEConnection();
      await autoLoginAfterUnblock();
      break;
      
    case 'denied':
      console.log('❌ DENIED via SSE');
      showNotification('❌ Anfrage abgelehnt');
      stopSSEConnection();
      setString('accessRequestStatus', 'denied');
      break;
      
    case 'deleted':
      console.log('🗑️ DELETED via SSE');
      showNotification('🗑️ Anfrage wurde gelöscht');
      stopSSEConnection();
      removeItem('accessRequestId');
      removeItem('accessRequestEmail');
      removeItem('accessRequestStatus');
      break;
      
    default:
      console.log('📊 SSE Update:', data);
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
  
  console.log('⏳ Fallback: Status-Polling gestartet');
  
  state.statusCheckInterval = setInterval(async () => {
    await checkAccessStatus();
  }, 30000);
}

export function stopStatusPolling() {
  if (state.statusCheckInterval) {
    clearInterval(state.statusCheckInterval);
    state.statusCheckInterval = null;
    console.log('Status-Polling gestoppt');
  }
}

async function checkAccessStatus() {
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
      console.log('✅ Approved (polling)');
      stopStatusPolling();
      await handleApproved();
    } else if (data.status === 'blocked') {
      console.warn('🚫 Blocked (polling)');
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
  
  console.log('🔒 Starting Block-Check SSE for:', email);
  
  state.blockCheckSSE = new EventSource(`${ACCESS_API_URL}/block-check/${encodeURIComponent(email)}`);
  
  state.blockCheckSSE.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 Block-Check SSE:', data);
      
      if (data.type === 'block' && data.blocked) {
        console.warn('🚫 User BLOCKED via SSE!');
        state.blockCheckSSE.close();
        await forceLogout('Du wurdest vom Developer blockiert.');
      } 
      
      else if (data.type === 'unblock' && !data.blocked) {
        console.log('🔓 User UNBLOCKED via SSE!');
        state.blockCheckSSE.close();
        showNotification('🎉 Du wurdest entsperrt! Anmeldung läuft...');
        await autoLoginAfterUnblock();
      }
    } catch (e) {
      console.error('Block-check SSE parse error:', e);
    }
  };
  
  state.blockCheckSSE.onerror = () => {
    console.log('Block-check SSE disconnected, falling back to polling');
    state.blockCheckSSE.close();
    startBlockCheckPolling();
  };
}

export function startBlockCheckPolling() {
  if (state.blockCheckInterval) return;
  
  const email = getString('user_email');
  if (!email) return;
  
  console.log('🔒 Fallback: Block-Check Polling');
  
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

// ============================================================================
// API Calls
// ============================================================================

export async function fetchDeveloperCredentials(userEmail) {
  try {
    const res = await fetch(`${ACCESS_API_URL}/get-developer-credentials`, {
      headers: { 'X-User-Email': userEmail }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Fehler beim Abrufen der Credentials');
    }

    return await res.json();
  } catch (e) {
    console.warn('Developer Credentials nicht verfügbar:', e);
    return { clientId: null, clientSecret: null };
  }
}

// ============================================================================
// Auto-Login Functions
// ============================================================================

async function autoLoginAfterUnblock() {
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
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Wird gesendet...';
  
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
        // ✅ Status setzen
        setString('accessRequestStatus', 'approved');
        statusDiv?.classList.remove('hidden');
        statusDiv.innerHTML = '<div class="status-approved">✅ Zugang bereits genehmigt! Verbinde...</div>';
        await autoLogin();
        return;
        
      } else if (data.status === 'blocked') {
        // ✅ Status setzen
        setString('accessRequestStatus', 'blocked');
        statusDiv?.classList.remove('hidden');
        statusDiv.innerHTML = '<div class="status-denied">🚫 Du wurdest blockiert.</div>';
        return;
        
      } else if (data.status === 'pending') {
        setString('accessRequestId', data.id);
        // ✅ Status setzen
        setString('accessRequestStatus', 'pending');
        statusDiv?.classList.remove('hidden');
        statusDiv.innerHTML = '<div class="status-pending">📡 Anfrage gesendet! Live-Updates aktiviert...</div>';
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
    submitBtn.disabled = false;
    submitBtn.textContent = 'Anfrage senden';
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
        btnRequestAccess.textContent = '✅ Zugang genehmigt - Verbinden...';
        btnRequestAccess.disabled = true;
      }
      stopSSEConnection();
      stopStatusPolling();
      await handleApproved();
      
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
    console.log('Startup status check failed:', e);
  }
}

// ============================================================================
// Status Handlers
// ============================================================================

async function handleApproved() {
  const requestId = getString('accessRequestId');
  const email = getString('accessRequestEmail');

  if (!requestId || !email) {
    console.warn('handleApproved without active request');
    return;
  }

  const statusDiv = document.getElementById('access-status');
  const modal = document.getElementById('access-request-modal');

  statusDiv?.classList.remove('hidden');
  statusDiv.innerHTML = '<div class="status-approved">✅ Zugang genehmigt! Verbinde mit Spotify...</div>';

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
  
  console.log('🔄 Switching from Request-SSE to Block-Check-SSE');
  startBlockCheckSSE();
}

async function handleBlocked() {
  // ✅ Status auf blocked setzen (Daten bleiben!)
  setString('accessRequestStatus', 'blocked');
  
  showNotification('❌ Dein Zugang wurde blockiert!');
  
  if (state.isAuthenticated) {
    await forceLogout('Du wurdest blockiert');
  }
}

async function connectWithDeveloperCredentials(userEmail) {
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

async function forceLogout(reason) {

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
      client.value = "";
      secret.value = "";
      
      const { updateWidgetList } = await import('./widgets.js');
      const { updateSpotifyStatus } = await import('./auth.js');
      
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
    if (!state.isAuthenticated && e.key >= '0' && e.key <= '9') {
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

export function initAccessSystem() {
  const userEmail = getString('user_email');
  const requestId = getString('accessRequestId');
  const requestStatus = getString('accessRequestStatus');
  const usingDevCredentials = getString('using_developer_credentials') === 'true';
  
  console.log('🔧 initAccessSystem:', { 
    userEmail, 
    requestId,
    requestStatus,
    usingDevCredentials,
    isAuthenticated: state.isAuthenticated 
  });
  
  // ✅ SSE NUR wenn Developer-Credentials genutzt werden!
  if (!usingDevCredentials) {
    console.log('⏭️ Skipping SSE - user uses own credentials');
    return;
  }
  
  // ✅ Wenn blockiert: Trotzdem Block-Check-SSE für Unblock-Detection!
  if (requestStatus === 'blocked') {
    console.log('⛔ User blocked - waiting for unblock or new request');
    if (userEmail) {
      console.log('🔓 Starting block-check SSE for unblock detection');
      startBlockCheckSSE();
    }
    return;
  }
  
  // PRIORITÄT 1: Pending Request → Request-SSE
  if (requestId && !state.isAuthenticated && requestStatus === 'pending') {
    console.log('📡 Starting request SSE for:', requestId);
    startSSEConnection();
    startStatusPolling();
    return;
  }
  
  // PRIORITÄT 2: Approved & Eingeloggt → Block-Check-SSE
  if (requestStatus === 'approved' && state.isAuthenticated && userEmail) {
    console.log('🔓 Starting block-check SSE for:', userEmail);
    startBlockCheckSSE();
  }
}
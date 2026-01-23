/**
 * Global Application State
 */

export const state = {
  currentTrack: null,
  isAuthenticated: false,
  activeWidgets: new Set(),
  currentEditorFile: 'custom1',
  codeMirrorEditor: null,
  widgetPositions: {},
  cachedHistory: [],
  embeddedTrackIds: new Set(),
  historyDesign: 'simple',
  pollingInterval: null,
  statusCheckInterval: null,
  blockCheckInterval: null,
  blockCheckSSE: null,  // SSE Connection for block-check
  eventSource: null      // SSE Connection for access-request
};

export const views = {};
export const elements = {};

/**
 * Initialize DOM references
 */
export function initElements() {
  Object.assign(elements, {
    tabs: document.getElementById('nav-tabs'),
    credentialsForm: document.getElementById('credentials-form'),
    clientId: document.getElementById('client-id'),
    clientSecret: document.getElementById('client-secret'),
    coverBg: document.getElementById('cover-bg'),
    coverImage: document.getElementById('cover-image'),
    statusBadge: document.getElementById('status-badge'),
    trackTitle: document.getElementById('track-title'),
    trackArtist: document.getElementById('track-artist'),
    trackAlbum: document.getElementById('track-album'),
    progressBar: document.getElementById('progress-bar'),
    progressCurrent: document.getElementById('progress-current'),
    progressTotal: document.getElementById('progress-total'),
    widgetList: document.getElementById('widget-list'),
    spotifyStatusText: document.getElementById('spotify-status-text'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
  });
}

/**
 * Initialize view references
 */
export function initViews() {
  Object.assign(views, {
    loading: document.getElementById('loading-view'),
    setup: document.getElementById('setup-view'),
    player: document.getElementById('player-view'),
    history: document.getElementById('history-view'),
    designs: document.getElementById('designs-view'),
    settings: document.getElementById('settings-view'),
    auth: document.getElementById('auth-view'),
  });
}

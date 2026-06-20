/**
 * Global Application State
 */

type IntervalId = ReturnType<typeof setInterval>;

interface AppState {
  currentTrack: any | null;
  isAuthenticated: boolean;
  activeWidgets: Set<string>;
  currentEditorFile: string;
  codeMirrorEditor: any | null;
  widgetPositions: Record<string, any>;
  cachedHistory: any[];
  embeddedTrackIds: Set<string>;
  historyDesign: string;
  pollingInterval: IntervalId | null;
  statusCheckInterval: IntervalId | null;
  blockCheckInterval: IntervalId | null;
  blockCheckSSE: any | null; // SSE Connection for block-check
  eventSource: any | null; // SSE Connection for access-request
}

export const state: AppState = {
  currentTrack: null,
  isAuthenticated: false,
  activeWidgets: new Set<string>(),
  currentEditorFile: 'custom1',
  codeMirrorEditor: null,
  widgetPositions: {},
  cachedHistory: [],
  embeddedTrackIds: new Set<string>(),
  historyDesign: 'simple',
  pollingInterval: null,
  statusCheckInterval: null,
  blockCheckInterval: null,
  blockCheckSSE: null,
  eventSource: null,
};

export const views: Record<string, HTMLElement | null> = {};
export const elements: Record<string, HTMLElement | null> = {};

/**
 * Initialize DOM references
 */
export function initElements(): void {
  Object.assign(elements, {
    tabs: document.getElementById('nav-tabs'),
    // The Spotify credentials form + inputs live in
    // features/provider/SpotifySetup.svelte (accessed by id where needed).
    // Player elements (cover/status/track/progress) now live in
    // features/player/Player.svelte and are no longer cached here. The Designs
    // widget-list lives in features/designs/Designs.svelte. The connection block
    // (Spotify/Twitch status + buttons) lives in features/provider/Connections.svelte
    // and is resolved by id by provider-ui / twitch / events.
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
  });
}

/**
 * Initialize view references
 */
export function initViews(): void {
  Object.assign(views, {
    loading: document.getElementById('loading-view'),
    setup: document.getElementById('setup-view'),
    'spotify-setup': document.getElementById('spotify-setup-view'),
    player: document.getElementById('player-view'),
    queue: document.getElementById('queue-view'),
    history: document.getElementById('history-view'),
    designs: document.getElementById('designs-view'),
    plugins: document.getElementById('plugins-view'),
    settings: document.getElementById('settings-view'),
    auth: document.getElementById('auth-view'),
  });
}

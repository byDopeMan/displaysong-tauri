/**
 * DisplaySong v2.1 - App
 */

// Tauri API helpers
function getTauriInvoke() {
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke;
}

function getTauriListen() {
  return window.__TAURI__?.event?.listen || window.__TAURI__?.listen;
}

function getTauriAppWindow() {
  return window.__TAURI__?.window?.appWindow || window.__TAURI__?.appWindow;
}

function getTauriWebviewWindow() {
  return window.__TAURI__?.window?.WebviewWindow || window.__TAURI__?.WebviewWindow;
}

// State
let currentTrack = null;
let isAuthenticated = false;
let activeWidgets = new Set();
let currentEditorFile = 'custom1';
let codeMirrorEditor = null;

// Views
let views = {};
let el = {};

// ============================================================================
// EXTERNE URLS
// ============================================================================

function openExternal(url) {
  window.open(url, '_blank');
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabName) {
  if (!el.tabs) return;
  
  el.tabs.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  Object.keys(views).forEach(name => {
    if (views[name]) {
      views[name].classList.toggle('hidden', name !== tabName);
    }
  });
  
  if (tabName === 'history') {
    loadHistory();
  }
}

function showView(viewName) {
  if (!el.tabs) return;
  
  const showTabs = isAuthenticated && viewName !== 'setup' && viewName !== 'auth';
  el.tabs.classList.toggle('hidden', !showTabs);
  
  Object.entries(views).forEach(([name, view]) => {
    if (view) view.classList.toggle('hidden', name !== viewName);
  });

  if (showTabs && viewName === 'player') {
    const playerTab = el.tabs.querySelector('[data-tab="player"]');
    if (playerTab) playerTab.classList.add('active');
  }
}

// ============================================================================
// TRACK DISPLAY
// ============================================================================

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function updateTrackDisplay(track) {
  if (!el.trackTitle) return;
  
  if (!track || !track.track) {
    el.trackTitle.textContent = 'Nichts läuft';
    el.trackArtist.textContent = '—';
    if (el.trackAlbum) el.trackAlbum.textContent = '';
    if (el.statusBadge) {
      el.statusBadge.classList.add('paused');
      const statusText = el.statusBadge.querySelector('.status-text');
      if (statusText) statusText.textContent = 'Pausiert';
    }
    return;
  }

  const isNewTrack = !currentTrack || currentTrack.track !== track.track;

  el.trackTitle.textContent = track.track;
  el.trackArtist.textContent = track.artist;
  if (el.trackAlbum) el.trackAlbum.textContent = track.album;

  if (isNewTrack && track.albumCover && el.coverImage) {
    el.coverImage.style.opacity = '0';
    if (el.coverBg) el.coverBg.style.opacity = '0';
    
    setTimeout(() => {
      el.coverImage.style.backgroundImage = `url('${track.albumCover}')`;
      if (el.coverBg) el.coverBg.style.backgroundImage = `url('${track.albumCover}')`;
      el.coverImage.style.opacity = '1';
      if (el.coverBg) el.coverBg.style.opacity = '0.35';
    }, 150);
  }

  if (el.statusBadge) {
    el.statusBadge.classList.toggle('paused', !track.isPlaying);
    const statusText = el.statusBadge.querySelector('.status-text');
    if (statusText) statusText.textContent = track.isPlaying ? 'Läuft jetzt' : 'Pausiert';
  }

  if (track.durationMs > 0 && el.progressBar) {
    const progress = (track.progressMs / track.durationMs) * 100;
    el.progressBar.style.width = `${progress}%`;
    if (el.progressCurrent) el.progressCurrent.textContent = formatTime(track.progressMs);
    if (el.progressTotal) el.progressTotal.textContent = formatTime(track.durationMs);
  }

  currentTrack = track;
}

// ============================================================================
// WIDGET MANAGEMENT
// ============================================================================

const WIDGET_NAMES = {
  'widget-1': 'Compact Bar',
  'widget-2': 'Album Focus',
  'widget-custom1': 'Custom 1',
  'widget-custom2': 'Custom 2',
};

let widgetPositions = {};

function loadWidgetPositions() {
  try {
    const saved = localStorage.getItem('displaysong-widget-positions');
    if (saved) widgetPositions = JSON.parse(saved);
  } catch (e) {
    console.error('Load widget positions failed:', e);
  }
}

function saveWidgetPositions() {
  try {
    localStorage.setItem('displaysong-widget-positions', JSON.stringify(widgetPositions));
  } catch (e) {
    console.error('Save widget positions failed:', e);
  }
}

async function saveWidgetPosition(widgetLabel) {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow) return;
    
    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      const position = await widget.outerPosition();
      const size = await widget.outerSize();
      widgetPositions[widgetLabel] = { x: position.x, y: position.y, width: size.width, height: size.height };
      saveWidgetPositions();
    }
  } catch (e) {
    console.error('Save widget position failed:', e);
  }
}

async function restoreWidgetPosition(widgetLabel) {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow || !settings.rememberPositions) return;
    
    const pos = widgetPositions[widgetLabel];
    if (!pos) return;
    
    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      const PhysicalPosition = window.__TAURI__?.window?.PhysicalPosition;
      const PhysicalSize = window.__TAURI__?.window?.PhysicalSize;
      
      if (PhysicalPosition) await widget.setPosition(new PhysicalPosition(pos.x, pos.y));
      if (PhysicalSize && pos.width && pos.height) await widget.setSize(new PhysicalSize(pos.width, pos.height));
    }
  } catch (e) {
    console.error('Restore widget position failed:', e);
  }
}

async function showWidget(widgetLabel) {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow) return;
    
    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      await widget.show();
      activeWidgets.add(widgetLabel);
      await restoreWidgetPosition(widgetLabel);
      updateWidgetList();
    }
  } catch (e) {
    console.error('Show widget error:', e);
  }
}

async function toggleWidget(widgetLabel) {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow) return;
    
    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      const isVisible = await widget.isVisible();
      
      if (isVisible) {
        if (settings.rememberPositions) await saveWidgetPosition(widgetLabel);
        await widget.hide();
        activeWidgets.delete(widgetLabel);
      } else {
        await widget.show();
        activeWidgets.add(widgetLabel);
        await restoreWidgetPosition(widgetLabel);
      }
      updateWidgetList();
    }
  } catch (e) {
    console.error('Widget toggle error:', e);
  }
}

async function hideWidget(widgetLabel) {
  try {
    const WebviewWindow = getTauriWebviewWindow();
    if (!WebviewWindow) return;
    
    const widget = WebviewWindow.getByLabel(widgetLabel);
    if (widget) {
      if (settings.rememberPositions) await saveWidgetPosition(widgetLabel);
      await widget.hide();
      activeWidgets.delete(widgetLabel);
      updateWidgetList();
    }
  } catch (e) {
    console.error('Widget hide error:', e);
  }
}

async function autoShowWidgets() {
  if (!settings.autoShowWidgets) return;
  try {
    const saved = localStorage.getItem('displaysong-active-widgets');
    if (saved) {
      const widgets = JSON.parse(saved);
      for (const widgetLabel of widgets) await showWidget(widgetLabel);
    }
  } catch (e) {
    console.error('Auto show widgets failed:', e);
  }
}

function saveActiveWidgets() {
  try {
    localStorage.setItem('displaysong-active-widgets', JSON.stringify(Array.from(activeWidgets)));
  } catch (e) {
    console.error('Save active widgets failed:', e);
  }
}

function updateWidgetList() {
  if (!el.widgetList) return;
  
  if (settings.autoShowWidgets) saveActiveWidgets();
  
  if (activeWidgets.size === 0) {
    el.widgetList.innerHTML = '<span class="no-widgets">Keine aktiv</span>';
    return;
  }

  el.widgetList.innerHTML = Array.from(activeWidgets).map(label => `
    <span class="widget-tag">
      ${WIDGET_NAMES[label] || label}
      <button class="close-widget" data-widget="${label}">×</button>
    </span>
  `).join('');

  el.widgetList.querySelectorAll('.close-widget').forEach(btn => {
    btn.addEventListener('click', () => hideWidget(btn.dataset.widget));
  });
}

// ============================================================================
// SONG HISTORY - Dual Container System
// ============================================================================

let historyDesign = 'simple'; // 'simple' oder 'embedded'
let cachedHistory = [];
let embeddedTrackIds = new Set();

async function loadHistory() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const history = await invoke('get_track_history');
    updateHistoryDisplay(history);
  } catch (e) {
    console.error('Load history failed:', e);
  }
}

function updateHistoryDisplay(history) {
  const simpleList = document.getElementById('history-simple');
  const embeddedList = document.getElementById('history-embedded');
  
  if (!simpleList || !embeddedList) return;
  
  if (history && history.length > 0) {
    cachedHistory = history;
  }
  
  if (!cachedHistory || cachedHistory.length === 0) {
    simpleList.innerHTML = `
      <div class="history-empty">
        <span>📻</span>
        <p>Noch keine Songs gespielt</p>
      </div>
    `;
    embeddedList.innerHTML = '';
    embeddedTrackIds.clear();
    return;
  }
  
  // BEIDE Listen parallel updaten
  updateSimpleList(simpleList, cachedHistory);
  updateEmbeddedList(embeddedList, cachedHistory);
  applyHistoryDesign();
}

function updateSimpleList(container, history) {
  container.innerHTML = history.map((track, index) => `
    <div class="history-item">
      <span class="history-index">${index + 1}</span>
      <div class="history-cover" style="background-image: url('${track.albumCover || ''}')"></div>
      <div class="history-info">
        <div class="history-title">${escapeHtml(track.track)}</div>
        <div class="history-artist">${escapeHtml(track.artist)}</div>
      </div>
      ${track.trackId ? `
        <button class="btn-spotify-link" data-uri="spotify:track:${track.trackId}" title="In Spotify öffnen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `).join('');
  
  container.querySelectorAll('.btn-spotify-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openExternal(btn.dataset.uri);
    });
  });
}

function updateEmbeddedList(container, history) {
  const validHistory = history.filter(t => t.trackId);
  const currentIds = new Set(validHistory.map(t => t.trackId));
  const maxItems = settings.historyLength || 20;
  
  // Neue Songs hinzufügen
  for (const track of validHistory) {
    if (!embeddedTrackIds.has(track.trackId)) {
      const embed = document.createElement('div');
      embed.className = 'history-embed';
      embed.dataset.trackId = track.trackId;
      embed.innerHTML = `
        <iframe 
          src="https://open.spotify.com/embed/track/${track.trackId}?utm_source=generator&theme=1" 
          width="100%" 
          height="80" 
          frameborder="0" 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy">
        </iframe>
      `;
      embeddedTrackIds.add(track.trackId);
      container.appendChild(embed);
    }
  }
  
  // Reihenfolge anpassen
  const orderedIds = validHistory.map(t => t.trackId);
  const items = Array.from(container.children);
  
  orderedIds.forEach((id, targetIndex) => {
    const item = items.find(el => el.dataset.trackId === id);
    if (item && container.children[targetIndex] !== item) {
      container.insertBefore(item, container.children[targetIndex]);
    }
  });
  
  // Alte Items entfernen
  Array.from(container.children).forEach(el => {
    if (!currentIds.has(el.dataset.trackId)) {
      embeddedTrackIds.delete(el.dataset.trackId);
      el.remove();
    }
  });
  
  // Auf maxItems begrenzen
  while (container.children.length > maxItems) {
    const last = container.lastChild;
    if (last) {
      embeddedTrackIds.delete(last.dataset.trackId);
      last.remove();
    }
  }
}

function applyHistoryDesign() {
  const simpleList = document.getElementById('history-simple');
  const embeddedList = document.getElementById('history-embedded');
  
  if (!simpleList || !embeddedList) return;
  
  if (historyDesign === 'embedded') {
    simpleList.style.display = 'none';
    embeddedList.style.display = '';
  } else {
    simpleList.style.display = '';
    embeddedList.style.display = 'none';
  }
}

function setHistoryDesign(design) {
  historyDesign = design;
  
  document.querySelectorAll('.design-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.design === design);
  });
  
  applyHistoryDesign();
  
  settings.historyDesign = design;
  saveSettings();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// CONFIG FOLDER
// ============================================================================

async function openConfigFolder() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { showNotification('Tauri nicht verfügbar'); return; }
    await invoke('open_config_folder');
    showNotification('Ordner geöffnet');
  } catch (e) {
    console.error('Open folder failed:', e);
    showNotification('Fehler: ' + e);
  }
}

async function reloadWidgets() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { showNotification('Tauri nicht verfügbar'); return; }
    await invoke('reload_widgets');
    showNotification('Widgets neu geladen!');
  } catch (e) {
    console.error('Reload widgets failed:', e);
    showNotification('Fehler: ' + e);
  }
}

// ============================================================================
// SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  pollingInterval: 2000,
  autoShowWidgets: false,
  rememberPositions: false,
  theme: 'dark',
  accentColor: 'spotify',
  historyLength: 20,
  widgetOpacity: 100,
  historyDesign: 'simple'
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const saved = localStorage.getItem('displaysong-settings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {
    console.error('Load settings failed:', e);
  }
  applySettings();
}

function saveSettings() {
  try {
    localStorage.setItem('displaysong-settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Save settings failed:', e);
  }
}

function applySettings() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  
  const colors = {
    spotify: { r: 29, g: 185, b: 84 },
    blue: { r: 59, g: 130, b: 246 },
    purple: { r: 139, g: 92, b: 246 },
    pink: { r: 236, g: 72, b: 153 },
    orange: { r: 249, g: 115, b: 22 },
    red: { r: 239, g: 68, b: 68 }
  };
  
  const color = colors[settings.accentColor] || colors.spotify;
  document.documentElement.style.setProperty('--accent', `rgb(${color.r}, ${color.g}, ${color.b})`);
  document.documentElement.style.setProperty('--accent-rgb', `${color.r}, ${color.g}, ${color.b}`);
  
  const pollingSelect = document.getElementById('polling-interval');
  if (pollingSelect) pollingSelect.value = settings.pollingInterval;
  
  const autoShowCheck = document.getElementById('auto-show-widgets');
  if (autoShowCheck) autoShowCheck.checked = settings.autoShowWidgets;
  
  const rememberCheck = document.getElementById('remember-positions');
  if (rememberCheck) rememberCheck.checked = settings.rememberPositions;
  
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) themeSelect.value = settings.theme;
  
  const historySelect = document.getElementById('history-length');
  if (historySelect) historySelect.value = settings.historyLength;
  
  const opacitySlider = document.getElementById('widget-opacity');
  const opacityValue = document.getElementById('widget-opacity-value');
  if (opacitySlider) {
    opacitySlider.value = settings.widgetOpacity;
    if (opacityValue) opacityValue.textContent = settings.widgetOpacity + '%';
  }
  
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === settings.accentColor);
  });
  
  historyDesign = settings.historyDesign || 'simple';
  document.querySelectorAll('.design-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.design === historyDesign);
  });
  
  applyWidgetOpacity();
}

async function applyWidgetOpacity() {
  const WebviewWindow = getTauriWebviewWindow();
  if (!WebviewWindow) return;
  
  const widgetLabels = ['widget-1', 'widget-2', 'widget-custom1', 'widget-custom2'];
  const opacity = settings.widgetOpacity / 100;
  
  for (const label of widgetLabels) {
    try {
      const widget = WebviewWindow.getByLabel(label);
      if (widget) {
        const invoke = getTauriInvoke();
        if (invoke) await invoke('set_widget_opacity', { label, opacity });
      }
    } catch (e) {}
  }
}

function copySongInfo() {
  if (!currentTrack || !currentTrack.track) {
    showNotification('Kein Song zum Kopieren');
    return;
  }
  
  const text = `${currentTrack.artist} - ${currentTrack.track}`;
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Kopiert: ' + text);
    const btn = document.getElementById('btn-copy-song');
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  }).catch(err => {
    console.error('Copy failed:', err);
    showNotification('Kopieren fehlgeschlagen');
  });
}

async function loadAutostartStatus() {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      const enabled = await invoke('get_autostart');
      const checkbox = document.getElementById('autostart');
      if (checkbox) checkbox.checked = enabled;
    } catch (e) {}
  }
}

function setupSettingsListeners() {
  const pollingSelect = document.getElementById('polling-interval');
  if (pollingSelect) {
    pollingSelect.addEventListener('change', async () => {
      settings.pollingInterval = parseInt(pollingSelect.value);
      saveSettings();
      const invoke = getTauriInvoke();
      if (invoke) {
        try { await invoke('set_polling_interval', { interval: settings.pollingInterval }); } catch (e) {}
      }
      showNotification('Aktualisierungsrate geändert');
    });
  }
  
  const autoShowCheck = document.getElementById('auto-show-widgets');
  if (autoShowCheck) {
    autoShowCheck.addEventListener('change', () => {
      settings.autoShowWidgets = autoShowCheck.checked;
      saveSettings();
    });
  }
  
  const rememberCheck = document.getElementById('remember-positions');
  if (rememberCheck) {
    rememberCheck.addEventListener('change', () => {
      settings.rememberPositions = rememberCheck.checked;
      saveSettings();
    });
  }
  
  const autostartCheck = document.getElementById('autostart');
  if (autostartCheck) {
    autostartCheck.addEventListener('change', async () => {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          await invoke('set_autostart', { enabled: autostartCheck.checked });
          showNotification(autostartCheck.checked ? 'Autostart aktiviert' : 'Autostart deaktiviert');
        } catch (e) {
          autostartCheck.checked = !autostartCheck.checked;
          showNotification('Autostart konnte nicht geändert werden');
        }
      }
    });
  }
  
  const btnRemoveAutostart = document.getElementById('btn-remove-autostart');
  if (btnRemoveAutostart) {
    btnRemoveAutostart.addEventListener('click', async () => {
      const invoke = getTauriInvoke();
      if (invoke) {
        try {
          await invoke('remove_autostart_entry');
          const checkbox = document.getElementById('autostart');
          if (checkbox) checkbox.checked = false;
          showNotification('Autostart-Eintrag entfernt');
        } catch (e) {
          showNotification('Fehler beim Entfernen');
        }
      }
    });
  }
  
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      settings.theme = themeSelect.value;
      saveSettings();
      applySettings();
    });
  }
  
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.accentColor = btn.dataset.color;
      saveSettings();
      applySettings();
    });
  });
  
  const historySelect = document.getElementById('history-length');
  if (historySelect) {
    historySelect.addEventListener('change', async () => {
      settings.historyLength = parseInt(historySelect.value);
      saveSettings();
      const invoke = getTauriInvoke();
      if (invoke) {
        try { await invoke('set_history_length', { length: settings.historyLength }); } catch (e) {}
      }
      showNotification(`Verlauf: ${settings.historyLength} Songs`);
    });
  }
  
  const opacitySlider = document.getElementById('widget-opacity');
  const opacityValue = document.getElementById('widget-opacity-value');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      settings.widgetOpacity = parseInt(opacitySlider.value);
      if (opacityValue) opacityValue.textContent = settings.widgetOpacity + '%';
    });
    opacitySlider.addEventListener('change', () => {
      saveSettings();
      applyWidgetOpacity();
      showNotification(`Widget-Transparenz: ${settings.widgetOpacity}%`);
    });
  }
  
  const btnCopySong = document.getElementById('btn-copy-song');
  if (btnCopySong) btnCopySong.addEventListener('click', copySongInfo);
  
  document.getElementById('btn-changelog')?.addEventListener('click', () => {
    document.getElementById('changelog-modal')?.classList.remove('hidden');
  });
  
  document.getElementById('btn-licenses')?.addEventListener('click', () => {
    document.getElementById('licenses-modal')?.classList.remove('hidden');
  });
  
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });
  
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}

// ============================================================================
// DESIGN EDITOR
// ============================================================================

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Custom Widget</title>
  <style>
    :root { --r: 29; --g: 185; --b: 84; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: transparent; }
    body { font-family: system-ui; padding: 10px; -webkit-app-region: drag; }
    .widget {
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(16px);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .cover { width: 70px; height: 70px; border-radius: 8px; background-size: cover; background-color: #222; }
    .info { flex: 1; min-width: 0; }
    .title { font-size: 15px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist { font-size: 12px; color: #aaa; }
  </style>
</head>
<body>
  <div class="widget" id="widget">
    <div class="cover" id="cover"></div>
    <div class="info">
      <div class="title" id="title">—</div>
      <div class="artist" id="artist">—</div>
    </div>
  </div>
  <script type="module">
    const{listen}=window.__TAURI__.event,{invoke}=window.__TAURI__.tauri;
    let track=null;
    function update(t){
      if(!t?.track)return;
      if(t.albumCover!==track?.albumCover)document.getElementById('cover').style.backgroundImage='url('+t.albumCover+')';
      document.getElementById('title').textContent=t.track;
      document.getElementById('artist').textContent=t.artist;
      track=t;
    }
    listen('track-update',e=>update(e.payload));
    invoke('get_track').then(update);
  <\/script>
</body>
</html>`;

async function loadEditorContent(file) {
  currentEditorFile = file;
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const content = await invoke('load_custom_design', { name: file });
    if (codeMirrorEditor) codeMirrorEditor.setValue(content);
    else if (el.editorContent) el.editorContent.value = content;
  } catch (e) {
    const errorMsg = `<!-- Fehler beim Laden von ${file}.html -->\n<!-- ${e} -->`;
    if (codeMirrorEditor) codeMirrorEditor.setValue(errorMsg);
    else if (el.editorContent) el.editorContent.value = errorMsg;
  }
}

async function saveEditorContent() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const content = codeMirrorEditor ? codeMirrorEditor.getValue() : el.editorContent.value;
    await invoke('save_custom_design', { name: currentEditorFile, content });
    showNotification('Design gespeichert!');
  } catch (e) {
    showNotification('Fehler beim Speichern: ' + e);
  }
}

function resetEditorContent() {
  if (confirm('Auf Standard zurücksetzen?')) {
    if (codeMirrorEditor) codeMirrorEditor.setValue(DEFAULT_TEMPLATE);
    else if (el.editorContent) el.editorContent.value = DEFAULT_TEMPLATE;
  }
}

async function previewDesign() {
  await saveEditorContent();
  const widgetLabel = currentEditorFile === 'custom1' ? 'widget-custom1' : 'widget-custom2';
  await toggleWidget(widgetLabel);
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #1db954;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999;
    animation: fadeIn 0.3s;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// ============================================================================
// SPOTIFY AUTH
// ============================================================================

async function checkExistingCredentials() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { showView('setup'); return; }
    
    const hasCredentials = await invoke('check_credentials');
    if (hasCredentials) {
      isAuthenticated = true;
      showView('player');
      updateSpotifyStatus(true);
    } else {
      showView('setup');
    }
  } catch (e) {
    showView('setup');
  }
}

async function saveCredentials(clientId, clientSecret) {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) { showNotification('Tauri API nicht verfügbar'); return; }
    
    await invoke('save_credentials', { clientId, clientSecret });
    await invoke('start_auth_server');
    const authUrl = await invoke('get_auth_url');
    if (authUrl) {
      showView('auth');
      openExternal(authUrl);
    }
  } catch (e) {
    showNotification('Fehler: ' + e);
  }
}

async function disconnectSpotify() {
  if (!confirm('Spotify-Verbindung trennen?')) return;
  
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    
    await invoke('disconnect_spotify');
    isAuthenticated = false;
    currentTrack = null;
    activeWidgets.clear();
    updateWidgetList();
    showView('setup');
    updateSpotifyStatus(false);
  } catch (e) {}
}

function updateSpotifyStatus(connected) {
  if (el.spotifyStatusText) {
    el.spotifyStatusText.textContent = connected ? 'Verbunden' : 'Nicht verbunden';
    el.spotifyStatusText.style.color = connected ? 'var(--accent)' : '#888';
  }
}

// ============================================================================
// WINDOW CONTROLS
// ============================================================================

function setupTitlebarControls() {
  document.querySelectorAll('.tb-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const appWindow = getTauriAppWindow();
      if (!appWindow) return;
      
      const action = btn.dataset.action;
      if (action === 'minimize') await appWindow.hide();
      if (action === 'close') {
        const invoke = getTauriInvoke();
        if (invoke) await invoke('quit_app');
      }
    });
  });
}

// ============================================================================
// EXTERNAL LINKS
// ============================================================================

function setupExternalLinks() {
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openExternal(link.href);
    });
  });
}

// ============================================================================
// DEEP LINK HANDLER
// ============================================================================

async function setupDeepLinkHandler() {
  const listen = getTauriListen();
  if (!listen) return;
  
  await listen('auth-success', () => {
    isAuthenticated = true;
    showView('player');
    updateSpotifyStatus(true);
    showNotification('Erfolgreich verbunden!');
  });
  
  await listen('auth-error', (event) => {
    showNotification('Authentifizierung fehlgeschlagen');
    showView('setup');
  });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  if (el.tabs) {
    el.tabs.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  if (el.credentialsForm) {
    el.credentialsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientId = el.clientId.value.trim();
      const clientSecret = el.clientSecret.value.trim();
      
      if (clientId.length !== 32 || clientSecret.length !== 32) {
        showNotification('Client ID und Secret müssen jeweils 32 Zeichen lang sein');
        return;
      }
      
      await saveCredentials(clientId, clientSecret);
    });
  }

  document.querySelectorAll('.btn-show').forEach(btn => {
    btn.addEventListener('click', () => toggleWidget(btn.dataset.widget));
  });

  if (el.btnDisconnect) el.btnDisconnect.addEventListener('click', disconnectSpotify);
  if (el.btnCancelAuth) el.btnCancelAuth.addEventListener('click', () => showView('setup'));

  if (el.editorSelect) el.editorSelect.addEventListener('change', () => loadEditorContent(el.editorSelect.value));
  if (el.btnSaveDesign) el.btnSaveDesign.addEventListener('click', saveEditorContent);
  if (el.btnResetDesign) el.btnResetDesign.addEventListener('click', resetEditorContent);
  if (el.btnPreviewDesign) el.btnPreviewDesign.addEventListener('click', previewDesign);

  const btnOpenFolder = document.getElementById('btn-open-folder');
  if (btnOpenFolder) btnOpenFolder.addEventListener('click', openConfigFolder);

  const btnReloadWidgets = document.getElementById('btn-reload-widgets');
  if (btnReloadWidgets) btnReloadWidgets.addEventListener('click', reloadWidgets);
  
  document.querySelectorAll('.design-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => setHistoryDesign(btn.dataset.design));
  });
}

// ============================================================================
// TRACK UPDATE LISTENER
// ============================================================================

async function setupTrackListener() {
  const listen = getTauriListen();
  if (!listen) return;
  
  await listen('track-update', (event) => {
    const track = event.payload;
    const isNewTrack = !currentTrack || 
      (track && (currentTrack.track !== track.track || currentTrack.artist !== track.artist));
    
    updateTrackDisplay(track);
    
    if (isNewTrack && track?.track) {
      refreshHistory();
    }
  });
}

async function refreshHistory() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const history = await invoke('get_track_history');
    updateHistoryDisplay(history);
  } catch (e) {}
}

// ============================================================================
// PROGRESS INTERPOLATION
// ============================================================================

function startProgressInterpolation() {
  setInterval(() => {
    if (currentTrack?.isPlaying && currentTrack.durationMs > 0) {
      currentTrack.progressMs = Math.min(currentTrack.progressMs + 1000, currentTrack.durationMs);
      
      if (el.progressBar) {
        const progress = (currentTrack.progressMs / currentTrack.durationMs) * 100;
        el.progressBar.style.width = `${progress}%`;
        if (el.progressCurrent) el.progressCurrent.textContent = formatTime(currentTrack.progressMs);
      }
    }
  }, 1000);
}

// ============================================================================
// INIT
// ============================================================================

async function init() {
  let attempts = 0;
  while (!window.__TAURI__ && attempts < 100) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  
  const invoke = getTauriInvoke();
  
  views = {
    setup: document.getElementById('setup-view'),
    player: document.getElementById('player-view'),
    history: document.getElementById('history-view'),
    designs: document.getElementById('designs-view'),
    editor: document.getElementById('editor-view'),
    settings: document.getElementById('settings-view'),
    auth: document.getElementById('auth-view'),
  };

  el = {
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
    editorSelect: document.getElementById('editor-select'),
    editorContent: document.getElementById('editor-content'),
    spotifyStatusText: document.getElementById('spotify-status-text'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    btnSaveDesign: document.getElementById('btn-save-design'),
    btnResetDesign: document.getElementById('btn-reset-design'),
    btnPreviewDesign: document.getElementById('btn-preview-design'),
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
  };
  
  setupTitlebarControls();
  setupExternalLinks();
  setupEventListeners();
  setupSettingsListeners();
  loadSettings();
  loadWidgetPositions();
  await loadAutostartStatus();
  await setupDeepLinkHandler();
  await setupTrackListener();
  await checkExistingCredentials();
  startProgressInterpolation();
  
  if (isAuthenticated && invoke) {
    try {
      const track = await invoke('get_track');
      updateTrackDisplay(track);
    } catch (e) {}
    await autoShowWidgets();
  }

  if (el.editorContent) {
    setTimeout(() => {
      if (typeof CodeMirror !== 'undefined') {
        codeMirrorEditor = CodeMirror.fromTextArea(el.editorContent, {
          mode: 'htmlmixed',
          theme: 'dracula',
          lineNumbers: true,
          lineWrapping: true,
          tabSize: 2,
          indentWithTabs: false,
          autoCloseTags: true,
          autoCloseBrackets: true,
          matchBrackets: true
        });
        loadEditorContent('custom1');
      } else {
        loadEditorContent('custom1');
      }
    }, 100);
  }
  
  console.log('DisplaySong initialized!');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
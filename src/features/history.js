/**
 * Song History Management
 */

import { state } from '../core/state.js';
import { getTauriInvoke } from '../core/tauri.js';
import { escapeHtml } from '../utils/format.js';
import { openExternal } from '../ui/navigation.js';
import { settings } from './settings.js';

export let historyDesign = 'simple';

/**
 * Load history from backend
 */
export async function loadHistory() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const history = await invoke('get_track_history');
    updateHistoryDisplay(history);
  } catch (e) {
    console.error('Load history failed:', e);
  }
}

/**
 * Refresh history (called on new track)
 */
export async function refreshHistory() {
  try {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    const history = await invoke('get_track_history');
    updateHistoryDisplay(history);
  } catch (e) {}
}

/**
 * Update history display
 */
function updateHistoryDisplay(history) {
  const simpleList = document.getElementById('history-simple');
  const embeddedList = document.getElementById('history-embedded');
  
  if (!simpleList || !embeddedList) return;
  
  if (settings.historyEnabled === false) {
    simpleList.innerHTML = `
      <div class="history-empty">
        <span>📜</span>
        <p>Verlauf ist deaktiviert</p>
        <p style="font-size: 12px; color: #666;">Aktiviere den Verlauf in den Einstellungen</p>
      </div>
    `;
    embeddedList.innerHTML = '';
    state.embeddedTrackIds.clear();
    return;
  }
  
  if (history && history.length > 0) {
    state.cachedHistory = history;
  }
  
  if (!state.cachedHistory || state.cachedHistory.length === 0) {
    simpleList.innerHTML = `
      <div class="history-empty">
        <span>📻</span>
        <p>Noch keine Songs gespielt</p>
      </div>
    `;
    embeddedList.innerHTML = '';
    state.embeddedTrackIds.clear();
    return;
  }
  
  // 🔥 FIX: Limit history to maxItems BEFORE rendering
  const maxItems = settings.historyLength || 20;
  const limitedHistory = state.cachedHistory.slice(0, maxItems);
  
  updateSimpleList(simpleList, limitedHistory);
  updateEmbeddedList(embeddedList, limitedHistory);
  applyHistoryDesign();
}

/**
 * Update simple list view
 */
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

/**
 * Update embedded list view
 */
function updateEmbeddedList(container, history) {
  const validHistory = history.filter(t => t.trackId);
  const currentIds = new Set(validHistory.map(t => t.trackId));
  
  // 🔥 FIX: Clean up old embeds that are no longer in limited history
  Array.from(container.children).forEach(el => {
    if (!currentIds.has(el.dataset.trackId)) {
      state.embeddedTrackIds.delete(el.dataset.trackId);
      el.remove();
    }
  });
  
  // Add new embeds
  for (const track of validHistory) {
    if (!state.embeddedTrackIds.has(track.trackId)) {
      const embed = document.createElement('div');
      embed.className = 'history-embed';
      embed.dataset.trackId = track.trackId;
      embed.innerHTML = `
        <iframe 
          src="https://open.spotify.com/embed/track/${track.trackId}?utm_source=generator&theme=0" 
          width="100%" 
          height="80" 
          frameborder="0" 
          allow="encrypted-media" 
          loading="lazy">
        </iframe>
      `;
      state.embeddedTrackIds.add(track.trackId);
      container.appendChild(embed);
    }
  }
  
  // Reorder items
  const orderedIds = validHistory.map(t => t.trackId);
  const items = Array.from(container.children);
  
  orderedIds.forEach((id, targetIndex) => {
    const item = items.find(el => el.dataset.trackId === id);
    if (item && container.children[targetIndex] !== item) {
      container.insertBefore(item, container.children[targetIndex]);
    }
  });
}

/**
 * Apply history design mode
 */
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

/**
 * Set history design mode
 */
export async function setHistoryDesign(design) {
  historyDesign = design;
  
  document.querySelectorAll('.design-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.design === design);
  });
  
  applyHistoryDesign();
  
  settings.historyDesign = design;
  const { saveSettings } = await import('./settings.js');
  saveSettings();
}

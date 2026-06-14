/**
 * Source Priority Management
 * Allows users to set priority order for Windows Audio sources
 */

import { getString, setString } from '../../utils/storage.js';
import { escapeAttr } from '../../utils/format.js';

// Known sources with their icons
const SOURCE_ICONS = {
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  chrome: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-3.952 6.848a12.014 12.014 0 0 0 9.56-5.12A11.94 11.94 0 0 0 24 12a11.96 11.96 0 0 0-.373-2.91zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728z"/></svg>`,
  firefox: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.824 7.287c.008 0 .004 0 0 0zm-2.8-1.4c.006 0 .003 0 0 0zm16.754 2.161c-.505-1.215-1.53-2.528-2.333-2.943.654 1.283 1.033 2.57 1.177 3.53l.002.02c-1.314-3.278-3.544-4.6-5.366-7.477-.091-.147-.184-.292-.273-.446a3.545 3.545 0 01-.13-.24 2.118 2.118 0 01-.172-.46.03.03 0 00-.027-.03.038.038 0 00-.021 0l-.006.001a.037.037 0 00-.01.005L15.624 0c-2.585 1.515-3.657 4.168-3.932 5.856a6.197 6.197 0 00-2.305.587.297.297 0 00-.147.37c.057.162.24.24.396.17a5.622 5.622 0 012.008-.523l.067-.005a5.847 5.847 0 011.957.222l.095.03a5.816 5.816 0 01.616.228c.08.036.16.073.238.112l.107.055a5.835 5.835 0 01.368.211 5.953 5.953 0 012.034 2.104c-.62-.437-1.733-.868-2.803-.681 4.183 2.09 3.06 9.292-2.737 9.02a5.164 5.164 0 01-1.513-.292 4.42 4.42 0 01-.538-.232c-1.42-.735-2.593-2.121-2.74-3.806 0 0 .537-2 3.845-2 .357 0 1.38-.998 1.398-1.287-.005-.095-2.029-.9-2.817-1.677-.422-.416-.622-.616-.8-.767a3.47 3.47 0 00-.301-.227 5.388 5.388 0 01-.032-2.842c-1.195.544-2.124 1.403-2.8 2.163h-.006c-.46-.584-.428-2.51-.402-2.913-.006-.025-.343.176-.389.206-.406.29-.787.616-1.136.974-.397.403-.76.839-1.085 1.303a9.816 9.816 0 00-1.562 3.52c-.003.013-.11.487-.19 1.073-.013.09-.026.18-.037.272a10.771 10.771 0 00-.078 1.129v.004a9.423 9.423 0 00.063.96 10.122 10.122 0 007.477 8.7A9.858 9.858 0 0012 24a9.862 9.862 0 009.213-6.373 9.86 9.86 0 00.778-3.804 9.868 9.868 0 00-.213-2.075z"/></svg>`,
  edge: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.86 17.86q.14 0 .25.12.1.13.1.25t-.11.33l-.32.46-.43.53-.44.5q-.21.25-.38.42l-.22.23q-.58.53-1.34 1.04-.76.51-1.6.91-.86.4-1.74.64t-1.67.24q-.9 0-1.69-.28-.8-.28-1.48-.78-.68-.5-1.22-1.17-.53-.66-.92-1.44-.38-.77-.58-1.6-.2-.83-.2-1.67 0-1 .32-1.96.33-.97.87-1.8.14.95.55 1.77.41.82 1.02 1.5.6.68 1.38 1.21.78.54 1.64.9.86.36 1.77.56.92.2 1.8.2 1.04 0 2-.23.98-.23 1.77-.76.26-.09.34-.09zm-17.73-7.3Q5.24 7.21 7.5 5.26q2.25-1.94 5.33-2.61 1.18-.25 2.29-.27 1.1-.01 2.14.17 1.03.18 2 .54.97.36 1.83.92-1.58-.18-3.06.12-1.47.3-2.76 1.01-1.3.7-2.32 1.76-1.03 1.05-1.65 2.42-.63 1.37-.79 2.98-.17 1.6.2 3.28-.89-.38-1.6-.97-.72-.6-1.22-1.37-.5-.77-.77-1.67-.26-.9-.26-1.89 0-.45.07-.95.08-.5.2-.95-.57.4-1.06.92-.5.52-.88 1.11-.39.6-.66 1.24-.27.65-.4 1.27l-.08.4-.02.37q-.02.25-.02.49 0 .46.04.9l.04.34.06.33q-.75-.6-1.34-1.35-.6-.76-1.03-1.62-.43-.85-.68-1.79-.25-.93-.25-1.9 0-1.85.7-3.48.7-1.63 1.94-2.88 1.25-1.26 2.93-2.01 1.68-.76 3.63-.91h.64q.4 0 .76.04-.83.15-1.6.46-.76.3-1.44.77-.67.46-1.24 1.07-.58.6-1.02 1.35z"/></svg>`,
  vlc: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2.4c5.302 0 9.6 4.298 9.6 9.6s-4.298 9.6-9.6 9.6-9.6-4.298-9.6-9.6S6.698 2.4 12 2.4zm-.001 2.025L6.938 16.8h10.124L12 4.425z"/></svg>`,
  opera: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.051 5.238c-1.328 1.566-2.186 3.883-2.246 6.48v.564c.06 2.597.918 4.914 2.246 6.48 1.689 1.61 3.95 2.598 6.429 2.598 1.96 0 3.77-.613 5.27-1.656A11.942 11.942 0 0112 24C5.373 24 0 18.627 0 12S5.373 0 12 0c2.625 0 5.047.844 7.022 2.275a9.265 9.265 0 00-4.542-1.185c-2.479 0-4.74.988-6.429 2.598v-.45zm0 13.524c-1.005-1.342-1.633-3.243-1.633-5.322v-.44c0-2.079.628-3.98 1.633-5.322 1.087-1.078 2.568-1.742 4.196-1.742 1.083 0 2.096.29 2.972.797-1.454-.87-2.678-.557-3.767.592-1.103 1.164-1.79 3.037-1.79 5.235v.44c0 2.198.687 4.071 1.79 5.235 1.089 1.149 2.313 1.462 3.767.592a5.98 5.98 0 01-2.972.797c-1.628 0-3.11-.664-4.196-1.742v-.12z"/></svg>`,
  itunes: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.977 23.999c-2.483-.027-4.753-.79-6.726-2.327-1.72-1.34-2.996-3.07-3.743-5.166-.752-2.112-.848-4.258-.34-6.454.545-2.357 1.706-4.399 3.406-6.061 1.597-1.562 3.503-2.621 5.655-3.12 1.163-.269 2.346-.362 3.542-.278.244.017.367.077.381.341.024.43.004.863.038 1.293.022.28-.1.351-.36.341-.857-.033-1.71.03-2.555.19-2.364.446-4.389 1.513-6.016 3.316-1.446 1.603-2.322 3.47-2.611 5.592-.214 1.572-.12 3.126.31 4.652.73 2.586 2.243 4.618 4.516 6.04 1.545.966 3.24 1.453 5.064 1.478 1.956.027 3.803-.45 5.47-1.528 1.816-1.174 3.126-2.784 3.905-4.783.58-1.487.79-3.035.694-4.63-.046-.755-.17-1.5-.33-2.237-.096-.437-.07-.46.373-.52.437-.06.877-.092 1.318-.11.27-.012.355.086.394.34.367 2.408.196 4.756-.596 7.033-.96 2.762-2.677 4.924-5.123 6.491-1.624 1.04-3.413 1.612-5.326 1.796-.403.04-.807.056-1.34.091z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  foobar: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3a9 9 0 110 18 9 9 0 010-18zm-2 5v8l6-4-6-4z"/></svg>`,
  musicbee: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>`
};

// Track seen sources (only real detected ones)
let seenSources = [];

// Export for external update
export function updatePriorityButtonVisibility() {
  const btn = document.getElementById('btn-source-priority');
  if (!btn) return;
  
  // Use saved provider from localStorage directly to avoid circular import
  const provider = localStorage.getItem('music-provider') || 'windows';
  btn.style.display = provider === 'windows' ? '' : 'none';
}

/**
 * Initialize source priority system
 */
export function initSourcePriority() {
  const btn = document.getElementById('btn-source-priority');
  const modal = document.getElementById('source-priority-modal');
  
  if (!btn || !modal) return;
  
  // Load seen sources from storage
  loadSeenSources();
  
  // Initial visibility based on saved provider
  updatePriorityButtonVisibility();
  
  // Open modal
  btn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderPriorityList();
  });
  
  // Close modal
  modal.querySelector('.modal-close')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  
  // Save button
  document.getElementById('btn-save-priority')?.addEventListener('click', () => {
    savePriority();
    modal.classList.add('hidden');
  });
  
  // Reset button - resets order to default (by name alphabetically)
  document.getElementById('btn-reset-priority')?.addEventListener('click', () => {
    seenSources.sort((a, b) => a.localeCompare(b));
    saveSeenSources();
    renderPriorityList();
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
}

/**
 * Load seen sources from storage
 */
function loadSeenSources() {
  const saved = getString('seen-sources');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Filter out any problematic entries (too long, contain dots with numbers)
      seenSources = parsed.filter(s => {
        // Skip entries longer than 25 chars or with version-like patterns
        if (s.length > 25) return false;
        if (/\d{5,}/.test(s)) return false; // Contains 5+ digit numbers
        if (/\.[a-z]+\./i.test(s) && s.includes('.')) return false; // Multiple dots like com.app.name
        return true;
      });
      // Save cleaned list if we removed anything
      if (seenSources.length !== parsed.length) {
        saveSeenSources();
      }
    } catch (e) {
      seenSources = [];
    }
  }
}

/**
 * Save seen sources to storage
 */
function saveSeenSources() {
  setString('seen-sources', JSON.stringify(seenSources));
}

/**
 * Add a source to the seen list (called when track is detected)
 */
export function addSeenSource(source) {
  if (!source) return;
  
  // Normalize source name
  const normalized = normalizeSourceName(source);
  
  if (!seenSources.includes(normalized)) {
    seenSources.push(normalized);
    saveSeenSources();
  }
}

/**
 * Remove a source from the list
 */
function removeSource(source) {
  seenSources = seenSources.filter(s => s !== source);
  saveSeenSources();
  renderPriorityList();
}

/**
 * Normalize source name for consistency
 */
function normalizeSourceName(source) {
  const lower = source.toLowerCase();
  
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('chrome')) return 'Chrome';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('edge') || lower.includes('msedge')) return 'Edge';
  if (lower.includes('vlc')) return 'VLC';
  if (lower.includes('itunes')) return 'iTunes';
  if (lower.includes('youtube')) return 'YouTube';
  if (lower.includes('foobar')) return 'foobar2000';
  if (lower.includes('musicbee')) return 'MusicBee';
  if (lower.includes('groove')) return 'Groove Music';
  if (lower.includes('deezer')) return 'Deezer';
  if (lower.includes('tidal')) return 'TIDAL';
  if (lower.includes('amazon')) return 'Amazon Music';
  if (lower.includes('opera')) return 'Opera';
  if (lower.includes('brave')) return 'Brave';
  
  // For unknown long names, try to extract a readable part
  if (source.length > 20) {
    // Try to get first part before dots or underscores
    const parts = source.split(/[._]/);
    if (parts[0] && parts[0].length > 2) {
      return parts[0];
    }
  }
  
  return source;
}

/**
 * Get icon class for source
 */
function getSourceIconClass(source) {
  const lower = source.toLowerCase();
  
  if (lower.includes('spotify')) return 'spotify';
  if (lower.includes('chrome')) return 'chrome';
  if (lower.includes('firefox')) return 'firefox';
  if (lower.includes('edge')) return 'edge';
  if (lower.includes('vlc')) return 'vlc';
  if (lower.includes('itunes')) return 'itunes';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('foobar')) return 'foobar';
  if (lower.includes('musicbee')) return 'musicbee';
  if (lower.includes('opera')) return 'opera';
  
  return 'default';
}

/**
 * Get icon SVG for source
 */
function getSourceIcon(source) {
  const iconClass = getSourceIconClass(source);
  return SOURCE_ICONS[iconClass] || SOURCE_ICONS.default;
}

/**
 * Get current priority order
 */
export function getSourcePriority() {
  // Return the seen sources in their current order
  return [...seenSources];
}

/**
 * Save priority order (reorder seenSources based on current DOM order)
 */
function savePriority() {
  const list = document.getElementById('source-priority-list');
  const items = list.querySelectorAll('.priority-item');
  seenSources = [...items].map(item => item.dataset.source);
  saveSeenSources();
}

/**
 * Render the priority list
 */
function renderPriorityList() {
  const list = document.getElementById('source-priority-list');
  if (!list) return;
  
  if (seenSources.length === 0) {
    list.innerHTML = `
      <div class="priority-empty">
        <p data-i18n="settings.system.sourcePriorityEmpty">Noch keine Quellen erkannt. Spiele Musik ab um Quellen zu erkennen.</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = seenSources.map((source, index) => `
    <div class="priority-item" data-source="${escapeAttr(source)}" data-index="${index}">
      <span class="priority-rank">${index + 1}</span>
      <span class="priority-icon ${getSourceIconClass(source)}">${getSourceIcon(source)}</span>
      <span class="priority-name">${escapeAttr(source)}</span>
      <button class="priority-remove" data-source="${escapeAttr(source)}" title="Entfernen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <span class="priority-drag-handle">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
        </svg>
      </span>
    </div>
  `).join('');
  
  // Setup remove buttons
  list.querySelectorAll('.priority-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSource(btn.dataset.source);
    });
  });
  
  // Setup drag and drop
  setupDragAndDrop(list);
}

/**
 * Setup smooth drag and drop functionality
 */
function setupDragAndDrop(list) {
  let draggedItem = null;
  let draggedClone = null;
  let startY = 0;
  let offsetY = 0;
  
  const items = list.querySelectorAll('.priority-item');
  
  items.forEach((item) => {
    item.addEventListener('mousedown', onMouseDown);
    item.addEventListener('touchstart', onTouchStart, { passive: false });
  });
  
  function onMouseDown(e) {
    // Don't drag if clicking remove button
    if (e.target.closest('.priority-remove')) return;
    e.preventDefault();
    startDrag(e.currentTarget, e.clientY);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  function onTouchStart(e) {
    if (e.target.closest('.priority-remove')) return;
    e.preventDefault();
    const touch = e.touches[0];
    startDrag(e.currentTarget, touch.clientY);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }
  
  function startDrag(item, clientY) {
    draggedItem = item;
    const rect = item.getBoundingClientRect();
    startY = clientY;
    offsetY = clientY - rect.top;
    
    // Create a clone for dragging
    draggedClone = item.cloneNode(true);
    draggedClone.classList.add('priority-item-clone');
    draggedClone.style.position = 'fixed';
    draggedClone.style.left = rect.left + 'px';
    draggedClone.style.top = rect.top + 'px';
    draggedClone.style.width = rect.width + 'px';
    draggedClone.style.zIndex = '1000';
    draggedClone.style.pointerEvents = 'none';
    document.body.appendChild(draggedClone);
    
    // Hide original
    draggedItem.classList.add('dragging');
  }
  
  function onMouseMove(e) {
    if (!draggedItem) return;
    moveDrag(e.clientY);
  }
  
  function onTouchMove(e) {
    if (!draggedItem) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveDrag(touch.clientY);
  }
  
  function moveDrag(clientY) {
    // Move clone
    if (draggedClone) {
      draggedClone.style.top = (clientY - offsetY) + 'px';
    }
    
    // Find target position
    const siblings = [...list.querySelectorAll('.priority-item:not(.dragging)')];
    let targetIndex = siblings.length;
    
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      const rect = sibling.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      if (clientY < midY) {
        targetIndex = i;
        break;
      }
    }
    
    // Move the actual item in DOM
    const currentIndex = [...list.children].indexOf(draggedItem);
    if (targetIndex !== currentIndex) {
      if (targetIndex >= siblings.length) {
        list.appendChild(draggedItem);
      } else {
        const targetElement = siblings[targetIndex];
        if (targetElement) {
          list.insertBefore(draggedItem, targetElement);
        }
      }
    }
  }
  
  function onMouseUp() {
    endDrag();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  function onTouchEnd() {
    endDrag();
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  }
  
  function endDrag() {
    if (!draggedItem) return;
    
    // Remove clone
    if (draggedClone && draggedClone.parentNode) {
      draggedClone.parentNode.removeChild(draggedClone);
    }
    
    // Show original
    draggedItem.classList.remove('dragging');
    
    // Update ranks
    updateRanks();
    
    // Cleanup
    draggedItem = null;
    draggedClone = null;
  }
}

/**
 * Update rank numbers after reorder
 */
function updateRanks() {
  const items = document.querySelectorAll('#source-priority-list .priority-item');
  items.forEach((item, index) => {
    const rank = item.querySelector('.priority-rank');
    if (rank) rank.textContent = index + 1;
  });
}

/**
 * Get the highest priority source from multiple playing sources
 */
export function getHighestPrioritySource(sources) {
  if (!sources || sources.length === 0) return null;
  if (sources.length === 1) return sources[0];
  
  const priority = getSourcePriority();
  
  // Sort sources by priority
  const sorted = [...sources].sort((a, b) => {
    const normalizedA = normalizeSourceName(a);
    const normalizedB = normalizeSourceName(b);
    
    const indexA = priority.indexOf(normalizedA);
    const indexB = priority.indexOf(normalizedB);
    
    // If not in priority list, put at end
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });
  
  return sorted[0];
}

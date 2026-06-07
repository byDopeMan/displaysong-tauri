/**
 * Navigation & View Management
 */

import { state, views, elements } from '../core/state.js';

/**
 * Switch between tabs
 */
export function switchTab(tabName) {
  if (!elements.tabs) return;
  
  elements.tabs.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  Object.keys(views).forEach(name => {
    if (views[name]) {
      views[name].classList.toggle('hidden', name !== tabName);
    }
  });

  // Smoothly scroll back to the top when switching tabs.
  document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === 'history') {
    import('../features/settings.js').then(({ settings }) => {
      if (settings.showHistoryTab !== false) {
        import('../features/history.js').then(({ loadHistory }) => loadHistory());
      }
    });
  }
}

/**
 * Show a specific view
 */
export function showView(viewName) {
  if (!elements.tabs) return;
  
  // Hide tabs for setup-related views
  const setupViews = ['setup', 'spotify-setup', 'auth', 'loading'];
  const showTabs = state.isAuthenticated && !setupViews.includes(viewName);
  elements.tabs.classList.toggle('hidden', !showTabs);
  
  // Prüfe ob der gewünschte Tab sichtbar ist
  if (showTabs && (viewName === 'player' || viewName === 'history')) {
    const targetTab = elements.tabs.querySelector(`[data-tab="${viewName}"]`);
    if (targetTab && targetTab.style.display === 'none') {
      // Tab ist versteckt, wechsle zum ersten sichtbaren Tab
      const firstVisible = Array.from(elements.tabs.querySelectorAll('.tab')).find(
        tab => tab.style.display !== 'none'
      );
      if (firstVisible) {
        viewName = firstVisible.dataset.tab;
      }
    }
  }
  
  Object.entries(views).forEach(([name, view]) => {
    if (view) view.classList.toggle('hidden', name !== viewName);
  });

  // Aktiven Tab markieren
  if (showTabs) {
    elements.tabs.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === viewName);
    });
  }
}

/**
 * Update tab visibility based on settings
 */
export function updateTabVisibility() {
  import('../features/settings.js').then(({ settings }) => {
    const playerTab = document.querySelector('[data-tab="player"]');
    const historyTab = document.querySelector('[data-tab="history"]');
    
    if (playerTab) {
      playerTab.style.display = settings.showPlayerTab !== false ? '' : 'none';
    }
    
    if (historyTab) {
      historyTab.style.display = settings.showHistoryTab !== false ? '' : 'none';
    }
    
    // Switch to first visible tab if current is hidden
    const currentTab = document.querySelector('.tab.active');
    const isCurrentHidden = currentTab && currentTab.style.display === 'none';
    
    if (isCurrentHidden) {
      // Find first visible tab that is not hidden
      const visibleTabs = Array.from(document.querySelectorAll('.tab')).filter(
        tab => tab.style.display !== 'none'
      );
      
      if (visibleTabs.length > 0) {
        switchTab(visibleTabs[0].dataset.tab);
      }
    }
    
    // If no tab is active, activate the first visible one
    const anyActive = document.querySelector('.tab.active');
    if (!anyActive || anyActive.style.display === 'none') {
      const firstVisible = Array.from(document.querySelectorAll('.tab')).find(
        tab => tab.style.display !== 'none'
      );
      if (firstVisible) {
        switchTab(firstVisible.dataset.tab);
      }
    }
  });
}

/**
 * Legacy function - redirect to updateTabVisibility
 */
export function updateHistoryTabVisibility() {
  updateTabVisibility();
}

/**
 * Open external URL in default browser
 * Uses Tauri shell API (v1)
 */
export async function openExternal(url) {
  try {
    // Tauri v1 with withGlobalTauri: true
    if (window.__TAURI__?.shell?.open) {
      await window.__TAURI__.shell.open(url);
      return;
    }
    
    // Fallback: Try dynamic import
    const { open } = await import('@tauri-apps/api/shell');
    await open(url);
  } catch (e) {
    console.error('[Navigation] Shell error, using fallback:', e);
    window.open(url, '_blank');
  }
}

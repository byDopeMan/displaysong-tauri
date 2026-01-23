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
  
  if (tabName === 'history') {
    import('../features/settings.js').then(({ settings }) => {
      if (settings.historyEnabled !== false) {
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
  
  const showTabs = state.isAuthenticated && viewName !== 'setup' && viewName !== 'auth';
  elements.tabs.classList.toggle('hidden', !showTabs);
  
  Object.entries(views).forEach(([name, view]) => {
    if (view) view.classList.toggle('hidden', name !== viewName);
  });

  if (showTabs && viewName === 'player') {
    const playerTab = elements.tabs.querySelector('[data-tab="player"]');
    if (playerTab) playerTab.classList.add('active');
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
      playerTab.style.display = settings.showPlayerTab ? '' : 'none';
    }
    
    if (historyTab) {
      historyTab.style.display = settings.showHistoryTab ? '' : 'none';
    }
    
    // Switch to first visible tab if current is hidden
    const currentTab = document.querySelector('.tab.active');
    if (currentTab && currentTab.style.display === 'none') {
      const firstVisibleTab = document.querySelector('.tab:not([style*="display: none"])');
      if (firstVisibleTab) {
        firstVisibleTab.click();
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
 * Open external URL in browser
 */
export function openExternal(url) {
  window.open(url, '_blank');
}

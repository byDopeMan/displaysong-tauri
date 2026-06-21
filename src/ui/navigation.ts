/**
 * Navigation & View Management
 */

import { state, views, elements } from '../core/state';
import { twitchPanelOpen } from '../features/twitch/store';

/** Switch between tabs */
export function switchTab(tabName: string): void {
  if (!elements.tabs) return;

  // Always return to the main settings view (not the Twitch sub-panel) on a tab switch.
  twitchPanelOpen.set(false);

  elements.tabs.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  Object.keys(views).forEach((name) => {
    const view = views[name];
    if (view) {
      view.classList.toggle('hidden', name !== tabName);
    }
  });

  // Smoothly scroll back to the top when switching tabs.
  document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === 'history') {
    import('../features/settings').then(({ settings }) => {
      if (settings.showHistoryTab !== false) {
        import('../features/history/history').then(({ loadHistory }) => loadHistory());
      }
    });
  }
}

/** Show a specific view */
export function showView(viewName: string): void {
  if (!elements.tabs) return;

  // Hide tabs for setup-related views
  const setupViews = ['setup', 'spotify-setup', 'auth', 'loading'];
  const showTabs = state.isAuthenticated && !setupViews.includes(viewName);
  elements.tabs.classList.toggle('hidden', !showTabs);

  // If the desired tab is hidden, fall back to the first visible one.
  if (showTabs && (viewName === 'player' || viewName === 'history')) {
    const targetTab = elements.tabs.querySelector(`[data-tab="${viewName}"]`) as HTMLElement | null;
    if (targetTab && targetTab.style.display === 'none') {
      const firstVisible = Array.from(elements.tabs.querySelectorAll<HTMLElement>('.tab')).find(
        (tab) => tab.style.display !== 'none'
      );
      if (firstVisible) {
        viewName = firstVisible.dataset.tab || viewName;
      }
    }
  }

  Object.entries(views).forEach(([name, view]) => {
    if (view) view.classList.toggle('hidden', name !== viewName);
  });

  // Mark the active tab
  if (showTabs) {
    elements.tabs.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === viewName);
    });
  }
}

/** Update tab visibility based on settings */
export function updateTabVisibility(): void {
  import('../features/settings').then(({ settings }) => {
    const playerTab = document.querySelector('[data-tab="player"]') as HTMLElement | null;
    const queueTab = document.getElementById('queue-tab');
    const historyTab = document.querySelector('[data-tab="history"]') as HTMLElement | null;

    const playerEnabled = settings.showPlayerTab !== false;

    if (playerTab) {
      playerTab.style.display = playerEnabled ? '' : 'none';
    }

    // The standalone Queue tab takes the Player tab's place when the Player tab
    // is hidden. With the Player tab visible, the queue lives inside it.
    if (queueTab) {
      queueTab.style.display = playerEnabled ? 'none' : '';
    }

    if (historyTab) {
      historyTab.style.display = settings.showHistoryTab !== false ? '' : 'none';
    }

    // Switch to first visible tab if current is hidden
    const currentTab = document.querySelector('.tab.active') as HTMLElement | null;
    const isCurrentHidden = currentTab && currentTab.style.display === 'none';

    if (isCurrentHidden) {
      const visibleTabs = Array.from(document.querySelectorAll<HTMLElement>('.tab')).filter(
        (tab) => tab.style.display !== 'none'
      );

      if (visibleTabs.length > 0) {
        switchTab(visibleTabs[0].dataset.tab || '');
      }
    }

    // If no tab is active, activate the first visible one
    const anyActive = document.querySelector('.tab.active') as HTMLElement | null;
    if (!anyActive || anyActive.style.display === 'none') {
      const firstVisible = Array.from(document.querySelectorAll<HTMLElement>('.tab')).find(
        (tab) => tab.style.display !== 'none'
      );
      if (firstVisible) {
        switchTab(firstVisible.dataset.tab || '');
      }
    }
  });
}

/** Legacy function - redirect to updateTabVisibility */
export function updateHistoryTabVisibility(): void {
  updateTabVisibility();
}

/**
 * Open external URL in default browser. Uses Tauri shell API (v1).
 */
export async function openExternal(url: string): Promise<void> {
  try {
    // Tauri v1 with withGlobalTauri: true
    if (window.__TAURI__?.shell?.open) {
      await window.__TAURI__.shell.open(url);
      return;
    }

    // No Tauri shell (e.g. plain browser preview): open normally.
    window.open(url, '_blank');
  } catch (e) {
    console.error('[Navigation] Shell open failed, using window.open:', e);
    window.open(url, '_blank');
  }
}

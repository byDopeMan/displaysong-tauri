/**
 * Window Titlebar Controls
 */

import { getTauriAppWindow } from '../core/tauri.js';
import { getTauriInvoke } from '../core/tauri.js';

/**
 * Setup titlebar button listeners
 */
export function setupTitlebarControls() {
  document.querySelectorAll('.tb-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const appWindow = getTauriAppWindow();
      if (!appWindow) return;
      
      const action = btn.dataset.action;
      if (action === 'minimize') {
        const app = document.querySelector('.app');
        if (app) {
          app.classList.add('minimizing');
        }
        
        // Animation zeigt visuell wohin die App geht (nach unten rechts zum Tray)
        // Kein Toast nötig - Animation ist selbsterklärend
        
        setTimeout(async () => {
          await appWindow.hide();
          if (app) app.classList.remove('minimizing');
        }, 450); // Etwas kürzer als Animation (500ms)
      }
      if (action === 'close') {
        const invoke = getTauriInvoke();
        if (invoke) await invoke('quit_app');
      }
    });
  });
}

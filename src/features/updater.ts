/**
 * Auto-Updater System
 */

import { showNotification } from '../ui/notifications';
import { t } from '../utils/i18n';

/** Check for updates */
export async function checkForUpdates(): Promise<void> {
  try {
    const checkUpdate = window.__TAURI__?.updater?.checkUpdate;
    const installUpdate = window.__TAURI__?.updater?.installUpdate;
    const onUpdaterEvent = window.__TAURI__?.updater?.onUpdaterEvent;

    if (!checkUpdate) {
      console.log('Updater API nicht verfügbar');
      return;
    }

    if (onUpdaterEvent) {
      await onUpdaterEvent(({ error, status }: any) => {
        console.log('Updater event:', status, error);
      });
    }

    const update = await checkUpdate();

    if (update.shouldUpdate) {
      console.log(`Update verfügbar: ${update.manifest?.version}`);

      const shouldInstall = await showUpdateDialog(update.manifest);

      if (shouldInstall && installUpdate) {
        showNotification(t('notifications.updateDownloading', {}, 'Update wird heruntergeladen...'));
        await installUpdate();
      }
    } else {
      console.log('Keine Updates verfügbar');
    }
  } catch (e) {
    console.log('Update check failed:', e);
  }
}

/** Show update dialog */
function showUpdateDialog(manifest: any): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content update-modal">
        <div class="modal-header">
          <span class="modal-title">🎉 Update verfügbar!</span>
        </div>
        <div class="modal-body">
          <p><strong>Version ${manifest?.version || 'Neu'}</strong> ist verfügbar.</p>
          <p class="update-notes">${manifest?.body || 'Neue Verbesserungen und Bugfixes.'}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="update-later">Später</button>
          <button class="btn btn-primary" id="update-now">Jetzt updaten</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#update-now')?.addEventListener('click', () => {
      modal.remove();
      resolve(true);
    });

    modal.querySelector('#update-later')?.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });
  });
}

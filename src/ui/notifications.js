/**
 * Toast Notifications
 */

/**
 * Show a toast notification
 */
export function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--accent, #1db954);
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

/**
 * Show tray toast when minimizing
 */
export function showTrayToast() {
  const toast = document.getElementById('tray-toast');
  if (!toast) return;
  
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

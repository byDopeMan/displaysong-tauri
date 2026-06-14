/**
 * Toast Notifications - Modern, non-intrusive
 * With content update (replaces existing notification with same type)
 */

type NotifyType = 'success' | 'error' | 'info' | 'warning';

export interface NotifyOptions {
  type?: NotifyType;
  duration?: number;
  icon?: string;
  /** Custom id for replacement (defaults to the type). */
  id?: string;
}

interface TrackedNotification {
  element: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

// Notification Container
let notificationContainer: HTMLElement | null = null;

// Track active notifications by type for content replacement
const activeNotifications = new Map<string, TrackedNotification>();

function getContainer(): HTMLElement {
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
  }
  return notificationContainer;
}

/**
 * Show a toast notification. If one with the same id (or type) already exists,
 * its content is updated instead of stacking a new one.
 */
export function showNotification(message: string, options: NotifyOptions = {}): HTMLElement {
  const { type = 'success', duration = 4000, icon, id } = options;

  const notificationId = id || type;
  const container = getContainer();

  // Check if notification with same ID exists - update content instead of creating new
  const existing = activeNotifications.get(notificationId);
  if (existing && existing.element && document.contains(existing.element)) {
    // Update existing notification content
    const textEl = existing.element.querySelector('.notification-text');
    if (textEl) {
      textEl.textContent = message;
    }

    // Reset auto-dismiss timer
    if (existing.timer) {
      clearTimeout(existing.timer);
    }

    if (duration > 0) {
      existing.timer = setTimeout(() => {
        dismissNotification(existing.element, notificationId);
      }, duration);
    }

    // Add a subtle pulse animation to indicate update
    existing.element.classList.add('updated');
    setTimeout(() => existing.element.classList.remove('updated'), 200);

    return existing.element;
  }

  // Create new notification
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;

  // Icon basierend auf Typ
  const icons: Record<string, string> = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  };

  notification.innerHTML = `
    <span class="notification-icon">${icon || icons[type] || icons.info}</span>
    <span class="notification-text">${escapeHtml(message)}</span>
    <button class="notification-close" aria-label="Schließen">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  // Close button handler
  notification.querySelector('.notification-close')?.addEventListener('click', () => {
    dismissNotification(notification, notificationId);
  });

  container.appendChild(notification);

  // Track this notification
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timer = setTimeout(() => dismissNotification(notification, notificationId), duration);
  }

  activeNotifications.set(notificationId, { element: notification, timer });

  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  return notification;
}

function dismissNotification(notification: HTMLElement, notificationId: string): void {
  if (!notification || notification.classList.contains('hiding')) return;

  notification.classList.add('hiding');
  notification.classList.remove('show');

  // Remove from tracking
  if (notificationId) {
    const tracked = activeNotifications.get(notificationId);
    if (tracked && tracked.timer) {
      clearTimeout(tracked.timer);
    }
    activeNotifications.delete(notificationId);
  }

  setTimeout(() => {
    notification.remove();
  }, 300);
}

function escapeHtml(str: unknown): string {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/**
 * Shorthand functions
 */
export const notify = {
  success: (msg: string, opts?: NotifyOptions) => showNotification(msg, { type: 'success', ...opts }),
  error: (msg: string, opts?: NotifyOptions) => showNotification(msg, { type: 'error', ...opts }),
  info: (msg: string, opts?: NotifyOptions) => showNotification(msg, { type: 'info', ...opts }),
  warning: (msg: string, opts?: NotifyOptions) => showNotification(msg, { type: 'warning', ...opts }),
};

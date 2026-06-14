/**
 * PluginWindow - lets a plugin create its own floating, draggable, resizable
 * window rendered as a div overlay (not a native OS window).
 */

import { escapeAttr } from '../../utils/format';

// All live plugin windows, keyed by their generated windowId.
const pluginWindows = new Map();
let windowIdCounter = 0;

export class PluginWindow {
  constructor(pluginId, options = {}) {
    this.pluginId = pluginId;
    this.windowId = `plugin-window-${pluginId}-${++windowIdCounter}`;
    this.options = {
      title: options.title || pluginId,
      width: options.width || 400,
      height: options.height || 300,
      html: options.html || '',
      resizable: options.resizable !== false,
      alwaysOnTop: options.alwaysOnTop || false,
      transparent: options.transparent || false,
      x: options.x || null,
      y: options.y || null,
      minWidth: options.minWidth || 200,
      minHeight: options.minHeight || 100,
    };

    this.element = null;
    this.contentElement = null;
    this.isVisible = false;
    this.isDragging = false;
    this.isResizing = false;

    pluginWindows.set(this.windowId, this);
  }

  /** Show the window */
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
      return;
    }

    this._create();
    this.isVisible = true;
  }

  /** Hide the window */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  /** Close and destroy the window */
  close() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.contentElement = null;
      this.isVisible = false;
    }
    pluginWindows.delete(this.windowId);
  }

  /** Set HTML content */
  setContent(html) {
    this.options.html = html;
    if (this.contentElement) {
      this.contentElement.innerHTML = html;
    }
  }

  /** Get the content element for direct DOM manipulation */
  getContentElement() {
    return this.contentElement;
  }

  /** Set window title */
  setTitle(title) {
    this.options.title = title;
    const titleEl = this.element?.querySelector('.plugin-window-title');
    if (titleEl) titleEl.textContent = title;
  }

  /** Resize the window */
  setSize(width, height) {
    this.options.width = width;
    this.options.height = height;
    if (this.element) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';
    }
  }

  /** Move the window */
  setPosition(x, y) {
    this.options.x = x;
    this.options.y = y;
    if (this.element) {
      this.element.style.left = x + 'px';
      this.element.style.top = y + 'px';
    }
  }

  /** Internal: Create the window DOM */
  _create() {
    const win = document.createElement('div');
    win.id = this.windowId;
    win.className = 'plugin-window';
    if (this.options.transparent) win.classList.add('transparent');
    if (this.options.alwaysOnTop) win.classList.add('always-on-top');

    win.style.width = this.options.width + 'px';
    win.style.height = this.options.height + 'px';

    // Position
    if (this.options.x !== null) {
      win.style.left = this.options.x + 'px';
    } else {
      win.style.left = '50%';
      win.style.transform = 'translateX(-50%)';
    }
    if (this.options.y !== null) {
      win.style.top = this.options.y + 'px';
    } else {
      win.style.top = '100px';
    }

    win.innerHTML = `
      <div class="plugin-window-header" data-drag="true">
        <span class="plugin-window-title">${escapeAttr(this.options.title)}</span>
        <div class="plugin-window-controls">
          <button class="plugin-window-btn minimize" title="Minimieren">─</button>
          <button class="plugin-window-btn close" title="Schließen">✕</button>
        </div>
      </div>
      <div class="plugin-window-content"></div>
      ${this.options.resizable ? '<div class="plugin-window-resize"></div>' : ''}
    `;

    this.element = win;
    this.contentElement = win.querySelector('.plugin-window-content');
    this.contentElement.innerHTML = this.options.html;

    // Event handlers
    this._setupDrag(win);
    if (this.options.resizable) this._setupResize(win);

    win.querySelector('.plugin-window-btn.close')?.addEventListener('click', () => this.close());
    win.querySelector('.plugin-window-btn.minimize')?.addEventListener('click', () => this.hide());

    document.body.appendChild(win);
  }

  _setupDrag(win) {
    const header = win.querySelector('.plugin-window-header');
    let startX, startY, startLeft, startTop;

    const onMouseMove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      win.style.left = (startLeft + dx) + 'px';
      win.style.top = (startTop + dy) + 'px';
      win.style.transform = 'none';
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('plugin-window-btn')) return;
      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = win.offsetLeft;
      startTop = win.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _setupResize(win) {
    const handle = win.querySelector('.plugin-window-resize');
    if (!handle) return;

    let startX, startY, startW, startH;

    const onMouseMove = (e) => {
      if (!this.isResizing) return;
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      win.style.width = Math.max(this.options.minWidth, startW + dw) + 'px';
      win.style.height = Math.max(this.options.minHeight, startH + dh) + 'px';
    };

    const onMouseUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }
}

/**
 * Close and destroy every window created by a given plugin. Called when a
 * plugin is disabled or uninstalled so its overlays don't linger in the DOM.
 */
export function closePluginWindows(pluginId) {
  for (const win of [...pluginWindows.values()]) {
    if (win.pluginId === pluginId) win.close();
  }
}

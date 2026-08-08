/**
 * PluginWindow - lets a plugin create its own floating, draggable, resizable
 * window rendered as a div overlay (not a native OS window).
 */

import { escapeAttr } from '../../utils/format';

export interface PluginWindowOptions {
  title?: string;
  width?: number;
  height?: number;
  html?: string;
  /** When set, open a REAL OS window (Tauri WebviewWindow) loading this URL
   *  instead of an in-app <div> overlay. getContentElement() is null then. */
  url?: string;
  /** Real-window ({url}) only: create hidden and reveal once the page is ready
   *  (no white flash), and run a short close delay so the page can animate out.
   *  Default true. */
  animated?: boolean;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  transparent?: boolean;
  x?: number | null;
  y?: number | null;
  minWidth?: number;
  minHeight?: number;
}

interface ResolvedOptions {
  title: string;
  width: number;
  height: number;
  html: string;
  url: string | null;
  animated: boolean;
  resizable: boolean;
  alwaysOnTop: boolean;
  transparent: boolean;
  x: number | null;
  y: number | null;
  minWidth: number;
  minHeight: number;
}

// All live plugin windows, keyed by their generated windowId.
const pluginWindows = new Map<string, PluginWindow>();
let windowIdCounter = 0;

export class PluginWindow {
  pluginId: string;
  windowId: string;
  options: ResolvedOptions;
  element: HTMLDivElement | null = null;
  contentElement: HTMLElement | null = null;
  /** Real OS window handle when opened with { url } (Tauri WebviewWindow). */
  nativeWindow: any = null;
  /** Guards the animated-close path so our own .close() isn't re-intercepted. */
  private _closing = false;
  isVisible = false;
  isDragging = false;
  isResizing = false;

  constructor(pluginId: string, options: PluginWindowOptions = {}) {
    this.pluginId = pluginId;
    this.windowId = `plugin-window-${pluginId}-${++windowIdCounter}`;
    this.options = {
      title: options.title || pluginId,
      width: options.width || 400,
      height: options.height || 300,
      html: options.html || '',
      url: options.url || null,
      animated: options.animated !== false,
      resizable: options.resizable !== false,
      alwaysOnTop: options.alwaysOnTop || false,
      transparent: options.transparent || false,
      x: options.x ?? null,
      y: options.y ?? null,
      minWidth: options.minWidth || 200,
      minHeight: options.minHeight || 100,
    };

    pluginWindows.set(this.windowId, this);
  }

  /** Show the window */
  show(): void {
    // { url } → real OS window (own webview context, no getContentElement).
    if (this.options.url) {
      this._createNative();
      this.isVisible = true;
      return;
    }
    if (this.element) {
      this.element.style.display = 'flex';
      this.isVisible = true;
      return;
    }

    this._create();
    this.isVisible = true;
  }

  /** Internal: open a real Tauri WebviewWindow loading options.url. */
  _createNative(): void {
    if (this.nativeWindow) return;
    const WV = (window as any).__TAURI__?.window?.WebviewWindow;
    if (!WV || !this.options.url) {
      console.error('[PluginWindow] WebviewWindow API not available');
      return;
    }
    const label = this.windowId.replace(/[^a-zA-Z0-9\-_/]/g, '-');
    const animated = this.options.animated;
    this.nativeWindow = new WV(label, {
      url: this.options.url,
      title: this.options.title,
      width: this.options.width,
      height: this.options.height,
      resizable: this.options.resizable,
      alwaysOnTop: this.options.alwaysOnTop,
      // (a) No flash: create hidden and reveal only once the content is ready.
      visible: !animated,
      focus: true,
    });

    if (animated) {
      // Reveal on an explicit ready signal from the page (window.__TAURI__.event
      // .emit('plugin:ready')), else a short fallback so it can't stay hidden.
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        try { this.nativeWindow?.show(); this.nativeWindow?.setFocus?.(); } catch {}
      };
      try { this.nativeWindow.once('plugin:ready', reveal); } catch {}
      setTimeout(reveal, 200);
    }

    // (c) Animated close: intercept the OS close (X) so the page can play an
    // exit animation before the window actually goes away.
    try {
      this.nativeWindow.onCloseRequested((event: any) => {
        if (this._closing) return;      // our own close() — let it through
        event.preventDefault();
        this._animateCloseThenDestroy();
      });
    } catch {}
  }

  /** Emit `plugin:before-close` so the loaded page can fade out, then actually
   *  close after a short delay. Used by both the X button and win.close(). */
  _animateCloseThenDestroy(): void {
    if (this._closing) return;
    this._closing = true;
    const w = this.nativeWindow;
    try { w?.emit('plugin:before-close'); } catch {}
    const finish = () => {
      try { w?.close(); } catch {}
      this.nativeWindow = null;
      this.isVisible = false;
      pluginWindows.delete(this.windowId);
    };
    if (this.options.animated) setTimeout(finish, 220);
    else finish();
  }

  /** Hide the window */
  hide(): void {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  /** Close and destroy the window */
  close(): void {
    // Real OS window → take the animated close path (X and win.close() match).
    if (this.nativeWindow) {
      this._animateCloseThenDestroy();
      return;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.contentElement = null;
    }
    this.isVisible = false;
    pluginWindows.delete(this.windowId);
  }

  /** Set HTML content */
  setContent(html: string): void {
    this.options.html = html;
    if (this.contentElement) {
      this.contentElement.innerHTML = html;
    }
  }

  /** Get the content element for direct DOM manipulation */
  getContentElement(): HTMLElement | null {
    return this.contentElement;
  }

  /** Set window title */
  setTitle(title: string): void {
    this.options.title = title;
    const titleEl = this.element?.querySelector('.plugin-window-title');
    if (titleEl) titleEl.textContent = title;
  }

  /** Resize the window */
  setSize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    if (this.element) {
      this.element.style.width = width + 'px';
      this.element.style.height = height + 'px';
    }
  }

  /** Move the window */
  setPosition(x: number, y: number): void {
    this.options.x = x;
    this.options.y = y;
    if (this.element) {
      this.element.style.left = x + 'px';
      this.element.style.top = y + 'px';
    }
  }

  /** Internal: Create the window DOM */
  _create(): void {
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
    if (this.contentElement) this.contentElement.innerHTML = this.options.html;

    // Event handlers
    this._setupDrag(win);
    if (this.options.resizable) this._setupResize(win);

    win.querySelector('.plugin-window-btn.close')?.addEventListener('click', () => this.close());
    win.querySelector('.plugin-window-btn.minimize')?.addEventListener('click', () => this.hide());

    document.body.appendChild(win);
  }

  _setupDrag(win: HTMLElement): void {
    const header = win.querySelector('.plugin-window-header');
    if (!header) return;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    const onMouseMove = (e: MouseEvent) => {
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
      const me = e as MouseEvent;
      if ((me.target as HTMLElement).classList.contains('plugin-window-btn')) return;
      this.isDragging = true;
      startX = me.clientX;
      startY = me.clientY;
      startLeft = win.offsetLeft;
      startTop = win.offsetTop;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _setupResize(win: HTMLElement): void {
    const handle = win.querySelector('.plugin-window-resize');
    if (!handle) return;

    let startX = 0, startY = 0, startW = 0, startH = 0;

    const onMouseMove = (e: MouseEvent) => {
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
      const me = e as MouseEvent;
      this.isResizing = true;
      startX = me.clientX;
      startY = me.clientY;
      startW = win.offsetWidth;
      startH = win.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      me.preventDefault();
    });
  }
}

/**
 * Close and destroy every window created by a given plugin. Called when a
 * plugin is disabled or uninstalled so its overlays don't linger in the DOM.
 */
export function closePluginWindows(pluginId: string): void {
  for (const win of [...pluginWindows.values()]) {
    if (win.pluginId === pluginId) win.close();
  }
}

// ===========================================================================
// PLUGIN MODAL — a centered overlay dialog (backdrop, internal scroll,
// ESC / X / click-outside to close). This is the recommended surface for a
// plugin's own UI (e.g. its settings), instead of the floating <div> window.
// ===========================================================================

export interface PluginModalOptions {
  title?: string;
  html?: string;
  width?: number;
  height?: number;
}

const pluginModals = new Set<PluginModal>();

export class PluginModal {
  pluginId: string;
  element: HTMLDivElement | null = null;
  contentElement: HTMLElement | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(pluginId: string, options: PluginModalOptions = {}) {
    this.pluginId = pluginId;
    const width = options.width || 520;
    const height = options.height || 0; // 0 = auto height

    const overlay = document.createElement('div');
    overlay.className = 'modal plugin-api-modal';
    // (d) Enter transition — backdrop fade + slight scale/slide of the content.
    overlay.style.transition = 'opacity 180ms ease';
    overlay.style.opacity = '0';

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.width = width + 'px';
    content.style.maxWidth = '92vw';
    content.style.maxHeight = '85vh';
    if (height) content.style.height = height + 'px';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.transition = 'opacity 180ms ease, transform 180ms ease';
    content.style.opacity = '0';
    content.style.transform = 'scale(0.96) translateY(8px)';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h3 = document.createElement('h3');
    h3.textContent = options.title || 'Plugin';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(h3);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.overflow = 'auto';
    body.style.flex = '1';
    if (options.html) body.innerHTML = options.html;

    content.appendChild(header);
    content.appendChild(body);
    overlay.appendChild(content);

    // Click on the backdrop (not the content) closes.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    // ESC closes.
    this.onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.onKey);

    document.body.appendChild(overlay);
    this.element = overlay;
    this.contentElement = body;
    pluginModals.add(this);

    // Animate in on the next frame (after the initial styles are applied).
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      content.style.opacity = '1';
      content.style.transform = 'none';
    });
  }

  /** The scrollable body element for direct DOM manipulation. */
  getContentElement(): HTMLElement | null { return this.contentElement; }

  setContent(html: string): void {
    if (this.contentElement) this.contentElement.innerHTML = html;
  }

  setTitle(title: string): void {
    const h3 = this.element?.querySelector('.modal-header h3');
    if (h3) h3.textContent = title;
  }

  close(): void {
    if (this.onKey) { document.removeEventListener('keydown', this.onKey); this.onKey = null; }
    const el = this.element;
    if (el) {
      // (d) Leave transition, then remove.
      const content = el.querySelector('.modal-content') as HTMLElement | null;
      el.style.opacity = '0';
      if (content) { content.style.opacity = '0'; content.style.transform = 'scale(0.96) translateY(8px)'; }
      setTimeout(() => el.remove(), 180);
    }
    this.element = null;
    this.contentElement = null;
    pluginModals.delete(this);
  }
}

/** Close every modal a plugin opened (called on disable/uninstall). */
export function closePluginModals(pluginId: string): void {
  for (const m of [...pluginModals]) {
    if (m.pluginId === pluginId) m.close();
  }
}

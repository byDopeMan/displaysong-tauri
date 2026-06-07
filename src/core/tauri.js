/**
 * Tauri API Helpers
 * Provides safe access to Tauri APIs with fallback handling
 */

export function getTauriInvoke() {
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke;
}

export function getTauriListen() {
  return window.__TAURI__?.event?.listen || window.__TAURI__?.listen;
}

export function getTauriAppWindow() {
  return window.__TAURI__?.window?.appWindow || window.__TAURI__?.appWindow;
}

export function getTauriWebviewWindow() {
  return window.__TAURI__?.window?.WebviewWindow || window.__TAURI__?.WebviewWindow;
}

export function getTauriPhysicalPosition() {
  return window.__TAURI__?.window?.PhysicalPosition;
}

export function getTauriPhysicalSize() {
  return window.__TAURI__?.window?.PhysicalSize;
}

/**
 * Wait for Tauri to be ready
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise<boolean>} True if Tauri is ready
 */
export async function waitForTauri(maxAttempts = 100) {
  let attempts = 0;
  while (!window.__TAURI__ && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  
  // Setup console log forwarding once Tauri is ready
  if (window.__TAURI__) {
    setupConsoleForwarding();
  }
  
  return !!window.__TAURI__;
}

/**
 * Setup console log forwarding to backend
 * This allows JS logs to appear in the same log file as Rust logs
 */
function setupConsoleForwarding() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  
  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  const originalDebug = console.debug;
  
  // Helper to format arguments
  const formatArgs = (args) => {
    return args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  };
  
  // Forward to backend (fire and forget - no await)
  const forwardLog = (level, args) => {
    const message = formatArgs(args);
    // Skip empty messages and Tauri internals
    if (!message || message.startsWith('[HMR]')) return;
    invoke('log_frontend', { level, message }).catch(() => {});
  };
  
  // Override console methods
  console.log = (...args) => {
    originalLog.apply(console, args);
    forwardLog('info', args);
  };
  
  console.info = (...args) => {
    originalInfo.apply(console, args);
    forwardLog('info', args);
  };
  
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    forwardLog('warn', args);
  };
  
  console.error = (...args) => {
    originalError.apply(console, args);
    forwardLog('error', args);
  };
  
  console.debug = (...args) => {
    originalDebug.apply(console, args);
    forwardLog('debug', args);
  };
}

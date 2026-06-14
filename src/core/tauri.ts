/**
 * Tauri API Helpers
 * Provides safe access to Tauri APIs with fallback handling.
 *
 * The Tauri globals (window.__TAURI__) are injected at runtime via
 * withGlobalTauri and typed loosely as `any` (see src/global.d.ts).
 */

export function getTauriInvoke(): any {
  return window.__TAURI__?.tauri?.invoke || window.__TAURI__?.invoke;
}

export function getTauriListen(): any {
  return window.__TAURI__?.event?.listen || window.__TAURI__?.listen;
}

export function getTauriAppWindow(): any {
  return window.__TAURI__?.window?.appWindow || window.__TAURI__?.appWindow;
}

export function getTauriWebviewWindow(): any {
  return window.__TAURI__?.window?.WebviewWindow || window.__TAURI__?.WebviewWindow;
}

export function getTauriPhysicalPosition(): any {
  return window.__TAURI__?.window?.PhysicalPosition;
}

export function getTauriPhysicalSize(): any {
  return window.__TAURI__?.window?.PhysicalSize;
}

/**
 * Wait for Tauri to be ready.
 * @param maxAttempts Maximum retry attempts
 * @returns True if Tauri is ready
 */
export async function waitForTauri(maxAttempts = 100): Promise<boolean> {
  let attempts = 0;
  while (!window.__TAURI__ && attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 50));
    attempts++;
  }

  // Setup console log forwarding once Tauri is ready
  if (window.__TAURI__) {
    setupConsoleForwarding();
  }

  return !!window.__TAURI__;
}

/**
 * Forward JS console logs to the backend so they land in the same log file as
 * the Rust logs.
 */
function setupConsoleForwarding(): void {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  const formatArgs = (args: unknown[]): string => {
    return args
      .map((arg) => {
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
      })
      .join(' ');
  };

  // Forward to backend (fire and forget - no await)
  const forwardLog = (level: string, args: unknown[]): void => {
    const message = formatArgs(args);
    // Skip empty messages and Tauri internals
    if (!message || message.startsWith('[HMR]')) return;
    invoke('log_frontend', { level, message }).catch(() => {});
  };

  console.log = (...args: unknown[]) => {
    originalLog.apply(console, args);
    forwardLog('info', args);
  };

  console.info = (...args: unknown[]) => {
    originalInfo.apply(console, args);
    forwardLog('info', args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    forwardLog('warn', args);
  };

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    forwardLog('error', args);
  };

  console.debug = (...args: unknown[]) => {
    originalDebug.apply(console, args);
    forwardLog('debug', args);
  };
}

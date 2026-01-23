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
  return !!window.__TAURI__;
}

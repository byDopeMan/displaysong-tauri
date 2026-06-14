// Ambient types for the globals Tauri injects into the WebView (withGlobalTauri).
// Typed loosely as `any` for now; can be tightened later if it proves useful.

interface Window {
  __TAURI__?: any;
  __centralTimer?: unknown;
}

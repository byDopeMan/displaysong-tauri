/**
 * Formatting Utilities
 */

/** Format milliseconds to MM:SS */
export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Escape HTML text content. Does NOT escape quotes — unsafe inside attributes. */
export function escapeHtml(text: unknown): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Escape a value for safe interpolation into HTML — including attribute values
 * (also escapes quotes, which escapeHtml does not). Safe for text content too.
 */
export function escapeAttr(text: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(text ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Convert a hex color (#rrggbb) to an RGB object; falls back to Spotify green. */
export function hexToRgb(hex: string): Rgb {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 29, g: 185, b: 84 };
}

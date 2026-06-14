/**
 * Twitch song-request parsing helpers (pure, no side effects / no shared state).
 *
 * Link/URI detection and Spotify track-id extraction for the messages that come
 * in via chat or channel points.
 */

/** Check if input looks like a URL. */
export function isUrl(input: string): boolean {
  return input.startsWith('http://') ||
         input.startsWith('https://') ||
         input.startsWith('spotify:') ||
         input.includes('.com/') ||
         input.includes('.be/');
}

/** Check if input is a Spotify link/URI. */
export function isSpotifyInput(input: string): boolean {
  return input.startsWith('spotify:track:') ||
         input.includes('spotify.com/track/') ||
         input.includes('spotify.com/intl-');
}

/** Extract Spotify track ID from various Spotify URL formats. */
export function extractSpotifyTrackId(input: string): string | null {
  // spotify:track:ID format
  if (input.startsWith('spotify:track:')) {
    return input.replace('spotify:track:', '').split('?')[0];
  }

  // https://open.spotify.com/track/ID or /intl-xx/track/ID
  if (input.includes('spotify.com')) {
    const match = input.match(/track\/([a-zA-Z0-9]{22})/);
    if (match) return match[1];
  }

  // Raw 22-character ID
  if (input.length === 22 && /^[a-zA-Z0-9]+$/.test(input)) {
    return input;
  }

  return null;
}

/** Escape user-provided text before inserting it into option markup. */
export function escapeHtml(s: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

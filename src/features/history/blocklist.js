/**
 * Song blocklist: songs the streamer doesn't want requested anymore.
 *
 * Blocks by BOTH an exact id (Spotify track id or YouTube video id) AND the
 * normalized "artist|title", so the same song is caught across platforms and
 * via different links. Persisted in localStorage so it survives restarts.
 */

const KEY = 'displaysong-blocklist';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  window.dispatchEvent(new CustomEvent('blocklist-change'));
}

function norm(s) { return String(s || '').toLowerCase().trim(); }
function nameKey(artist, title) { return norm(artist) + '|' + norm(title); }

function matches(entry, { id, artist, title }) {
  if (id && entry.id && entry.id === id) return true;
  const nk = nameKey(artist, title);
  return nk !== '|' && nameKey(entry.artist, entry.title) === nk;
}

/** All block entries (newest first). */
export function getBlocklist() {
  return load();
}

/** Whether a song is blocked (by exact id or by artist+title). */
export function isBlocked({ id, artist, title }) {
  return load().some((e) => matches(e, { id, artist, title }));
}

/** Add a song to the blocklist (no-op if already blocked). */
export function blockSong({ id, artist, title }) {
  const list = load();
  if (list.some((e) => matches(e, { id, artist, title }))) return list;
  list.unshift({ id: id || null, artist: artist || '', title: title || '', ts: Date.now() });
  save(list);
  return list;
}

/** Remove any block entries matching this song. */
export function unblockSong({ id, artist, title }) {
  const list = load().filter((e) => !matches(e, { id, artist, title }));
  save(list);
  return list;
}

/** Remove the block entry at the given index (for the management list). */
export function removeBlockAt(index) {
  const list = load();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    save(list);
  }
  return list;
}

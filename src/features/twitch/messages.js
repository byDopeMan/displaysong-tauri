/**
 * Twitch chat message templates — the strings the bot posts, with {user},
 * {artist}, {title}, {seconds}, {max}, {platform} placeholders. Stored in
 * localStorage; an empty field intentionally disables that message ("send
 * nothing"). Split out of twitch.js.
 */

import { showNotification } from '../../ui/notifications.js';

export const DEFAULT_MESSAGES = {
  nowPlaying: 'Jetzt laeuft: {artist} - {title}',
  songAdded: '@{user} hat hinzugefuegt: {artist} - {title}',
  songNotFound: '@{user} Song nicht gefunden. Nutze einen Spotify, YouTube oder Apple Music Link.',
  cooldown: '@{user} Bitte warte noch {seconds}s',
  tooLong: '@{user} Song ist zu lang (max. {max} Minuten)',
  duplicate: '@{user} Song ist bereits in der Queue',
  converting: '@{user} Konvertiere {platform} zu Spotify...',
  notOnSpotify: '@{user} Song ist nicht auf Spotify verfuegbar',
};

let messages = { ...DEFAULT_MESSAGES };

// The four templates that are editable in the settings UI.
const FIELD_IDS = {
  nowPlaying: 'msg-now-playing',
  songAdded: 'msg-song-added',
  songNotFound: 'msg-song-not-found',
  cooldown: 'msg-cooldown',
};

/** Current message templates. */
export function getTwitchMessages() {
  return messages;
}

/** Load saved templates from localStorage and reflect them in the UI fields. */
export function loadMessagesFromStorage() {
  try {
    const stored = localStorage.getItem('twitch-messages');
    if (stored) messages = { ...messages, ...JSON.parse(stored) };

    for (const [key, id] of Object.entries(FIELD_IDS)) {
      const input = document.getElementById(id);
      if (input) input.value = messages[key];
    }
  } catch (e) {
    console.error('[Twitch] Load messages error:', e);
  }
}

/** Persist the current field values (including empty strings) to localStorage. */
export function saveMessagesToStorage() {
  try {
    // Save the actual field values — including empty strings. An empty message is
    // intentional ("send nothing for this") and must not fall back to the
    // default, otherwise clearing a field wouldn't disable that message.
    for (const [key, id] of Object.entries(FIELD_IDS)) {
      const input = document.getElementById(id);
      if (input) messages[key] = input.value;
    }
    localStorage.setItem('twitch-messages', JSON.stringify(messages));
    showNotification('Nachrichten gespeichert');
  } catch (e) {
    console.error('[Twitch] Save messages error:', e);
  }
}

/** Reset all templates back to the defaults. */
export function resetMessagesToDefault() {
  messages = { ...DEFAULT_MESSAGES };
  localStorage.removeItem('twitch-messages');
  loadMessagesFromStorage();
  showNotification('Nachrichten zurueckgesetzt');
}

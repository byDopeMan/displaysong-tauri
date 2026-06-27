/**
 * Twitch Song Announcer — posts the current track to your Twitch chat whenever
 * the song changes. Template + cooldown configurable. Uses the app's existing
 * Twitch connection (api.sendTwitchChat). Pure JS.
 */

let unsub = null;
let lastKey = null;
let lastSent = 0;

function keyOf(track) {
  return track.trackId || (track.track + '|' + (track.artist || ''));
}

return {
  async init() {
    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>',
      fields: [
        { type: 'toggle', key: 'enabled', label: 'Auto-Ansage bei Songwechsel', default: true },
        { type: 'text', key: 'template', label: 'Nachricht', placeholder: 'Jetzt laeuft: {title} - {artist}' },
        {
          type: 'select', key: 'cooldown', label: 'Mindestabstand', default: '30',
          options: [
            { value: '0', label: 'Aus' },
            { value: '30', label: '30 Sekunden' },
            { value: '60', label: '1 Minute' },
            { value: '120', label: '2 Minuten' },
          ],
        },
        {
          type: 'button', key: 'test', label: 'Test', buttonText: 'Jetzt ansagen',
          onClick: async () => {
            const track = await api.getTrack();
            if (!track || !track.track) { api.showNotification('Kein Song aktiv.'); return; }
            await announce(track, true);
          },
        },
      ],
    });

    unsub = api.onTrackChange((track) => {
      if (!track || !track.track) return;
      const key = keyOf(track);
      if (key === lastKey) return; // same song (poll fires repeatedly)
      lastKey = key;
      if (!api.getLocalSetting('enabled', true)) return;
      announce(track, false);
    });
  },

  cleanup() {
    if (unsub) unsub();
    api.unregisterSettings();
  },
};

async function announce(track, force) {
  const cd = Number(api.getLocalSetting('cooldown', '30')) * 1000;
  const now = Date.now();
  if (!force && cd > 0 && now - lastSent < cd) return;

  const tpl = api.getLocalSetting('template', 'Jetzt laeuft: {title} - {artist}');
  const msg = tpl
    .replace(/{title}/g, track.track || '')
    .replace(/{artist}/g, track.artist || '')
    .replace(/{album}/g, track.album || '');

  try {
    const conn = await api.getTwitchConnection();
    if (!conn || !conn.connected) {
      if (force) api.showNotification('Twitch ist nicht verbunden.');
      return;
    }
    await api.sendTwitchChat(msg);
    lastSent = now;
  } catch (e) {
    console.error('[Twitch Announcer] send failed:', e);
  }
}

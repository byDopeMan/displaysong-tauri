/**
 * Now Playing -> OBS text file.
 * Writes "{artist} - {title}" (configurable) to a .txt the user picks, so OBS
 * can show it as a Text source. The plugin API has no direct file write, so it
 * writes through Python (api.pythonRun) -- this is what the Python option is for.
 */

let unsub = null;
let lastWritten = null;
let warned = false;

function format(track) {
  if (!track || !track.track) {
    return api.getLocalSetting('idleText', '');
  }
  const tpl = api.getLocalSetting('format', '{artist} - {title}');
  return tpl
    .replace(/{title}/g, track.track || '')
    .replace(/{artist}/g, track.artist || '')
    .replace(/{album}/g, track.album || '');
}

async function writeFile(text) {
  const path = (api.getLocalSetting('filePath', '') || '').trim();
  if (!path) return;
  if (text === lastWritten) return;

  if (!(await api.pythonAvailable())) {
    if (!warned) {
      warned = true;
      api.showNotification('Now Playing → OBS: Python wird zum Schreiben benötigt (im Installer/Plugins aktivieren).');
    }
    return;
  }
  lastWritten = text;

  // Write via Python. JSON.stringify gives safe, properly escaped string literals.
  const code =
    'import io\n' +
    'p = ' + JSON.stringify(path) + '\n' +
    't = ' + JSON.stringify(text) + '\n' +
    'with io.open(p, "w", encoding="utf-8") as f:\n' +
    '    f.write(t)\n';
  try {
    await api.pythonRun(code);
  } catch (e) {
    console.error('[OBS NowPlaying] write failed:', e);
  }
}

return {
  async init() {
    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
      fields: [
        { type: 'text', key: 'filePath', label: 'Datei-Pfad', placeholder: 'C:\\OBS\\nowplaying.txt', onChange: () => { lastWritten = null; } },
        { type: 'text', key: 'format', label: 'Format', placeholder: '{artist} - {title}', onChange: () => { lastWritten = null; } },
        { type: 'text', key: 'idleText', label: 'Text bei Stille', placeholder: '(leer lassen)' },
        {
          type: 'button', key: 'test', label: 'Test', buttonText: 'Jetzt schreiben',
          onClick: async () => {
            lastWritten = null;
            const track = await api.getTrack();
            await writeFile(format(track));
            api.showNotification('In die Datei geschrieben.');
          },
        },
        { type: 'info', id: 'hint', label: 'Tipp', text: 'In OBS: Quelle → Text (GDI+) → "Aus Datei lesen" → diese .txt.' },
      ],
    });

    unsub = api.onTrackChange((track) => writeFile(format(track)));
    const track = await api.getTrack();
    await writeFile(format(track));
  },

  cleanup() {
    if (unsub) unsub();
    api.unregisterSettings();
  },
};

/**
 * Listening Stats — counts how often each track plays and shows your top tracks
 * plus this-session count in an overlay window. Stored locally via plugin data.
 * Pure JS.
 */

let unsub = null;
let win = null;
let lastKey = null;
let session = 0;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function bump(track) {
  if (!track || !track.track) return;
  const key = (track.track || '') + '  —  ' + (track.artist || '');
  if (key === lastKey) return; // poll fires repeatedly for the same song
  lastKey = key;
  session += 1;
  const counts = (await api.getData('counts')) || {};
  counts[key] = (counts[key] || 0) + 1;
  await api.storeData('counts', counts);
  render();
}

async function render() {
  if (!win) return;
  const root = win.getContentElement();
  if (!root) return;
  const counts = (await api.getData('counts')) || {};
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const sessionEl = root.querySelector('#ls-session');
  if (sessionEl) sessionEl.textContent = String(session);
  const list = root.querySelector('#ls-list');
  if (list) {
    list.innerHTML = top.length
      ? top.map(([k, v], i) =>
          `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;">
             <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i + 1}. ${esc(k)}</span>
             <span style="color:rgb(var(--accent-rgb,29,185,84));font-weight:600;">${v}×</span>
           </div>`).join('')
      : '<div style="opacity:.5;font-size:12px;">Noch nichts gespielt.</div>';
  }
}

function openWindow() {
  if (win) { win.show(); render(); return; }
  win = api.createWindow({
    title: 'Listening Stats',
    width: 300,
    height: 320,
    html: `
      <div style="height:100%;display:flex;flex-direction:column;gap:10px;padding:14px;box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:rgba(12,12,14,.95);">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <span style="text-transform:uppercase;letter-spacing:1.5px;font-size:11px;color:rgba(255,255,255,.5);">Diese Session</span>
          <span id="ls-session" style="font-size:22px;font-weight:700;color:rgb(var(--accent-rgb,29,185,84));">0</span>
        </div>
        <div style="text-transform:uppercase;letter-spacing:1.5px;font-size:11px;color:rgba(255,255,255,.5);">Top 5</div>
        <div id="ls-list" style="flex:1;overflow-y:auto;"></div>
      </div>`,
  });
  win.show();
  render();
}

return {
  async init() {
    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="4" width="3" height="14"/></svg>',
      fields: [
        { type: 'button', key: 'open', label: 'Statistik', buttonText: 'Öffnen', onClick: () => openWindow() },
        {
          type: 'button', key: 'reset', label: 'Zurücksetzen', buttonText: 'Alle löschen',
          onClick: async () => { await api.storeData('counts', {}); session = 0; lastKey = null; render(); api.showNotification('Statistik zurückgesetzt.'); },
        },
      ],
    });
    unsub = api.onTrackChange((track) => bump(track));
    const track = await api.getTrack();
    if (track) bump(track);
  },

  cleanup() {
    if (unsub) unsub();
    if (win) { win.close(); win = null; }
    api.unregisterSettings();
  },
};

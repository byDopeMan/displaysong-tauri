/**
 * Stream Clock — a small draggable overlay showing the current time and a
 * session timer. Handy as an OBS source. Not music-related. Pure JS.
 */

let win = null;
let ticker = null;

function pad(n) { return String(n).padStart(2, '0'); }

function fmtClock() {
  const d = new Date();
  const use24 = api.getLocalSetting('format24', true);
  let h = d.getHours();
  let suffix = '';
  if (!use24) {
    suffix = h >= 12 ? ' PM' : ' AM';
    h = h % 12 || 12;
  }
  return `${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${suffix}`;
}

function fmtElapsed() {
  const start = Number(api.getLocalSetting('sessionStart', 0)) || Date.now();
  if (!api.getLocalSetting('sessionStart', 0)) api.setLocalSetting('sessionStart', start);
  let s = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function render() {
  if (!win) return;
  const root = win.getContentElement();
  if (!root) return;
  const clock = root.querySelector('#sc-clock');
  const elapsed = root.querySelector('#sc-elapsed');
  if (clock) clock.textContent = fmtClock();
  if (elapsed) elapsed.textContent = fmtElapsed();
}

function openWindow() {
  if (win) { win.show(); return; }
  win = api.createWindow({
    title: 'Stream Clock',
    width: 260,
    height: 150,
    alwaysOnTop: true,
    html: `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:rgba(10,10,12,.9);">
        <div id="sc-clock" style="font-size:40px;font-weight:700;letter-spacing:1px;font-variant-numeric:tabular-nums;">--:--:--</div>
        <div style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.55);font-size:12px;">
          <span style="text-transform:uppercase;letter-spacing:1.5px;">Session</span>
          <span id="sc-elapsed" style="color:rgb(var(--accent-rgb,29,185,84));font-weight:600;font-variant-numeric:tabular-nums;">00:00:00</span>
        </div>
      </div>`,
  });
  win.show();
  render();
}

return {
  async init() {
    if (!api.getLocalSetting('sessionStart', 0)) api.setLocalSetting('sessionStart', Date.now());

    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      fields: [
        { type: 'button', key: 'open', label: 'Overlay', buttonText: 'Öffnen', onClick: () => openWindow() },
        { type: 'toggle', key: 'format24', label: '24-Stunden-Format', default: true, onChange: () => render() },
        {
          type: 'button', key: 'reset', label: 'Session-Timer', buttonText: 'Zurücksetzen',
          onClick: () => { api.setLocalSetting('sessionStart', Date.now()); render(); api.showNotification('Session-Timer zurückgesetzt'); },
        },
      ],
    });

    ticker = setInterval(render, 1000);
  },

  cleanup() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (win) { win.close(); win = null; }
    api.unregisterSettings();
  },
};

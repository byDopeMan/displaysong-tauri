/**
 * Focus Timer — a Pomodoro-style work/break timer with notifications and a
 * small control window. General productivity tool, no music. Pure JS.
 */

let win = null;
let ticker = null;
let phase = 'idle';      // 'idle' | 'work' | 'break'
let remaining = 0;       // seconds
let running = false;

function workSecs()  { return (Number(api.getLocalSetting('work', 25)) || 25) * 60; }
function breakSecs() { return (Number(api.getLocalSetting('break', 5)) || 5) * 60; }

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function phaseLabel() {
  if (phase === 'work') return 'Arbeit';
  if (phase === 'break') return 'Pause';
  return 'Bereit';
}

function render() {
  if (!win) return;
  const root = win.getContentElement();
  if (!root) return;
  const time = root.querySelector('#ft-time');
  const label = root.querySelector('#ft-label');
  const toggle = root.querySelector('#ft-toggle');
  if (time) time.textContent = phase === 'idle' ? fmt(workSecs()) : fmt(remaining);
  if (label) {
    label.textContent = phaseLabel();
    label.style.color = phase === 'break' ? '#2e9bff' : 'rgb(var(--accent-rgb,29,185,84))';
  }
  if (toggle) toggle.textContent = running ? 'Pause' : 'Start';
}

function switchPhase(next) {
  phase = next;
  remaining = next === 'work' ? workSecs() : breakSecs();
  api.showNotification(next === 'work' ? 'Fokus-Phase gestartet' : 'Pause! Kurz durchatmen.');
  render();
}

function tick() {
  if (!running || phase === 'idle') return;
  remaining -= 1;
  if (remaining <= 0) {
    switchPhase(phase === 'work' ? 'break' : 'work');
  }
  render();
}

function start() {
  if (phase === 'idle') { phase = 'work'; remaining = workSecs(); }
  running = true;
  render();
}
function pause() { running = false; render(); }
function reset() { running = false; phase = 'idle'; remaining = workSecs(); render(); }

function openWindow() {
  if (win) { win.show(); return; }
  win = api.createWindow({
    title: 'Focus Timer',
    width: 240,
    height: 190,
    html: `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:rgba(10,10,12,.92);">
        <div id="ft-label" style="text-transform:uppercase;letter-spacing:2px;font-size:11px;font-weight:700;">Bereit</div>
        <div id="ft-time" style="font-size:46px;font-weight:700;font-variant-numeric:tabular-nums;">25:00</div>
        <div style="display:flex;gap:8px;">
          <button id="ft-toggle" style="cursor:pointer;border:none;border-radius:8px;padding:7px 18px;font-weight:600;color:#000;background:rgb(var(--accent-rgb,29,185,84));">Start</button>
          <button id="ft-reset" style="cursor:pointer;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:7px 14px;font-weight:600;color:#fff;background:transparent;">Reset</button>
        </div>
      </div>`,
  });
  win.show();
  const root = win.getContentElement();
  root.querySelector('#ft-toggle').addEventListener('click', () => (running ? pause() : start()));
  root.querySelector('#ft-reset').addEventListener('click', () => reset());
  render();
}

return {
  async init() {
    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6M5 6l-2 2"/></svg>',
      fields: [
        { type: 'button', key: 'open', label: 'Timer', buttonText: 'Öffnen', onClick: () => openWindow() },
        {
          type: 'select', key: 'work', label: 'Arbeit (Min)', default: '25',
          options: [{ value: '15', label: '15' }, { value: '25', label: '25' }, { value: '45', label: '45' }, { value: '60', label: '60' }],
          onChange: () => { if (phase === 'idle') render(); },
        },
        {
          type: 'select', key: 'break', label: 'Pause (Min)', default: '5',
          options: [{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: '15', label: '15' }],
          onChange: () => {},
        },
      ],
    });
    ticker = setInterval(tick, 1000);
  },

  cleanup() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (win) { win.close(); win = null; }
    running = false; phase = 'idle';
    api.unregisterSettings();
  },
};

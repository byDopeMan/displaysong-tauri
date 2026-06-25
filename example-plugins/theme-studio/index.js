/**
 * Theme Studio — recolours the whole DisplaySong UI by overriding the app's
 * CSS accent variables (--accent / --accent-hover / --accent-rgb). Shows how a
 * plugin can modify the app itself. Pure JS, no Python.
 */

const PRESETS = {
  green:  '#1db954',
  blue:   '#2e9bff',
  violet: '#9146ff',
  pink:   '#ec4899',
  orange: '#ff7a18',
  red:    '#ef4444',
  cyan:   '#06b6d4',
};

const ROOT = document.documentElement;
let glowStyle = null;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || '').trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function lighten(rgb, amt) {
  return rgb.map((c) => Math.min(255, Math.round(c + (255 - c) * amt)));
}
function toHex(rgb) {
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function currentColor() {
  const custom = (api.getLocalSetting('customHex', '') || '').trim();
  const customRgb = hexToRgb(custom);
  if (customRgb) return toHex(customRgb);
  const preset = api.getLocalSetting('accent', 'green');
  return PRESETS[preset] || PRESETS.green;
}

function setGlow(on, rgb) {
  if (on) {
    if (!glowStyle) {
      glowStyle = document.createElement('style');
      glowStyle.id = 'theme-studio-glow';
      document.head.appendChild(glowStyle);
    }
    glowStyle.textContent =
      `.btn-primary, .nav-tab.active, .toggle-switch input:checked + .slider ` +
      `{ box-shadow: 0 0 14px rgba(${rgb.join(',')}, 0.5) !important; }`;
  } else if (glowStyle) {
    glowStyle.remove();
    glowStyle = null;
  }
}

function apply() {
  const hex = currentColor();
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  ROOT.style.setProperty('--accent', hex);
  ROOT.style.setProperty('--accent-hover', toHex(lighten(rgb, 0.12)));
  ROOT.style.setProperty('--accent-rgb', rgb.join(', '));
  setGlow(api.getLocalSetting('glow', false), rgb);
  api.updateSettingsInfo('current', hex.toUpperCase());
}

function restore() {
  ROOT.style.removeProperty('--accent');
  ROOT.style.removeProperty('--accent-hover');
  ROOT.style.removeProperty('--accent-rgb');
  setGlow(false, [0, 0, 0]);
}

return {
  async init() {
    api.registerSettings({
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="11.5" r="2.5"/><circle cx="17.5" cy="13.5" r="2.5"/><path d="M3 21c0-4 3-7 7-7"/></svg>',
      fields: [
        {
          type: 'select',
          key: 'accent',
          label: 'Akzentfarbe',
          default: 'green',
          options: [
            { value: 'green',  label: 'Spotify-Grün' },
            { value: 'blue',   label: 'Ocean-Blau' },
            { value: 'violet', label: 'Twitch-Violett' },
            { value: 'pink',   label: 'Pink' },
            { value: 'orange', label: 'Orange' },
            { value: 'red',    label: 'Rot' },
            { value: 'cyan',   label: 'Türkis' },
          ],
          onChange: () => apply(),
        },
        {
          type: 'text',
          key: 'customHex',
          label: 'Eigener Hex (überschreibt)',
          placeholder: '#1db954',
          onChange: () => apply(),
        },
        {
          type: 'toggle',
          key: 'glow',
          label: 'Akzent-Glow',
          default: false,
          onChange: () => apply(),
        },
        { type: 'info', id: 'current', label: 'Aktiv', text: '—' },
        {
          type: 'button',
          key: 'reset',
          label: 'Zurücksetzen',
          buttonText: 'Standard',
          onClick: () => {
            api.setLocalSetting('accent', 'green');
            api.setLocalSetting('customHex', '');
            api.setLocalSetting('glow', false);
            apply();
            api.showNotification('Theme zurückgesetzt');
          },
        },
      ],
    });
    apply();
  },

  cleanup() {
    restore();
    api.unregisterSettings();
  },
};

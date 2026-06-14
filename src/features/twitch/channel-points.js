/**
 * Twitch Channel-Points UI: request mode switch + reward management.
 *
 * Split out of twitch.js. These functions drive the Channel-Points settings
 * (mode toggle, reward dropdown, create/select reward, test redemption). They
 * read connection state via the isTwitchConnected() getter and persist settings
 * via updateTwitchSettings() from the core module.
 */

import { getTauriInvoke } from '../../core/tauri';
import { showNotification } from '../../ui/notifications';
import { escapeHtml } from './parse';
import { isTwitchConnected } from './state';
import { updateTwitchSettings } from './index.js';

/**
 * Toggle the request-mode UI (chat commands vs. channel points).
 */
export function applyTwitchMode(mode) {
  document.querySelectorAll('#twitch-mode-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const commandSettings = document.getElementById('twitch-command-mode-settings');
  const pointsSettings = document.getElementById('twitch-points-mode-settings');
  if (commandSettings) commandSettings.classList.toggle('hidden', mode !== 'commands');
  if (pointsSettings) pointsSettings.classList.toggle('hidden', mode !== 'points');
}

/**
 * Switch request mode, persist it and reconnect EventSub so the correct
 * subscription (chat messages vs. channel-point redemptions) becomes active.
 */
export async function setTwitchMode(mode) {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  applyTwitchMode(mode);
  try {
    await updateTwitchSettings({ mode });
    if (mode === 'points') {
      await loadRewards();
    }
    if (isTwitchConnected()) await invoke('twitch_connect_eventsub');
  } catch (e) {
    console.error('[Twitch] Set mode error:', e);
  }
}

/**
 * Load the channel's existing point rewards into the dropdown.
 */
export async function loadRewards(selectedId) {
  const invoke = getTauriInvoke();
  const select = document.getElementById('twitch-reward-select');
  if (!invoke || !select) return;

  try {
    const rewards = await invoke('twitch_get_rewards');
    const current = selectedId ?? select.value;
    select.innerHTML = '<option value="">— Belohnung wählen —</option>' +
      (rewards || []).map(r =>
        `<option value="${r.id}">${escapeHtml(r.title)} (${r.cost})</option>`
      ).join('');
    if (current) select.value = current;
  } catch (e) {
    console.error('[Twitch] Load rewards error:', e);
    const msg = String(e).toLowerCase();
    if (msg.includes('403') || msg.includes('affiliate') || msg.includes('partner') || msg.includes('forbidden')) {
      showNotification(
        'Channel Points benötigen Affiliate- oder Partner-Status. Du kannst den Ablauf unten mit „Test-Einlösung simulieren" testen.',
        { type: 'warning', duration: 9000 }
      );
    } else {
      showNotification('Belohnungen konnten nicht geladen werden: ' + e, { type: 'error' });
    }
  }
}

/**
 * Simulate a channel-point redemption locally. Emits the exact `twitch-redemption`
 * event a real redemption produces, so the full request pipeline runs unchanged —
 * letting users test channel points without Affiliate/Partner status.
 */
export async function simulateRedemption() {
  const input = document.getElementById('twitch-test-link');
  const link = input?.value?.trim();
  if (!link) {
    showNotification('Bitte einen Test-Link eingeben (Spotify, YouTube, …).', { type: 'warning' });
    return;
  }
  if (!window.__TAURI__?.event) return;

  try {
    // Unique user id per test so the per-user request cooldown never silently
    // blocks repeated test redemptions (that was why a 2nd test "did nothing").
    await window.__TAURI__.event.emit('twitch-redemption', {
      user_id: `test-${Date.now()}`,
      user_name: 'TestUser',
      user_input: link,
    });
    showNotification('Test-Einlösung ausgelöst — siehe Queue. (Tipp: bei „nichts passiert" prüfe Duplikate-Schutz / ob der Song schon in der Queue ist.)', { type: 'info', duration: 7000 });
  } catch (e) {
    console.error('[Twitch] Test redemption error:', e);
    showNotification('Test-Einlösung fehlgeschlagen: ' + e, { type: 'error' });
  }
}

/**
 * Persist the selected reward id and reconnect EventSub for the redemption sub.
 */
export async function setReward(rewardId) {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke('twitch_set_reward_id', { rewardId: rewardId || null });
    if (isTwitchConnected()) await invoke('twitch_connect_eventsub');
  } catch (e) {
    console.error('[Twitch] Set reward error:', e);
  }
}

/**
 * Create a new "Song Request" channel-point reward, then select it.
 */
export async function createReward() {
  const invoke = getTauriInvoke();
  if (!invoke) return;

  const titleInput = document.getElementById('twitch-reward-title');
  const costInput = document.getElementById('twitch-reward-cost');
  const title = titleInput?.value?.trim() || 'Song Request';
  const cost = parseInt(costInput?.value) || 500;

  try {
    const reward = await invoke('twitch_create_reward', { title, cost });
    showNotification(`Belohnung "${reward.title}" erstellt!`);
    document.getElementById('twitch-create-reward-form')?.classList.add('hidden');
    await loadRewards(reward.id);
    await setReward(reward.id);
  } catch (e) {
    console.error('[Twitch] Create reward error:', e);
    showNotification('Belohnung konnte nicht erstellt werden: ' + e, { type: 'error' });
  }
}

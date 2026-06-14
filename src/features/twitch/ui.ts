/**
 * Twitch settings-panel UI rendering (connection status, buttons, chat preview).
 * Reads connection state via the state accessors; does not mutate it.
 */

import { isTwitchConnected, getTwitchUser } from './state';

/** Update the Twitch status text, connect/disconnect buttons and settings section. */
export function updateTwitchUI(): void {
  const connected = isTwitchConnected();
  const user = getTwitchUser();

  const statusText = document.getElementById('twitch-status-text');
  if (statusText) {
    statusText.textContent = connected ? `Verbunden als ${user?.display_name || 'User'}` : 'Nicht verbunden';
    statusText.classList.toggle('connected', connected);
  }

  const btnConnect = document.getElementById('btn-twitch-connect');
  const btnDisconnect = document.getElementById('btn-twitch-disconnect');

  if (btnConnect) btnConnect.classList.toggle('hidden', connected);
  if (btnDisconnect) btnDisconnect.classList.toggle('hidden', !connected);

  const settingsSection = document.getElementById('twitch-settings-section');
  if (settingsSection) {
    settingsSection.classList.toggle('hidden', !connected);
  }

  const channelDisplay = document.getElementById('twitch-channel-display');
  if (channelDisplay && user) {
    channelDisplay.textContent = user.login;
  }

  const userOption = document.getElementById('twitch-user-option');
  if (userOption && user) {
    userOption.textContent = user.display_name;
  }

  updateChatPreview();
  updateDisconnectAllButton();
}

/** Update the chat preview sender name (bot vs user account). */
export function updateChatPreview(): void {
  const senderName = document.getElementById('chat-sender-name');
  const useBotSelect = document.getElementById('twitch-use-bot') as HTMLSelectElement | null;

  if (senderName && useBotSelect) {
    const useBot = useBotSelect.value === 'true';
    const name = useBot ? 'DisplaySong' : (getTwitchUser()?.display_name || 'Du');

    senderName.textContent = name;
    senderName.classList.remove('bot-name', 'user-name');
    senderName.classList.add(useBot ? 'bot-name' : 'user-name');
  }
}

/** Show the "disconnect all" button only when 2+ connections are active. */
export function updateDisconnectAllButton(): void {
  const btn = document.getElementById('btn-disconnect-all');
  if (!btn) return;

  const spotifyConnected = true;
  const twitchConnected = isTwitchConnected();

  const connectionCount = (spotifyConnected ? 1 : 0) + (twitchConnected ? 1 : 0);
  btn.classList.toggle('hidden', connectionCount < 2);
}

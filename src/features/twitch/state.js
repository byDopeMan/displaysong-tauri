/**
 * Twitch connection state, shared across the twitch modules behind small
 * accessors so no module reassigns another's variables. Zero imports on purpose
 * (keeps it free of circular dependencies).
 */

let connected = false;
let user = null;
let connecting = false;

export function isTwitchConnected() { return connected; }
export function getTwitchUser() { return user; }
export function isConnecting() { return connecting; }

export function setConnected(v) { connected = v; }
export function setUser(u) { user = u; }
export function setConnecting(v) { connecting = v; }

/**
 * Twitch connection state, shared across the twitch modules behind small
 * accessors so no module reassigns another's variables. Zero imports on purpose
 * (keeps it free of circular dependencies).
 */

let connected = false;
let user: any | null = null;
let connecting = false;

export function isTwitchConnected(): boolean { return connected; }
export function getTwitchUser(): any { return user; }
export function isConnecting(): boolean { return connecting; }

export function setConnected(v: boolean): void { connected = v; }
export function setUser(u: any): void { user = u; }
export function setConnecting(v: boolean): void { connecting = v; }

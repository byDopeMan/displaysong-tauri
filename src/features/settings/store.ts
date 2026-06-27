/**
 * Settings data model + reactive store.
 *
 * The plain `settings` object in ./index stays the source of truth that the rest
 * of the app reads synchronously; this store mirrors it so the Svelte settings
 * components (WidgetBehavior.svelte, Appearance.svelte) can render reactively.
 * index.ts keeps the two in sync (loadSettings + the component change handlers).
 */

import { writable } from 'svelte/store';

export interface AppSettings {
  pollingInterval: number;
  autoShowWidgets: boolean;
  rememberPositions: boolean;
  theme: string;
  accentColor: string;
  customAccentColor: string;
  showPlayerTab: boolean;
  showHistoryTab: boolean;
  historyLength: number;
  widgetOpacity: number;
  historyDesign: string;
  widgetAccentColors: Record<string, boolean>;
  autoHideWidgets: boolean;
  showRequesterWidgets: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pollingInterval: 2000,
  autoShowWidgets: false,
  rememberPositions: false,
  theme: 'dark',
  accentColor: 'spotify',
  customAccentColor: '#1db954',
  showPlayerTab: true,
  showHistoryTab: true,
  historyLength: 20,
  widgetOpacity: 100,
  historyDesign: 'simple',
  widgetAccentColors: {},
  autoHideWidgets: false, // Global: hide widgets when paused / nothing playing
  showRequesterWidgets: false, // Global: show requester name in widgets
};

export const settingsStore = writable<AppSettings>({ ...DEFAULT_SETTINGS });

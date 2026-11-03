export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  grain: boolean;
  halftone: boolean;
  glitch: boolean;
  fog: boolean;
  tutorial: boolean;
  shake: boolean;
  quality: 'high' | 'low';
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.9,
  muted: false,
  grain: true,
  halftone: true,
  glitch: true,
  fog: true,
  tutorial: true,
  shake: true,
  quality: 'high',
};

const KEY = 'echozero.settings.v1';
const SAVE_KEY = 'echozero.save.v1';

export interface SaveData {
  /** highest level index reached */
  level: number;
  deaths: number;
  rewinds: number;
  seconds: number;
  completed: boolean;
  secret?: boolean;
}

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(current));
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw) as SaveData;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

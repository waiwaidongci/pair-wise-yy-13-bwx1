import type { DomainEvent } from "./types";

const EVENTS_KEY = "dye-bench.events.v1";
const SETTINGS_KEY = "dye-bench.settings.v1";

export interface Settings {
  limit: number; // 合格 ΔE00 上限
}

export const DEFAULT_SETTINGS: Settings = { limit: 1.0 };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadEvents(): DomainEvent[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DomainEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: DomainEvent[]): void {
  storage()?.setItem(EVENTS_KEY, JSON.stringify(events));
}

export function loadSettings(): Settings {
  const s = storage();
  if (!s) return DEFAULT_SETTINGS;
  try {
    const raw = s.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAll(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(EVENTS_KEY);
  s.removeItem(SETTINGS_KEY);
}

export const EVENTS_STORAGE_KEY = EVENTS_KEY;

import { useSyncExternalStore } from "react";
import { buildSeedEvents } from "../domain/seed";
import {
  DEFAULT_SETTINGS,
  EVENTS_STORAGE_KEY,
  loadEvents,
  loadSettings,
  saveEvents,
  saveSettings,
  type Settings,
} from "../domain/storage";
import type { DomainEvent } from "../domain/types";

let events: DomainEvent[] = [];
let settings: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function init() {
  const stored = loadEvents();
  if (stored.length === 0) {
    events = buildSeedEvents();
    saveEvents(events);
  } else {
    events = stored;
  }
  settings = loadSettings();
}

init();

// 其他标签页写入后本页即时一致
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === EVENTS_STORAGE_KEY) {
      events = loadEvents();
      emit();
    }
  });
}

export const store = {
  getEvents: () => events,
  getSettings: () => settings,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  append(ev: DomainEvent) {
    events = [...events, ev];
    saveEvents(events);
    emit();
  },
  setSettings(next: Settings) {
    settings = next;
    saveSettings(settings);
    emit();
  },
  resetToSeed() {
    events = buildSeedEvents();
    saveEvents(events);
    emit();
  },
  clearAll() {
    events = [];
    saveEvents(events);
    emit();
  },
};

export function useEvents(): DomainEvent[] {
  return useSyncExternalStore(store.subscribe, store.getEvents, store.getEvents);
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    store.subscribe,
    store.getSettings,
    store.getSettings,
  );
}

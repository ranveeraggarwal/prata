import { useSyncExternalStore } from "react";
import type { TabName } from "./sheets";
import { dayKey, type SrsStore } from "./srs";
import type { Level } from "./types";

export interface Settings {
  sheetUrl: string;
  tabUrls: Partial<Record<TabName, string>>;
  level: Level;
  placementDone: boolean;
  newPerDay: number;
  installHintDismissed: boolean;
}

export interface SavedWord {
  id: string;
  form: string;
  lemma: string;
  english: string;
  textId: string;
  addedAt: string;
}

export interface TestResult {
  testId: string;
  score: number;
  total: number;
  at: string;
}

export interface WritingEntry {
  id: string;
  promptId: string;
  text: string;
  words: number;
  missed: string[];
  at: string;
}

export interface ReadingEntry {
  readAt: string;
  correct?: number;
  total?: number;
}

/** A writing-checklist point the learner missed; reviewed like a card. */
export interface CheckItem {
  id: string;
  text: string;
  promptId: string;
}

export interface ProgressData {
  settings: Settings;
  srs: SrsStore;
  saved: Record<string, SavedWord>;
  tests: TestResult[];
  writing: WritingEntry[];
  reading: Record<string, ReadingEntry>;
  checks: Record<string, CheckItem>;
  activity: string[];
  drafts: Record<string, string>;
}

export type SliceName = keyof ProgressData;

export const DEFAULT_SETTINGS: Settings = {
  sheetUrl: "",
  tabUrls: {},
  level: 1,
  placementDone: false,
  newPerDay: 10,
  installHintDismissed: false,
};

const DEFAULTS: ProgressData = {
  settings: DEFAULT_SETTINGS,
  srs: {},
  saved: {},
  tests: [],
  writing: [],
  reading: {},
  checks: {},
  activity: [],
  drafts: {},
};

export const SLICES = Object.keys(DEFAULTS) as SliceName[];
const PREFIX = "prata:v1:";
export const EXPORT_FORMAT = "prata-progress";
export const EXPORT_VERSION = 1;

const cache = new Map<SliceName, unknown>();
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSlice<K extends SliceName>(name: K): ProgressData[K] {
  if (cache.has(name)) return cache.get(name) as ProgressData[K];
  let value: ProgressData[K] = DEFAULTS[name];
  try {
    const raw = storage()?.getItem(PREFIX + name);
    if (raw) {
      const parsed = JSON.parse(raw);
      value = name === "settings" ? ({ ...DEFAULT_SETTINGS, ...parsed } as ProgressData[K]) : parsed;
    }
  } catch {
    // Unreadable or blocked storage: fall back to defaults.
  }
  cache.set(name, value);
  return value;
}

export function writeSlice<K extends SliceName>(name: K, value: ProgressData[K]): void {
  cache.set(name, value);
  try {
    storage()?.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // Storage full or blocked; keep the in-memory value so the session still works.
  }
  listeners.forEach((l) => l());
}

export function updateSlice<K extends SliceName>(name: K, update: (current: ProgressData[K]) => ProgressData[K]): void {
  writeSlice(name, update(readSlice(name)));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(PREFIX)) {
      cache.delete(event.key.slice(PREFIX.length) as SliceName);
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSlice<K extends SliceName>(name: K): ProgressData[K] {
  return useSyncExternalStore(
    subscribe,
    () => readSlice(name),
    () => DEFAULTS[name],
  );
}

/** Records that the learner did something today (for the streak). */
export function markActivity(now = new Date()): void {
  const today = dayKey(now);
  updateSlice("activity", (days) => (days.includes(today) ? days : [...days, today].slice(-400)));
}

/** Consecutive active days ending today, or ending yesterday if today has no activity yet. */
export function streak(activity: string[], now = new Date()): number {
  const days = new Set(activity);
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function exportProgress(now = new Date()): string {
  const data: Partial<ProgressData> = {};
  for (const name of SLICES) (data as Record<string, unknown>)[name] = readSlice(name);
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

export function importProgress(json: string): void {
  let parsed: { format?: string; version?: number; data?: Partial<ProgressData> };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (parsed.format !== EXPORT_FORMAT || !parsed.data) throw new Error("That file isn't a Prata backup.");
  if (parsed.version !== EXPORT_VERSION) throw new Error(`Unsupported backup version ${parsed.version}.`);
  for (const name of SLICES) {
    const value = parsed.data[name];
    if (value !== undefined) writeSlice(name, value as never);
  }
}

export function resetProgress(): void {
  for (const name of SLICES) {
    try {
      storage()?.removeItem(PREFIX + name);
    } catch {
      // ignore
    }
    cache.delete(name);
  }
  listeners.forEach((l) => l());
}

/** Test helper: forget cached slices so the next read comes from storage. */
export function clearCache(): void {
  cache.clear();
}

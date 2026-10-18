import { candidateRefs } from "./items";
import type { CheckItem, ReadingEntry, SavedWord, Settings, WritingEntry } from "./progress";
import { buildQueue, type ItemRef, type SrsStore } from "./srs";
import type { Content, Prompt, Text } from "./types";

/** Texts with kind "hjälp" are reference material (e.g. linking words), not reading practice. */
export function isReadingText(text: Text): boolean {
  return text.kind !== "hjälp";
}

/** Today's Öva queue: due reviews, then new items — saved words and missed checklist points first. */
export function todaysQueue(
  content: Content,
  settings: Settings,
  srs: SrsStore,
  saved: Record<string, SavedWord>,
  checks: Record<string, CheckItem>,
  now = new Date(),
): ItemRef[] {
  const personal: ItemRef[] = [
    ...Object.values(checks).map((c): ItemRef => ({ kind: "check", id: c.id })),
    ...Object.values(saved).map((w): ItemRef => ({ kind: "saved", id: w.id })),
  ];
  return buildQueue(srs, [...personal, ...candidateRefs(content, settings.level)], settings.newPerDay, now);
}

/** The next unread text: at the learner's level first, then easier ones. */
export function nextText(content: Content, settings: Settings, reading: Record<string, ReadingEntry>): Text | undefined {
  const unread = content.texts.filter((t) => isReadingText(t) && !reading[t.id]);
  return unread.find((t) => t.level === settings.level) ?? unread.find((t) => t.level < settings.level);
}

/** The next writing prompt not yet done: at the learner's level first, then easier ones. */
export function nextPrompt(content: Content, settings: Settings, writing: WritingEntry[]): Prompt | undefined {
  const done = new Set(writing.map((w) => w.promptId));
  const open = content.prompts.filter((p) => !done.has(p.id));
  return open.find((p) => p.level === settings.level) ?? open.find((p) => p.level < settings.level);
}

/** Small deterministic hash, used for stable ids and shuffles. */
export function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Shuffles deterministically from a seed, and never returns the original order for 2+ distinct items. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  let state = hash(seed) || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  const same = result.every((item, i) => item === items[i]);
  if (same && new Set(items).size > 1) result.push(result.shift()!);
  return result;
}

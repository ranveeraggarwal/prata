import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";

export { Rating };
export type { Grade };

/** What a review item points at. "check" items are missed writing-checklist points. */
export type ItemKind = "card" | "exercise" | "saved" | "check";

export interface ItemRef {
  kind: ItemKind;
  id: string;
}

/** A scheduled item as stored in localStorage (dates as ISO strings). */
export interface SrsEntry {
  ref: ItemRef;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
  /** Day (YYYY-MM-DD) the item was first reviewed, used for the daily new-item limit. */
  introduced: string;
}

export type SrsStore = Record<string, SrsEntry>;

const scheduler = fsrs({ enable_fuzz: false });

export function refKey(ref: ItemRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toFsrs(entry: SrsEntry): FsrsCard {
  return {
    due: new Date(entry.due),
    stability: entry.stability,
    difficulty: entry.difficulty,
    elapsed_days: entry.elapsed_days,
    scheduled_days: entry.scheduled_days,
    learning_steps: entry.learning_steps,
    reps: entry.reps,
    lapses: entry.lapses,
    state: entry.state,
    last_review: entry.last_review ? new Date(entry.last_review) : undefined,
  };
}

function fromFsrs(card: FsrsCard, ref: ItemRef, introduced: string): SrsEntry {
  return {
    ref,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.toISOString(),
    introduced,
  };
}

/** Records a review and returns the updated entry. A missing entry means a new item. */
export function review(entry: SrsEntry | undefined, ref: ItemRef, grade: Grade, now = new Date()): SrsEntry {
  const card = entry ? toFsrs(entry) : createEmptyCard(now);
  const next = scheduler.next(card, now, grade);
  return fromFsrs(next.card, ref, entry?.introduced ?? dayKey(now));
}

export function isDue(entry: SrsEntry, now = new Date()): boolean {
  return new Date(entry.due).getTime() <= now.getTime();
}

export function dueEntries(store: SrsStore, now = new Date()): SrsEntry[] {
  return Object.values(store)
    .filter((e) => isDue(e, now))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function introducedToday(store: SrsStore, now = new Date()): number {
  const today = dayKey(now);
  return Object.values(store).filter((e) => e.introduced === today).length;
}

/**
 * Builds today's queue: everything due, then new items (in the given order)
 * until the daily limit for new items is reached.
 */
export function buildQueue(
  store: SrsStore,
  candidates: ItemRef[],
  newPerDay: number,
  now = new Date(),
): ItemRef[] {
  const due = dueEntries(store, now).map((e) => e.ref);
  const room = Math.max(0, newPerDay - introducedToday(store, now));
  const fresh = candidates.filter((ref) => !store[refKey(ref)]).slice(0, room);
  return [...due, ...fresh];
}

import type { CheckItem, SavedWord } from "./progress";
import type { ItemRef } from "./srs";
import type { Card, Content, Exercise, GlossEntry, Level } from "./types";

/** Something to show in an Öva session, resolved from a review reference. */
interface ItemBase {
  ref: ItemRef;
  /** Small caption above the prompt: the deck or exercise topic. */
  label: string;
  prompt: string;
  /** Shown after answering. */
  explanation: string;
}

export type ReviewItem =
  | (ItemBase & { mode: "type"; answer: string; alternatives: string[]; hint: string })
  | (ItemBase & { mode: "order"; answer: string; alternatives: string[] })
  | (ItemBase & { mode: "reveal"; answer: string });

/** New items offered to the learner, easiest level first, alternating word cards and exercises. */
export function candidateRefs(content: Content, level: Level): ItemRef[] {
  const cards = content.cards
    .filter((c) => c.level <= level)
    .sort((a, b) => a.level - b.level)
    .map((c): ItemRef => ({ kind: "card", id: c.id }));
  const exercises = content.exercises
    .filter((e) => e.level <= level)
    .sort((a, b) => a.level - b.level)
    .map((e): ItemRef => ({ kind: "exercise", id: e.id }));
  const mixed: ItemRef[] = [];
  for (let i = 0; i < Math.max(cards.length, exercises.length); i++) {
    if (i < cards.length) mixed.push(cards[i]);
    if (i < exercises.length) mixed.push(exercises[i]);
  }
  return mixed;
}

function cardItem(ref: ItemRef, card: Card): ReviewItem {
  if (!card.english) {
    return { ref, mode: "reveal", label: card.deck, prompt: `Vad betyder: ${card.swedish}?`, answer: card.example, explanation: "" };
  }
  return {
    ref,
    mode: "type",
    label: card.deck,
    prompt: card.english,
    hint: card.example ? blankWord(card.example, card.swedish) : "",
    answer: card.swedish,
    alternatives: articleVariants(card.swedish),
    explanation: card.example,
  };
}

function exerciseItem(ref: ItemRef, ex: Exercise): ReviewItem {
  const base = { ref, label: ex.topic, prompt: ex.prompt, explanation: ex.explanation };
  if (ex.type === "order") return { ...base, mode: "order", answer: ex.answer, alternatives: ex.alternatives };
  if (ex.type === "selfcheck" || !ex.answer) return { ...base, mode: "reveal", answer: ex.answer };
  return { ...base, mode: "type", answer: ex.answer, alternatives: ex.alternatives, hint: "" };
}

/** Resolves a review reference against the current content. Null if the item no longer exists. */
export function resolveItem(
  ref: ItemRef,
  content: Content,
  saved: Record<string, SavedWord>,
  checks: Record<string, CheckItem>,
): ReviewItem | null {
  switch (ref.kind) {
    case "card": {
      const card = content.cards.find((c) => c.id === ref.id);
      return card ? cardItem(ref, card) : null;
    }
    case "exercise": {
      const ex = content.exercises.find((e) => e.id === ref.id);
      return ex ? exerciseItem(ref, ex) : null;
    }
    case "saved": {
      const word = saved[ref.id];
      if (!word) return null;
      const swedish = word.lemma || word.form;
      const base = { ref, label: "Sparat ord", explanation: "" };
      if (!word.english) return { ...base, mode: "reveal", prompt: `Vad betyder: ${swedish}?`, answer: "" };
      return { ...base, mode: "type", prompt: word.english, answer: swedish, alternatives: [word.form], hint: "" };
    }
    case "check": {
      const check = checks[ref.id];
      if (!check) return null;
      return {
        ref,
        mode: "reveal",
        label: "Från din skrivning",
        prompt: `Skriv en mening och tänk på: ${check.text}`,
        answer: "",
        explanation: "",
      };
    }
  }
}

/** "en smörgås" also accepts "smörgås"; the article is part of what's learned but not required. */
function articleVariants(swedish: string): string[] {
  const match = /^(en|ett)\s+(.+)$/i.exec(swedish.trim());
  return match ? [match[2]] : [];
}

function blankWord(example: string, swedish: string): string {
  const head = swedish.replace(/^(en|ett|att)\s+/i, "").split(/[\s–-]/)[0];
  if (head.length < 3) return example;
  const stem = head.slice(0, Math.max(3, head.length - 2));
  const re = new RegExp(`(?<!\\p{L})${escapeRegExp(stem)}\\p{L}*`, "giu");
  return re.test(example) ? example.replace(re, "___") : example;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word lookups for the reading view: this text's glossary first, then global entries. */
export function makeGlossary(entries: GlossEntry[], textId: string): (form: string) => GlossEntry | undefined {
  const local = new Map<string, GlossEntry>();
  const global = new Map<string, GlossEntry>();
  for (const e of entries) {
    const key = e.form.toLowerCase();
    if (e.textId === textId) local.set(key, e);
    else if (!e.textId && !global.has(key)) global.set(key, e);
  }
  return (form) => {
    const key = form.toLowerCase();
    return local.get(key) ?? global.get(key);
  };
}

/** Saved words are keyed by base form so the same word saved from two texts is one card. */
export function savedWordId(entry: { form: string; lemma?: string }): string {
  return `w:${(entry.lemma || entry.form).toLowerCase()}`;
}

/** Splits a text into word and non-word pieces so words can be tapped. */
export function tokenize(body: string): { text: string; word: boolean }[] {
  const pieces: { text: string; word: boolean }[] = [];
  const re = /[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*/gu;
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) pieces.push({ text: body.slice(last, m.index), word: false });
    pieces.push({ text: m[0], word: true });
    last = m.index! + m[0].length;
  }
  if (last < body.length) pieces.push({ text: body.slice(last), word: false });
  return pieces;
}

/**
 * Lund's placement rules, as percentages of the real tests (40 questions each):
 * test 1 ≥ 25 → level 2, > 33 → also take test 2; test 2 ≥ 24 → level 3.
 */
export function placementAfter(testId: "lund-1" | "lund-2", score: number, total: number): { level: Level; next?: "lund-2" } {
  const pct = total ? score / total : 0;
  if (testId === "lund-1") {
    if (pct > 33 / 40) return { level: 2, next: "lund-2" };
    return { level: pct >= 25 / 40 ? 2 : 1 };
  }
  return { level: pct >= 24 / 40 ? 3 : 2 };
}

/** Passing a checkpoint at (or above) your level moves you up one level. */
export const PASS_MARK = 0.7;

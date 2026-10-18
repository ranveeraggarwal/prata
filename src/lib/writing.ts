import { hash, seededShuffle } from "./session";
import { tokenize } from "./items";
import type { SavedWord } from "./progress";
import type { Content, Level, Prompt } from "./types";

/** Used when a prompt has no checklist of its own. The later points only apply from level 2 or 3. */
const DEFAULT_CHECKLIST: { from: Level; text: string }[] = [
  { from: 1, text: "Verbet står på plats två i huvudsatser (Idag äter jag …, inte Idag jag äter …)." },
  { from: 1, text: "En eller ett – och rätt form: en bil/bilen/bilar, ett hus/huset/hus." },
  { from: 1, text: "Rätt tid: presens (äter), preteritum (åt) eller perfekt (har ätit)." },
  { from: 2, text: "Adjektivet passar substantivet: en stor bil, ett stort hus, stora bilar, den stora bilen." },
  { from: 2, text: "I bisatser står inte före verbet: … eftersom jag inte hade tid." },
  { from: 2, text: "Sin/sitt/sina när det syftar på subjektet: Anna ringer sin mamma." },
  { from: 3, text: "Texten hänger ihop med sambandsord (först, sedan, eftersom, därför, dessutom …)." },
  { from: 1, text: "Texten har en naturlig början och ett naturligt slut." },
];

export function checklistFor(prompt: Prompt, learnerLevel: Level): string[] {
  if (prompt.checklist.length) return prompt.checklist;
  const level = Math.max(prompt.level, learnerLevel);
  return DEFAULT_CHECKLIST.filter((c) => c.from <= level).map((c) => c.text);
}

export interface TargetWord {
  word: string;
  english: string;
}

/** Up to three words to use in the text: recently saved words first, then words from the deck. */
export function targetWords(prompt: Prompt, content: Content, saved: Record<string, SavedWord>, level: Level): TargetWord[] {
  const picks: TargetWord[] = Object.values(saved)
    .filter((w) => w.english)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 3)
    .map((w) => ({ word: w.lemma || w.form, english: w.english }));
  const pool = content.cards.filter((c) => c.level <= level && c.english && c.deck !== "slang" && !c.swedish.includes("–"));
  for (const card of seededShuffle(pool, prompt.id)) {
    if (picks.length >= 3) break;
    const word = card.swedish.replace(/^(en|ett|att)\s+/i, "");
    if (!picks.some((p) => p.word === word)) picks.push({ word, english: card.english });
  }
  return picks;
}

/** True when some word in the text starts like the target word (so "cyklade" counts for "cykla"). */
export function usesWord(text: string, target: string): boolean {
  const head = target.toLowerCase().split(/\s+/)[0];
  const stem = head.length > 4 ? head.slice(0, head.length - 1) : head;
  return tokenize(text.toLowerCase()).some((t) => t.word && t.text.startsWith(stem));
}

export function wordCount(text: string): number {
  return tokenize(text).filter((t) => t.word).length;
}

export function checkItemId(text: string): string {
  return `c${hash(text).toString(36)}`;
}

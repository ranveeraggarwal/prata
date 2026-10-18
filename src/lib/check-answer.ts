export type CheckResult = "correct" | "accent" | "wrong";

export interface Checked {
  result: CheckResult;
  /** The answer to show the learner (the main one, not an alternative). */
  expected: string;
}

/** Lowercase, unify quotes/dashes, collapse whitespace, drop sentence-final punctuation. */
export function normalize(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([,;:])\s*/g, "$1 ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

/** Strips the letters that are easy to type without: å→a, ä→a, ö→o, é→e. */
export function foldSwedish(value: string): string {
  return value.replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/[éè]/g, "e").replace(/ü/g, "u");
}

export function checkAnswer(input: string, answer: string, alternatives: string[] = []): Checked {
  const accepted = [answer, ...alternatives].map(normalize).filter(Boolean);
  const given = normalize(input);
  if (!given) return { result: "wrong", expected: answer };
  if (accepted.includes(given)) return { result: "correct", expected: answer };
  const folded = foldSwedish(given);
  if (accepted.some((a) => foldSwedish(a) === folded)) return { result: "accent", expected: answer };
  return { result: "wrong", expected: answer };
}

/**
 * Resolves a multiple-choice key to an option index. The key can be a letter
 * ("b", "B)", "b.") or the option text itself. Returns -1 when it can't be resolved.
 */
export function answerIndex(options: string[], key: string): number {
  const trimmed = key.trim();
  if (!trimmed) return -1;
  const letter = /^([a-hA-H])[).:]?$/.exec(trimmed);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    return index < options.length ? index : -1;
  }
  const wanted = normalize(trimmed);
  return options.findIndex((o) => normalize(stripOptionLetter(o)) === wanted || normalize(o) === wanted);
}

/** "b) tidigare" → "tidigare". Options in the kit sometimes keep their letter. */
export function stripOptionLetter(option: string): string {
  return option.replace(/^\s*[a-hA-H][).]\s+/, "");
}

/** Splits an "order" answer into its tiles ("den nya filmen / är / bra." → 3 tiles). */
export function orderTiles(answer: string): string[] {
  return answer
    .split(" / ")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinTiles(tiles: string[]): string {
  return tiles.join(" ").replace(/\s+([.,!?])/g, "$1");
}

export type Level = 1 | 2 | 3 | 4 | 5;

export const LEVELS: Level[] = [1, 2, 3, 4, 5];

export const LEVEL_NAMES: Record<Level, string> = {
  1: "Nivå 1",
  2: "Nivå 2",
  3: "Nivå 3",
  4: "Nivå 4",
  5: "Riktig svenska",
};

export interface Text {
  id: string;
  level: Level;
  title: string;
  source: string;
  kind: string;
  body: string;
}

export interface GlossEntry {
  /** Empty means the entry applies to every text. */
  textId: string;
  form: string;
  lemma: string;
  english: string;
}

export interface Question {
  textId: string;
  question: string;
  options: string[];
  /** A letter ("b"), the option text, or empty when the kit has no key. */
  answer: string;
}

export interface Card {
  id: string;
  deck: string;
  level: Level;
  swedish: string;
  english: string;
  example: string;
  /** Other accepted Swedish answers (optional column). */
  alternatives: string[];
}

export type ExerciseType = "cloze" | "order" | "conjugate" | "translate" | "selfcheck";

export interface Exercise {
  id: string;
  level: Level;
  topic: string;
  type: ExerciseType;
  prompt: string;
  /** For "order" exercises the tiles are separated by " / ". */
  answer: string;
  alternatives: string[];
  explanation: string;
}

export interface TestQuestion {
  section: string;
  number: string;
  question: string;
  options: string[];
  answer: string;
}

export interface Test {
  id: string;
  title: string;
  level: Level;
  questions: TestQuestion[];
}

export interface Prompt {
  id: string;
  level: Level;
  title: string;
  task: string;
  hints: string[];
  checklist: string[];
}

export interface Content {
  texts: Text[];
  glossary: GlossEntry[];
  questions: Question[];
  cards: Card[];
  exercises: Exercise[];
  tests: Test[];
  prompts: Prompt[];
  syncedAt: string;
}

export const EMPTY_CONTENT: Content = {
  texts: [],
  glossary: [],
  questions: [],
  cards: [],
  exercises: [],
  tests: [],
  prompts: [],
  syncedAt: "",
};

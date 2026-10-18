import Papa from "papaparse";
import type {
  Card,
  Content,
  Exercise,
  ExerciseType,
  GlossEntry,
  Level,
  Prompt,
  Question,
  Test,
  Text,
} from "./types";

/** Tab name in the Sheet → columns the app needs. `cards` may also have an `alternatives` column. */
export const TABS = {
  texts: ["id", "level", "title", "source", "kind", "part", "body"],
  glossary: ["text_id", "form", "lemma", "english"],
  questions: ["text_id", "question", "options", "answer"],
  cards: ["id", "deck", "level", "swedish", "english", "example"],
  exercises: ["id", "level", "topic", "type", "prompt", "answer", "alternatives", "explanation"],
  tests: ["test_id", "title", "level", "section", "number", "question", "options", "answer"],
  prompts: ["id", "level", "title", "task", "hints", "checklist"],
} as const;

export type TabName = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as TabName[];

export type Row = Record<string, string>;
export type Tables = Partial<Record<TabName, Row[]>>;

export interface SheetSource {
  /** The Sheet's normal link (…/spreadsheets/d/<id>/…). */
  sheetUrl?: string;
  /** Fallback: one "Publish to web → CSV" link per tab. */
  tabUrls?: Partial<Record<TabName, string>>;
}

export interface SyncResult {
  content: Content;
  warnings: string[];
}

const DOC_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/;

/** Extracts the document id from a Sheet link, or returns null for anything else. */
export function parseSheetId(input: string): string | null {
  const trimmed = input.trim();
  const match = DOC_ID_RE.exec(trimmed);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed)) return trimmed;
  return null;
}

/** "Publish to web" links (…/d/e/2PACX…) can't be used to pick tabs by name. */
export function isPublishedLink(input: string): boolean {
  return /\/spreadsheets\/d\/e\//.test(input);
}

export function tabCsvUrl(docId: string, tab: TabName): string {
  // headers=1 stops Google from guessing several header rows when every cell is text.
  return `https://docs.google.com/spreadsheets/d/${docId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
}

export function parseCsv(csv: string): { header: string[]; rows: Row[] } {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" });
  const [first, ...lines] = parsed.data;
  if (!first) return { header: [], rows: [] };
  const keys = first.map((h) => h.trim().toLowerCase());
  const rows = lines.map((line) => {
    const row: Row = {};
    keys.forEach((key, i) => {
      if (key) row[key] = (line[i] ?? "").trim();
    });
    return row;
  });
  return { header: keys.filter(Boolean), rows };
}

function headerMatch(tab: TabName, header: string[]): number {
  const expected = TABS[tab];
  return expected.filter((col) => header.includes(col)).length / expected.length;
}

/**
 * Google answers a request for a tab that doesn't exist with the first tab instead,
 * so a tab only counts as found when its header fits it at least as well as any other tab.
 */
export function looksLikeTab(tab: TabName, header: string[]): boolean {
  const own = headerMatch(tab, header);
  return own >= 0.5 && TAB_NAMES.every((other) => headerMatch(other, header) <= own);
}

function toLevel(value: string | undefined): Level {
  const n = Number.parseInt(value ?? "", 10);
  return n >= 1 && n <= 5 ? (n as Level) : 1;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EXERCISE_TYPES: ExerciseType[] = ["cloze", "order", "conjugate", "translate", "selfcheck"];

function missingColumns(tab: TabName, rows: Row[]): string[] {
  if (rows.length === 0) return [];
  const present = new Set(Object.keys(rows[0]));
  return TABS[tab].filter((col) => !present.has(col));
}

/** Turns raw Sheet rows into app content. Pure, so it can be tested without a network. */
export function rowsToContent(tables: Tables, syncedAt = new Date().toISOString()): SyncResult {
  const warnings: string[] = [];
  for (const tab of TAB_NAMES) {
    const rows = tables[tab];
    if (rows === undefined) {
      warnings.push(`Tab "${tab}" was not found.`);
      continue;
    }
    const missing = missingColumns(tab, rows);
    if (missing.length) warnings.push(`Tab "${tab}" is missing columns: ${missing.join(", ")}.`);
  }

  const textParts = new Map<string, { text: Text; parts: { part: number; body: string }[] }>();
  for (const row of tables.texts ?? []) {
    if (!row.id) continue;
    let entry = textParts.get(row.id);
    if (!entry) {
      entry = {
        text: {
          id: row.id,
          level: toLevel(row.level),
          title: row.title || row.id,
          source: row.source ?? "",
          kind: row.kind ?? "",
          body: "",
        },
        parts: [],
      };
      textParts.set(row.id, entry);
    }
    entry.parts.push({ part: Number.parseInt(row.part ?? "", 10) || 1, body: row.body ?? "" });
  }
  const texts: Text[] = [...textParts.values()].map(({ text, parts }) => ({
    ...text,
    body: parts
      .sort((a, b) => a.part - b.part)
      .map((p) => p.body.trim())
      .join("\n\n"),
  }));

  const glossary: GlossEntry[] = (tables.glossary ?? [])
    .filter((r) => r.form)
    .map((r) => ({
      textId: r.text_id ?? "",
      form: r.form,
      lemma: r.lemma ?? "",
      english: r.english ?? "",
    }));

  const questions: Question[] = (tables.questions ?? [])
    .filter((r) => r.text_id && r.question)
    .map((r) => ({
      textId: r.text_id,
      question: r.question,
      options: splitList(r.options),
      answer: r.answer ?? "",
    }));

  const cards: Card[] = (tables.cards ?? [])
    .filter((r) => r.swedish)
    .map((r) => ({
      id: r.id || `${r.deck ?? "ord"}:${r.swedish}`,
      deck: r.deck || "ord",
      level: toLevel(r.level),
      swedish: r.swedish,
      english: r.english ?? "",
      example: r.example ?? "",
      alternatives: splitList(r.alternatives),
    }));

  const exercises: Exercise[] = [];
  for (const r of tables.exercises ?? []) {
    if (!r.prompt && !r.answer) continue;
    const type = (r.type ?? "").toLowerCase() as ExerciseType;
    if (!EXERCISE_TYPES.includes(type)) {
      warnings.push(`Exercise "${r.id || r.prompt}" has unknown type "${r.type}" and was skipped.`);
      continue;
    }
    exercises.push({
      id: r.id || `${type}:${r.prompt}`,
      level: toLevel(r.level),
      topic: r.topic ?? "",
      type,
      prompt: r.prompt ?? "",
      answer: r.answer ?? "",
      alternatives: splitList(r.alternatives),
      explanation: r.explanation ?? "",
    });
  }

  const testsById = new Map<string, Test>();
  for (const r of tables.tests ?? []) {
    if (!r.test_id || !r.question) continue;
    let test = testsById.get(r.test_id);
    if (!test) {
      test = { id: r.test_id, title: r.title || r.test_id, level: toLevel(r.level), questions: [] };
      testsById.set(r.test_id, test);
    } else if (!test.title || test.title === test.id) {
      test.title = r.title || test.title;
    }
    test.questions.push({
      section: r.section ?? "",
      number: r.number ?? "",
      question: r.question,
      options: splitList(r.options),
      answer: r.answer ?? "",
    });
  }

  const prompts: Prompt[] = (tables.prompts ?? [])
    .filter((r) => r.id && r.task)
    .map((r) => ({
      id: r.id,
      level: toLevel(r.level),
      title: r.title || r.id,
      task: r.task,
      hints: splitList(r.hints),
      checklist: splitList(r.checklist),
    }));

  return {
    content: {
      texts,
      glossary,
      questions,
      cards,
      exercises,
      tests: [...testsById.values()],
      prompts,
      syncedAt,
    },
    warnings,
  };
}

/** Downloads every tab and converts it. Tabs that fail are reported as warnings. */
export async function fetchContent(
  source: SheetSource,
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const docId = source.sheetUrl ? parseSheetId(source.sheetUrl) : null;
  if (!docId && !Object.values(source.tabUrls ?? {}).some(Boolean)) {
    throw new Error(
      source.sheetUrl && isPublishedLink(source.sheetUrl)
        ? "That's the \"Publish to web\" link. Paste the Sheet's normal link from the address bar instead (…/spreadsheets/d/…/edit)."
        : "That doesn't look like a Google Sheets link.",
    );
  }

  const tables: Tables = {};
  const fetchErrors: string[] = [];
  const fetchFailed = new Set<TabName>();
  await Promise.all(
    TAB_NAMES.map(async (tab) => {
      const url = source.tabUrls?.[tab] || (docId ? tabCsvUrl(docId, tab) : "");
      if (!url) return;
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (/^\s*<(!doctype|html)/i.test(body)) {
          throw new Error("Google returned a web page instead of CSV — is the Sheet published?");
        }
        const { header, rows } = parseCsv(body);
        if (looksLikeTab(tab, header)) tables[tab] = rows;
      } catch (err) {
        fetchFailed.add(tab);
        fetchErrors.push(`Couldn't load tab "${tab}": ${(err as Error).message}`);
      }
    }),
  );

  if (Object.keys(tables).length === 0) {
    throw new Error(
      fetchErrors[0] ?? `None of the expected tabs (${TAB_NAMES.join(", ")}) were found in this Sheet.`,
    );
  }
  const result = rowsToContent(tables);
  // A tab that failed to download is already explained by its fetch error.
  result.warnings = [
    ...fetchErrors,
    ...result.warnings.filter((w) => ![...fetchFailed].some((t) => w === `Tab "${t}" was not found.`)),
  ];
  return result;
}

import { describe, expect, it } from "vitest";
import { rowsToContent } from "@/lib/sheets";
import { checklistFor, targetWords, usesWord, wordCount } from "@/lib/writing";
import { sampleTables } from "./fixtures";

const { content } = rowsToContent(sampleTables());
const semester = content.prompts.find((p) => p.id === "semester")!;
const brev = content.prompts.find((p) => p.id === "brev")!;

describe("checklistFor", () => {
  it("uses the prompt's own checklist when it has one", () => {
    expect(checklistFor(semester, 3)).toEqual(semester.checklist);
  });
  it("falls back to a default that grows with the level", () => {
    expect(checklistFor(brev, 2).length).toBeLessThan(checklistFor(brev, 3).length);
    expect(checklistFor({ ...brev, level: 1 }, 1).some((c) => c.includes("bisatser"))).toBe(false);
  });
});

describe("targetWords", () => {
  it("prefers recently saved words and fills up from the deck", () => {
    const saved = {
      a: { id: "a", form: "tältet", lemma: "tält", english: "tent", textId: "fjallen", addedAt: "2026-10-18T10:00:00Z" },
    };
    const words = targetWords(semester, content, saved, 1);
    expect(words[0]).toEqual({ word: "tält", english: "tent" });
    expect(words).toHaveLength(3);
    expect(new Set(words.map((w) => w.word)).size).toBe(3);
  });
  it("stops when the deck has fewer distinct words than needed", () => {
    const tiny = { ...content, cards: [content.cards[0], { ...content.cards[0], id: "dup" }] };
    expect(targetWords(semester, tiny, {}, 1)).toHaveLength(1);
  });
});

describe("usesWord and wordCount", () => {
  it("recognises inflected forms", () => {
    expect(usesWord("Jag cyklade till jobbet.", "cykla")).toBe(true);
    expect(usesWord("Vi åt en smörgås.", "smörgås")).toBe(true);
    expect(usesWord("Jag gick hem.", "cykla")).toBe(false);
  });
  it("counts words, not punctuation", () => {
    expect(wordCount("Hej! Jag heter Anna, och du?")).toBe(6);
  });
});

import { describe, expect, it } from "vitest";
import { candidateRefs, makeGlossary, placementAfter, resolveItem, tokenize } from "@/lib/items";
import { rowsToContent } from "@/lib/sheets";
import { sampleTables } from "./fixtures";

const { content } = rowsToContent(sampleTables());

describe("candidateRefs", () => {
  it("only offers items up to the learner's level, easiest first, mixing cards and exercises", () => {
    const refs = candidateRefs(content, 1);
    expect(refs.slice(0, 2).map((r) => r.kind)).toEqual(["card", "exercise"]);
    expect(refs.find((r) => r.id === "ord-tält")).toBeUndefined();
    expect(candidateRefs(content, 3).find((r) => r.id === "ord-tält")).toBeDefined();
  });
});

describe("resolveItem", () => {
  it("asks for the Swedish word from English, with the example blanked", () => {
    const item = resolveItem({ kind: "card", id: "ord-vakna" }, content, {}, {})!;
    expect(item).toMatchObject({ mode: "type", label: "ord", prompt: "to wake up", answer: "vakna", hint: "Jag ___ tidigt.", explanation: "Jag vaknar tidigt." });
  });
  it("accepts a noun without its article", () => {
    const item = resolveItem({ kind: "card", id: "ord-smorgas" }, content, {}, {});
    expect(item && item.mode === "type" && item.alternatives).toEqual(["smörgås"]);
  });
  it("maps exercise types to the right mode", () => {
    expect(resolveItem({ kind: "exercise", id: "ord-1" }, content, {}, {})!.mode).toBe("order");
    expect(resolveItem({ kind: "exercise", id: "self-1" }, content, {}, {})!.mode).toBe("reveal");
    expect(resolveItem({ kind: "exercise", id: "prep-1" }, content, {}, {})!.mode).toBe("type");
  });
  it("returns null for items removed from the Sheet", () => {
    expect(resolveItem({ kind: "card", id: "gone" }, content, {}, {})).toBeNull();
  });
});

describe("glossary and tokens", () => {
  it("prefers the text's own glossary and falls back to global entries", () => {
    const lookup = makeGlossary(content.glossary, "morgon");
    expect(lookup("Vaknar")?.english).toBe("wakes up");
    expect(lookup("och")?.english).toBe("and");
    expect(lookup("tält")).toBeUndefined();
  });
  it("splits words and punctuation", () => {
    const tokens = tokenize("Hej, fjäll-stuga!");
    expect(tokens.filter((t) => t.word).map((t) => t.text)).toEqual(["Hej", "fjäll-stuga"]);
    expect(tokens.map((t) => t.text).join("")).toBe("Hej, fjäll-stuga!");
  });
});

describe("placementAfter", () => {
  it("follows Lund's thresholds", () => {
    expect(placementAfter("lund-1", 20, 40)).toEqual({ level: 1 });
    expect(placementAfter("lund-1", 25, 40)).toEqual({ level: 2 });
    expect(placementAfter("lund-1", 34, 40)).toEqual({ level: 2, next: "lund-2" });
    expect(placementAfter("lund-2", 24, 40)).toEqual({ level: 3 });
    expect(placementAfter("lund-2", 10, 40)).toEqual({ level: 2 });
  });
});

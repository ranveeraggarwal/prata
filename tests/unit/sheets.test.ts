import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchContent,
  isPublishedLink,
  looksLikeTab,
  parseCsv,
  parseSheetId,
  PUBLISH_HINT,
  rowsToContent,
  SHARE_HINT,
  tabCsvUrl,
} from "@/lib/sheets";
import { sampleCsv, sampleTables } from "./fixtures";

const SHEET = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc/edit#gid=0";

describe("sheet links", () => {
  it("extracts the id from a normal link", () => {
    expect(parseSheetId(SHEET)).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc");
  });
  it("does not treat Publish-to-web links as ids", () => {
    const pub = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSabcdefghijklmnopqrstuvwxyz/pub?output=csv";
    expect(parseSheetId(pub)).toBeNull();
    expect(isPublishedLink(pub)).toBe(true);
  });
  it("builds a per-tab CSV link with a single header row", () => {
    expect(tabCsvUrl("ID", "texts")).toBe(
      "https://docs.google.com/spreadsheets/d/ID/gviz/tq?tqx=out:csv&headers=1&sheet=texts",
    );
  });
});

describe("parseCsv", () => {
  it("lowercases headers, drops Google's empty trailing columns and keeps multi-line cells", () => {
    const { header, rows } = parseCsv('"ID","Body","",""\n"a","rad 1\nrad 2","",""\n');
    expect(header).toEqual(["id", "body"]);
    expect(rows).toEqual([{ id: "a", body: "rad 1\nrad 2" }]);
  });
  it("recognises tabs by their header", () => {
    expect(looksLikeTab("cards", ["id", "deck", "level", "swedish", "english", "example"])).toBe(true);
    expect(looksLikeTab("cards", ["id", "level", "title", "source", "kind", "part", "body"])).toBe(false);
  });
});

describe("rowsToContent", () => {
  it("converts the sample sheet", () => {
    const { content, warnings } = rowsToContent(sampleTables(), "2026-10-18T00:00:00Z");
    expect(warnings).toEqual([]);
    const fjallen = content.texts.find((t) => t.id === "fjallen")!;
    expect(fjallen.level).toBe(3);
    expect(fjallen.body).toMatch(/hel vecka[\s\S]*Den sista dagen/);
    expect(content.questions.find((q) => q.textId === "morgon")!.options).toEqual(["Med buss", "Med cykel", "Hon går"]);
    expect(content.glossary.find((g) => g.form === "och")!.textId).toBe("");
    expect(content.exercises.find((e) => e.id === "prep-2")!.alternatives).toEqual(["i", "på"]);
    const lund = content.tests.find((t) => t.id === "lund-1")!;
    expect(lund.title).toBe("Placement test 1 (sample)");
    expect(lund.questions).toHaveLength(4);
    expect(content.prompts[0].checklist).toHaveLength(2);
  });

  it("warns about missing tabs, missing columns and unknown exercise types", () => {
    const { content, warnings } = rowsToContent({
      texts: [{ id: "x", body: "Hej" }],
      exercises: [{ id: "e1", type: "quiz", prompt: "?", answer: "!" }],
    });
    expect(content.texts[0]).toMatchObject({ id: "x", level: 1, title: "x" });
    expect(content.exercises).toHaveLength(0);
    expect(warnings).toEqual(
      expect.arrayContaining([
        'Tab "cards" was not found.',
        expect.stringMatching(/^Tab "texts" is missing columns: level, title/),
        expect.stringMatching(/unknown type "quiz"/),
      ]),
    );
  });
});

describe("fetchContent", () => {
  const csvFetch = (overrides: Record<string, string | null> = {}) =>
    (async (input: RequestInfo | URL) => {
      const tab = new URL(String(input)).searchParams.get("sheet")!;
      if (tab in overrides) {
        const body = overrides[tab];
        return body === null ? new Response("nope", { status: 404 }) : new Response(body);
      }
      return new Response(sampleCsv(tab));
    }) as typeof fetch;

  it("loads every tab by name", async () => {
    const { content, warnings } = await fetchContent({ sheetUrl: SHEET }, csvFetch());
    expect(warnings).toEqual([]);
    expect(content.texts.length).toBeGreaterThan(0);
    expect(content.tests.map((t) => t.id)).toContain("berlitz-1");
  });

  it("treats Google's fallback to the first tab as a missing tab", async () => {
    const { content, warnings } = await fetchContent({ sheetUrl: SHEET }, csvFetch({ prompts: sampleCsv("texts") }));
    expect(content.prompts).toEqual([]);
    expect(warnings).toEqual(['Tab "prompts" was not found.']);
  });

  it("reports tabs that fail to download", async () => {
    const { warnings } = await fetchContent({ sheetUrl: SHEET }, csvFetch({ cards: null }));
    expect(warnings).toEqual(['Couldn\'t load tab "cards": HTTP 404']);
  });

  const TABS = ["texts", "glossary", "questions", "cards", "exercises", "tests", "prompts"];

  it("explains a Sheet that answers with Google's login page", async () => {
    const html = "<!DOCTYPE html><html>Sign in</html>";
    const all = Object.fromEntries(TABS.map((t) => [t, html]));
    await expect(fetchContent({ sheetUrl: SHEET }, csvFetch(all))).rejects.toThrow(SHARE_HINT);
  });

  it("explains a private Sheet: browsers can't follow Google's redirect to the login page", async () => {
    // This is what fetch does in a browser: it rejects with a bare TypeError.
    const blocked = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await expect(fetchContent({ sheetUrl: SHEET }, blocked)).rejects.toThrow(SHARE_HINT);
  });

  it("explains a 401 or 403 from Google", async () => {
    for (const status of [401, 403]) {
      const refused = (async () => new Response("no", { status })) as typeof fetch;
      await expect(fetchContent({ sheetUrl: SHEET }, refused)).rejects.toThrow(SHARE_HINT);
    }
  });

  it("points at publishing when a per-tab link is refused", async () => {
    const refused = (async () => new Response("no", { status: 401 })) as typeof fetch;
    await expect(
      fetchContent({ tabUrls: { cards: "https://example.com/cards.csv" } }, refused),
    ).rejects.toThrow(PUBLISH_HINT);
  });

  it("keeps the other tabs when only one is blocked", async () => {
    const oneBlocked = (async (input: RequestInfo | URL) => {
      const tab = new URL(String(input)).searchParams.get("sheet")!;
      if (tab === "cards") throw new TypeError("Failed to fetch");
      return new Response(sampleCsv(tab));
    }) as typeof fetch;
    const { content, warnings } = await fetchContent({ sheetUrl: SHEET }, oneBlocked);
    expect(content.texts.length).toBeGreaterThan(0);
    expect(content.cards).toEqual([]);
    expect(warnings).toEqual(['Couldn\'t load tab "cards": Google blocked the request.']);
  });

  describe("offline", () => {
    afterEach(() => vi.restoreAllMocks());

    it("says so instead of blaming the Sheet", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      const never = (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch;
      await expect(fetchContent({ sheetUrl: SHEET }, never)).rejects.toThrow(/offline/i);
    });
  });

  it("uses per-tab links when given", async () => {
    const seen: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response(sampleCsv("cards"));
    }) as typeof fetch;
    const { content } = await fetchContent({ tabUrls: { cards: "https://example.com/cards.csv" } }, fetcher);
    expect(seen).toEqual(["https://example.com/cards.csv"]);
    expect(content.cards.length).toBeGreaterThan(0);
  });
});

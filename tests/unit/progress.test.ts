import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCache,
  exportProgress,
  importProgress,
  markActivity,
  readSlice,
  resetProgress,
  streak,
  writeSlice,
} from "@/lib/progress";

beforeEach(() => {
  localStorage.clear();
  clearCache();
});

describe("progress storage", () => {
  it("returns defaults and persists writes under versioned keys", () => {
    expect(readSlice("settings").level).toBe(1);
    writeSlice("settings", { ...readSlice("settings"), level: 3 });
    expect(localStorage.getItem("prata:v1:settings")).toContain('"level":3');
    clearCache();
    expect(readSlice("settings").level).toBe(3);
  });

  it("fills in settings added after a backup was made", () => {
    localStorage.setItem("prata:v1:settings", JSON.stringify({ level: 2 }));
    expect(readSlice("settings")).toMatchObject({ level: 2, newPerDay: 10 });
  });

  it("round-trips through export and import", () => {
    writeSlice("saved", { x: { id: "x", form: "tält", lemma: "tält", english: "tent", textId: "fjallen", addedAt: "2026-10-18" } });
    writeSlice("writing", [{ id: "w1", promptId: "semester", text: "Jag åkte till Malmö.", words: 4, missed: [], at: "2026-10-18" }]);
    const backup = exportProgress();
    resetProgress();
    expect(readSlice("saved")).toEqual({});
    importProgress(backup);
    clearCache();
    expect(readSlice("saved").x.english).toBe("tent");
    expect(readSlice("writing")[0].text).toBe("Jag åkte till Malmö.");
  });

  it("rejects files that aren't Prata backups", () => {
    expect(() => importProgress("{}")).toThrow(/Prata backup/);
    expect(() => importProgress("not json")).toThrow(/valid JSON/);
  });
});

describe("streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    const now = new Date(2026, 9, 18, 12);
    expect(streak(["2026-10-16", "2026-10-17", "2026-10-18"], now)).toBe(3);
    expect(streak(["2026-10-16", "2026-10-17"], now)).toBe(2);
    expect(streak(["2026-10-15"], now)).toBe(0);
  });

  it("markActivity adds today once", () => {
    const now = new Date(2026, 9, 18, 12);
    markActivity(now);
    markActivity(now);
    expect(readSlice("activity")).toEqual(["2026-10-18"]);
  });
});

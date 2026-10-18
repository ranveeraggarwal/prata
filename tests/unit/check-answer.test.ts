import { describe, expect, it } from "vitest";
import { answerIndex, checkAnswer, joinTiles, normalize, orderTiles } from "@/lib/check-answer";

describe("checkAnswer", () => {
  it("ignores case, extra spaces and a final full stop", () => {
    expect(checkAnswer("  jag  DRICKER kaffe ", "Jag dricker kaffe.").result).toBe("correct");
  });

  it("accepts listed alternatives", () => {
    expect(checkAnswer("i", "under", ["i", "på"]).result).toBe("correct");
  });

  it("flags answers that only miss å/ä/ö", () => {
    expect(checkAnswer("smorgas", "smörgås")).toEqual({ result: "accent", expected: "smörgås" });
    expect(checkAnswer("ga", "gå").result).toBe("accent");
  });

  it("rejects wrong and empty answers", () => {
    expect(checkAnswer("på", "under").result).toBe("wrong");
    expect(checkAnswer("   ", "under").result).toBe("wrong");
  });

  it("treats typographic quotes like plain ones", () => {
    expect(normalize("Han sa ”hej”")).toBe(normalize('han sa "hej"'));
  });
});

describe("answerIndex", () => {
  const options = ["din", "dina", "ditt"];
  it("reads letter keys in several styles", () => {
    expect(answerIndex(options, "b")).toBe(1);
    expect(answerIndex(options, "C)")).toBe(2);
  });
  it("matches option text, with or without a letter prefix", () => {
    expect(answerIndex(options, "ditt")).toBe(2);
    expect(answerIndex(["a) tidigare", "b) förut"], "förut")).toBe(1);
  });
  it("returns -1 when there is no usable key", () => {
    expect(answerIndex(options, "")).toBe(-1);
    expect(answerIndex(options, "e")).toBe(-1);
  });
});

describe("order tiles", () => {
  it("splits on ' / ' and joins without a space before punctuation", () => {
    const tiles = orderTiles("äter / jag / glass.");
    expect(tiles).toEqual(["äter", "jag", "glass."]);
    expect(joinTiles(["jag", "äter", "glass", "."])).toBe("jag äter glass.");
  });
});

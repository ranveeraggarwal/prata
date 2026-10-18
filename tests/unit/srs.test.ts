import { describe, expect, it } from "vitest";
import { buildQueue, dueEntries, isDue, Rating, refKey, review, type ItemRef, type SrsStore } from "@/lib/srs";

const ref: ItemRef = { kind: "card", id: "ord-glad" };

describe("review", () => {
  it("schedules a correct answer later than a wrong one", () => {
    const now = new Date("2026-10-18T10:00:00Z");
    const good = review(undefined, ref, Rating.Good, now);
    const again = review(undefined, ref, Rating.Again, now);
    expect(new Date(good.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
    expect(good.introduced).toBe("2026-10-18");
    expect(good.reps).toBe(1);
  });

  it("survives a JSON round trip and keeps growing intervals", () => {
    let entry = review(undefined, ref, Rating.Good, new Date("2026-10-01T09:00:00Z"));
    entry = JSON.parse(JSON.stringify(entry));
    const later = review(entry, ref, Rating.Good, new Date(entry.due));
    expect(later.reps).toBe(2);
    expect(later.introduced).toBe(entry.introduced);
    expect(new Date(later.due).getTime()).toBeGreaterThan(new Date(entry.due).getTime());
  });
});

describe("queue", () => {
  it("puts due items first and caps new items per day", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const old = review(undefined, ref, Rating.Again, new Date("2026-10-17T12:00:00Z"));
    const store: SrsStore = { [refKey(ref)]: old };
    expect(isDue(old, now)).toBe(true);
    const candidates: ItemRef[] = [ref, { kind: "card", id: "a" }, { kind: "card", id: "b" }, { kind: "card", id: "c" }];
    const queue = buildQueue(store, candidates, 2, now);
    expect(queue).toEqual([ref, { kind: "card", id: "a" }, { kind: "card", id: "b" }]);
  });

  it("counts items introduced today against the limit", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const seen = review(undefined, ref, Rating.Good, now);
    const store: SrsStore = { [refKey(ref)]: seen };
    expect(dueEntries(store, now)).toHaveLength(0);
    expect(buildQueue(store, [{ kind: "card", id: "a" }, { kind: "card", id: "b" }], 2, now)).toHaveLength(1);
  });
});

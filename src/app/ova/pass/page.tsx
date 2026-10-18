"use client";

import { useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { ReviewCard } from "@/components/ReviewCard";
import { LinkButton, Loading, Page, Panel } from "@/components/ui";
import { resolveItem, type ReviewItem } from "@/lib/items";
import { markActivity, readSlice, updateSlice } from "@/lib/progress";
import { todaysQueue } from "@/lib/session";
import { Rating, refKey, review, type Grade, type ItemRef } from "@/lib/srs";

export default function SessionPage() {
  const { status } = useContent();
  if (status === "loading") return <Page title="Repetition"><Loading /></Page>;
  return <Session />;
}

function Session() {
  const { content } = useContent();
  // The queue is fixed when the session starts so answering doesn't reshuffle it.
  const [queue, setQueue] = useState<ItemRef[]>(() =>
    todaysQueue(content, readSlice("settings"), readSlice("srs"), readSlice("saved"), readSlice("checks")),
  );
  const [index, setIndex] = useState(0);
  const [retried, setRetried] = useState<Set<string>>(() => new Set());
  const [counts, setCounts] = useState({ right: 0, total: 0 });

  const saved = readSlice("saved");
  const checks = readSlice("checks");
  let current: ReviewItem | null = null;
  let position = index;
  while (position < queue.length && !(current = resolveItem(queue[position], content, saved, checks))) position++;

  function graded(grade: Grade) {
    const ref = queue[position];
    const key = refKey(ref);
    updateSlice("srs", (srs) => ({ ...srs, [key]: review(srs[key], ref, grade) }));
    markActivity();
    setCounts((c) => ({ right: c.right + (grade >= Rating.Hard ? 1 : 0), total: c.total + 1 }));
    // A miss comes back once more at the end of this session.
    if (grade === Rating.Again && !retried.has(key)) {
      setRetried(new Set(retried).add(key));
      setQueue([...queue, ref]);
    }
    setIndex(position + 1);
  }

  if (!current) {
    return (
      <Page title="Klart för idag!">
        <Panel>
          <p className="mb-4">
            {counts.total
              ? `Du svarade rätt på ${counts.right} av ${counts.total}.`
              : "Det finns inget att repetera just nu."}
          </p>
          <LinkButton href="/" className="w-full">
            Till startsidan
          </LinkButton>
        </Panel>
      </Page>
    );
  }

  const remaining = queue.length - position;
  return (
    <Page title="Repetition" kicker={`${remaining} kvar`}>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full bg-brand transition-all" style={{ width: `${(position / queue.length) * 100}%` }} />
      </div>
      <Panel>
        <ReviewCard key={`${position}:${refKey(queue[position])}`} item={current} onGraded={graded} />
      </Panel>
    </Page>
  );
}

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useContent } from "@/components/ContentProvider";
import { Empty, LinkButton, Loading, Page, Panel } from "@/components/ui";
import { useSlice } from "@/lib/progress";
import { todaysQueue } from "@/lib/session";
import { LEVEL_NAMES } from "@/lib/types";

export default function OvaPage() {
  const { content, status } = useContent();
  const settings = useSlice("settings");
  const srs = useSlice("srs");
  const saved = useSlice("saved");
  const checks = useSlice("checks");
  const results = useSlice("tests");
  const queue = useMemo(() => todaysQueue(content, settings, srs, saved, checks), [content, settings, srs, saved, checks]);

  if (status === "loading") return <Page title="Öva"><Loading /></Page>;

  const best = new Map<string, number>();
  for (const r of results) best.set(r.testId, Math.max(best.get(r.testId) ?? 0, r.total ? r.score / r.total : 0));
  const tests = [...content.tests].sort((a, b) => a.level - b.level);
  const learned = Object.keys(srs).length;

  return (
    <Page title="Öva" kicker={`${learned} saker i repetitionen · ${Object.keys(saved).length} sparade ord`}>
      <Panel className="mb-6">
        <p className="font-semibold">Dagens repetition</p>
        <p className="mb-3 text-sm text-muted">
          {queue.length ? `${queue.length} att öva på: ord, grammatik och dina egna misstag.` : "Inget kvar idag. Kom tillbaka i morgon!"}
        </p>
        <LinkButton href="/ova/pass/" className={`w-full ${queue.length ? "" : "pointer-events-none opacity-40"}`}>
          Starta
        </LinkButton>
      </Panel>

      <h2 className="mb-2 text-lg font-semibold">Test</h2>
      <p className="mb-3 text-sm text-muted">
        Pass a test at your level with {Math.round(0.7 * 100)}% to move up a level.
      </p>
      {tests.length === 0 ? (
        <Empty>No tests in your Sheet yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {tests.map((test) => {
            const score = best.get(test.id);
            return (
              <li key={test.id}>
                <Link
                  href={`/ova/test/?id=${encodeURIComponent(test.id)}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{test.title}</span>
                    <span className="text-sm text-muted">
                      {LEVEL_NAMES[test.level]} · {test.questions.length} frågor
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold ${score !== undefined && score >= 0.7 ? "text-ok" : "text-muted"}`}>
                    {score === undefined ? "Ny" : `${Math.round(score * 100)}%`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

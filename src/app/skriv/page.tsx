"use client";

import Link from "next/link";
import { useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { ShareButton } from "@/components/ShareButton";
import { Empty, LevelChips, Loading, Page } from "@/components/ui";
import { useSlice } from "@/lib/progress";
import type { Level } from "@/lib/types";

export default function WritePage() {
  const { content, status } = useContent();
  const writing = useSlice("writing");
  const settings = useSlice("settings");
  const [picked, setLevel] = useState<Level | null>(null);
  const level = picked ?? settings.level;

  if (status === "loading") return <Page title="Skriv"><Loading /></Page>;

  const prompts = content.prompts.filter((p) => p.level === level);
  const doneCount = new Map<string, number>();
  for (const w of writing) doneCount.set(w.promptId, (doneCount.get(w.promptId) ?? 0) + 1);
  const titles = new Map(content.prompts.map((p) => [p.id, p.title]));
  const history = [...writing].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Page title="Skriv" kicker={`${writing.length} texter skrivna`}>
      <LevelChips value={level} onChange={setLevel} />
      {prompts.length === 0 ? (
        <Empty>Inga skrivuppgifter på den här nivån.</Empty>
      ) : (
        <ul className="space-y-2">
          {prompts.map((prompt) => (
            <li key={prompt.id}>
              <Link
                href={`/skriv/uppgift/?id=${encodeURIComponent(prompt.id)}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <span className="min-w-0 flex-1">
                  <span lang="sv" className="block truncate font-medium">
                    {prompt.title}
                  </span>
                  <span lang="sv" className="block truncate text-sm text-muted">
                    {prompt.task}
                  </span>
                </span>
                {doneCount.get(prompt.id) && <span className="text-sm font-semibold text-ok">✓ {doneCount.get(prompt.id)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">Dina texter</h2>
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <details className="rounded-2xl border border-line bg-surface p-4">
                  <summary className="cursor-pointer">
                    <span lang="sv" className="font-medium">
                      {titles.get(entry.promptId) ?? entry.promptId}
                    </span>
                    <span className="ml-2 text-sm text-muted">
                      {new Date(entry.at).toLocaleDateString("sv-SE")} · {entry.words} ord
                    </span>
                  </summary>
                  <p lang="sv" className="mt-3 whitespace-pre-wrap font-serif">
                    {entry.text}
                  </p>
                  {entry.missed.length > 0 && (
                    <p className="mt-3 text-sm text-muted">Att tänka på: {entry.missed.join(" · ")}</p>
                  )}
                  <div className="mt-3">
                    <ShareButton title={titles.get(entry.promptId) ?? "Min text"} text={entry.text} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}

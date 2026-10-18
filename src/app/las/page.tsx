"use client";

import Link from "next/link";
import { useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { Empty, LevelChips, Loading, Page } from "@/components/ui";
import { useSlice } from "@/lib/progress";
import { isReadingText } from "@/lib/session";
import type { Level } from "@/lib/types";

export default function LibraryPage() {
  const { content, status } = useContent();
  const reading = useSlice("reading");
  const settings = useSlice("settings");
  const [picked, setLevel] = useState<Level | null>(null);
  const level = picked ?? settings.level;

  if (status === "loading") return <Page title="Läs"><Loading /></Page>;

  const texts = content.texts.filter((t) => isReadingText(t) && t.level === level);
  const read = texts.filter((t) => reading[t.id]).length;

  return (
    <Page title="Läs" kicker={`${read} av ${texts.length} lästa på den här nivån`}>
      <LevelChips value={level} onChange={setLevel} />
      {texts.length === 0 ? (
        <Empty>Inga texter på den här nivån.</Empty>
      ) : (
        <ul className="space-y-2">
          {texts.map((text) => (
            <li key={text.id}>
              <Link
                href={`/las/text/?id=${encodeURIComponent(text.id)}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <span className="min-w-0 flex-1">
                  <span lang="sv" className="block truncate font-medium">
                    {text.title}
                  </span>
                  <span className="text-sm text-muted">
                    {[text.kind, text.source].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {reading[text.id] && (
                  <span className="text-sm font-semibold text-ok" aria-label="Läst">
                    ✓
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { Button, Empty, LinkButton, Loading, Notice, Page, Panel } from "@/components/ui";
import { answerIndex, stripOptionLetter } from "@/lib/check-answer";
import { makeGlossary, savedWordId, tokenize } from "@/lib/items";
import { markActivity, updateSlice, useSlice } from "@/lib/progress";
import { nextText } from "@/lib/session";
import { LEVEL_NAMES, type GlossEntry, type Question, type Text } from "@/lib/types";

export default function ReaderPage() {
  return (
    <Suspense>
      <ReaderLoader />
    </Suspense>
  );
}

function ReaderLoader() {
  const params = useSearchParams();
  const { content, status } = useContent();
  if (status === "loading") return <Page title="Läs"><Loading /></Page>;
  const text = content.texts.find((t) => t.id === params.get("id"));
  if (!text) return <Page title="Läs"><Empty>That text isn&apos;t in your Sheet.</Empty></Page>;
  return <Reader key={text.id} text={text} />;
}

function Reader({ text }: { text: Text }) {
  const { content } = useContent();
  const settings = useSlice("settings");
  const reading = useSlice("reading");
  const saved = useSlice("saved");
  const lookup = useMemo(() => makeGlossary(content.glossary, text.id), [content.glossary, text.id]);
  const questions = content.questions.filter((q) => q.textId === text.id);
  const [tapped, setTapped] = useState<{ form: string; entry?: GlossEntry } | null>(null);
  const [score, setScore] = useState<Record<number, boolean>>({});
  const paragraphs = useMemo(() => text.body.split(/\n\s*\n/).map((p) => tokenize(p)), [text.body]);
  const done = Boolean(reading[text.id]);
  const upNext = nextText(content, settings, { ...reading, [text.id]: { readAt: "" } });

  function onTextClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const form = target.dataset.w;
    if (!form) return;
    setTapped({ form, entry: lookup(form) });
  }

  function save() {
    if (!tapped) return;
    const lemma = tapped.entry?.lemma || "";
    const id = savedWordId({ form: tapped.form.toLowerCase(), lemma });
    updateSlice("saved", (s) => ({
      ...s,
      [id]: {
        id,
        form: tapped.form.toLowerCase(),
        lemma,
        english: tapped.entry?.english ?? "",
        textId: text.id,
        addedAt: new Date().toISOString(),
      },
    }));
  }

  function markRead() {
    const answered = Object.values(score);
    updateSlice("reading", (r) => ({
      ...r,
      [text.id]: {
        readAt: new Date().toISOString(),
        correct: answered.filter(Boolean).length,
        total: answered.length,
      },
    }));
    markActivity();
  }

  const tappedId = tapped ? savedWordId({ form: tapped.form.toLowerCase(), lemma: tapped.entry?.lemma }) : "";

  return (
    <Page title={text.title} kicker={[LEVEL_NAMES[text.level], text.source].filter(Boolean).join(" · ")}>
      <p className="mb-3 text-sm text-muted">Tryck på ett ord för att se vad det betyder.</p>
      <article lang="sv" className="space-y-4 font-serif text-[1.15rem] leading-relaxed" onClick={onTextClick}>
        {paragraphs.map((tokens, p) => (
          <p key={p} className="whitespace-pre-line">
            {tokens.map((t, i) =>
              t.word ? (
                <span
                  key={i}
                  data-w={t.text}
                  className={`cursor-pointer rounded-sm ${tapped?.form === t.text ? "bg-accent/40" : ""}`}
                >
                  {t.text}
                </span>
              ) : (
                <span key={i}>{t.text}</span>
              ),
            )}
          </p>
        ))}
      </article>

      {questions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Frågor</h2>
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <QuestionCard key={i} q={q} onAnswered={(ok) => setScore((s) => ({ ...s, [i]: ok }))} />
            ))}
          </ol>
        </section>
      )}

      <div className="mt-8 space-y-2">
        {done ? (
          <Notice tone="ok">Läst ✓</Notice>
        ) : (
          <Button className="w-full" onClick={markRead}>
            Markera som läst
          </Button>
        )}
        {upNext && (
          <LinkButton href={`/las/text/?id=${encodeURIComponent(upNext.id)}`} variant="secondary" className="w-full">
            Nästa: {upNext.title}
          </LinkButton>
        )}
      </div>

      {tapped && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-4 shadow-2xl"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          role="dialog"
          aria-label="Ord"
        >
          <div className="mx-auto max-w-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p lang="sv" className="text-xl font-semibold">
                  {tapped.form}
                  {tapped.entry?.lemma && tapped.entry.lemma.toLowerCase() !== tapped.form.toLowerCase() && (
                    <span className="ml-2 text-base font-normal text-muted">({tapped.entry.lemma})</span>
                  )}
                </p>
                <p className={tapped.entry?.english ? "" : "text-muted"}>
                  {tapped.entry?.english || "Inte i ordlistan för den här texten."}
                </p>
              </div>
              <button onClick={() => setTapped(null)} className="p-1 text-2xl leading-none text-muted" aria-label="Stäng">
                ×
              </button>
            </div>
            <Button className="mt-3 w-full" onClick={save} disabled={Boolean(saved[tappedId])}>
              {saved[tappedId] ? "Sparat i Öva ✓" : "Spara ordet"}
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}

function QuestionCard({ q, onAnswered }: { q: Question; onAnswered: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const key = answerIndex(q.options, q.answer);

  if (q.options.length === 0) {
    return (
      <li className="rounded-2xl border border-line bg-surface p-4">
        <p lang="sv" className="mb-2 font-medium">
          {q.question}
        </p>
        <textarea lang="sv" rows={2} className="w-full rounded-xl border border-line bg-surface px-3 py-2" spellCheck aria-label="Ditt svar" />
        {q.answer &&
          (shown ? (
            <p lang="sv" className="mt-2 rounded-xl bg-brand-soft px-3 py-2">
              {q.answer}
            </p>
          ) : (
            <Button variant="ghost" onClick={() => setShown(true)}>
              Visa svar
            </Button>
          ))}
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p lang="sv" className="mb-2 font-medium">
        {q.question}
      </p>
      <div className="space-y-1.5">
        {q.options.map((option, o) => {
          const chosen = picked === o;
          const tone =
            picked === null || key < 0
              ? chosen
                ? "border-brand bg-brand-soft"
                : "border-line"
              : o === key
                ? "border-ok bg-ok-soft"
                : chosen
                  ? "border-bad bg-bad-soft"
                  : "border-line";
          return (
            <button
              key={o}
              lang="sv"
              disabled={picked !== null}
              onClick={() => {
                setPicked(o);
                if (key >= 0) onAnswered(o === key);
              }}
              className={`block w-full rounded-xl border px-3 py-2.5 text-left ${tone}`}
            >
              {stripOptionLetter(option)}
            </button>
          );
        })}
      </div>
      {picked !== null && key < 0 && <p className="mt-2 text-sm text-muted">No answer key in the kit for this one.</p>}
    </li>
  );
}

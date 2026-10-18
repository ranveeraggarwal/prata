"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { ShareButton } from "@/components/ShareButton";
import { Button, Empty, LinkButton, Loading, Notice, Page, Panel } from "@/components/ui";
import { markActivity, readSlice, updateSlice, useSlice } from "@/lib/progress";
import { nextPrompt } from "@/lib/session";
import { LEVEL_NAMES, type Prompt } from "@/lib/types";
import { checkItemId, checklistFor, targetWords, usesWord, wordCount } from "@/lib/writing";

export default function PromptPage() {
  return (
    <Suspense>
      <PromptLoader />
    </Suspense>
  );
}

function PromptLoader() {
  const params = useSearchParams();
  const { content, status } = useContent();
  if (status === "loading") return <Page title="Skriv"><Loading /></Page>;
  const prompt = content.prompts.find((p) => p.id === params.get("id"));
  if (!prompt) return <Page title="Skriv"><Empty>That writing task isn&apos;t in your Sheet.</Empty></Page>;
  return <Writer key={prompt.id} prompt={prompt} />;
}

type Step = "write" | "check" | "saved";

function Writer({ prompt }: { prompt: Prompt }) {
  const { content } = useContent();
  const settings = useSlice("settings");
  const writing = useSlice("writing");
  const [text, setText] = useState(() => readSlice("drafts")[prompt.id] ?? "");
  const [step, setStep] = useState<Step>("write");
  const [missed, setMissed] = useState<Set<string>>(() => new Set());
  const targets = useMemo(
    () => targetWords(prompt, content, readSlice("saved"), settings.level),
    [prompt, content, settings.level],
  );
  const checklist = checklistFor(prompt, settings.level);
  const linking = content.texts.find((t) => t.id === "samband");
  const words = wordCount(text);
  const upNext = nextPrompt(content, settings, [...writing, { id: "", promptId: prompt.id, text: "", words: 0, missed: [], at: "" }]);

  function edit(value: string) {
    setText(value);
    updateSlice("drafts", (d) => ({ ...d, [prompt.id]: value }));
  }

  function toggle(item: string) {
    const next = new Set(missed);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    setMissed(next);
  }

  function save() {
    const at = new Date().toISOString();
    const missedList = checklist.filter((c) => missed.has(c));
    updateSlice("writing", (w) => [...w, { id: `${prompt.id}:${at}`, promptId: prompt.id, text, words, missed: missedList, at }]);
    updateSlice("checks", (c) => {
      const next = { ...c };
      for (const item of missedList) next[checkItemId(item)] = { id: checkItemId(item), text: item, promptId: prompt.id };
      return next;
    });
    updateSlice("drafts", (d) => {
      const next = { ...d };
      delete next[prompt.id];
      return next;
    });
    markActivity();
    setStep("saved");
  }

  return (
    <Page title={prompt.title} kicker={LEVEL_NAMES[prompt.level]}>
      <Panel className="mb-4">
        <p lang="sv" className="font-medium">
          {prompt.task}
        </p>
        {prompt.hints.length > 0 && (
          <ul lang="sv" className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
            {prompt.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </Panel>

      {step === "write" && (
        <>
          {targets.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-sm text-muted">Försök använda:</p>
              <div className="flex flex-wrap gap-2">
                {targets.map((t) => {
                  const used = usesWord(text, t.word);
                  return (
                    <span
                      key={t.word}
                      title={t.english}
                      className={`rounded-full border px-3 py-1 text-sm ${used ? "border-ok bg-ok-soft text-ok" : "border-line bg-surface"}`}
                    >
                      <span lang="sv" className="font-medium">
                        {t.word}
                      </span>{" "}
                      <span className="opacity-70">{used ? "✓" : `(${t.english})`}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <textarea
            lang="sv"
            value={text}
            onChange={(e) => edit(e.target.value)}
            rows={10}
            spellCheck
            autoCapitalize="sentences"
            className="w-full rounded-2xl border border-line bg-surface p-4 font-serif text-[1.1rem] leading-relaxed"
            placeholder="Skriv här …"
            aria-label="Din text"
          />
          <div className="mt-2 flex items-center justify-between text-sm text-muted">
            <span>{words} ord</span>
            <span>Utkastet sparas automatiskt</span>
          </div>
          {linking && (
            <details className="mt-3 rounded-2xl border border-line bg-surface p-4 text-sm">
              <summary className="cursor-pointer font-medium">{linking.title}</summary>
              <p lang="sv" className="mt-2 whitespace-pre-line text-muted">
                {linking.body}
              </p>
            </details>
          )}
          <Button className="mt-4 w-full" disabled={words < 3} onClick={() => setStep("check")}>
            Klar – gå igenom checklistan
          </Button>
        </>
      )}

      {step === "check" && (
        <>
          <p className="mb-3">Read your text again. Tap every point you missed — it becomes a review card in Öva.</p>
          <ul className="space-y-2">
            {checklist.map((item) => {
              const isMissed = missed.has(item);
              return (
                <li key={item}>
                  <button
                    onClick={() => toggle(item)}
                    aria-pressed={isMissed}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left ${
                      isMissed ? "border-bad bg-bad-soft" : "border-line bg-surface"
                    }`}
                  >
                    <span className={`mt-0.5 font-semibold ${isMissed ? "text-bad" : "text-ok"}`}>{isMissed ? "✗" : "✓"}</span>
                    <span lang="sv">{item}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">Visa min text</summary>
            <p lang="sv" className="mt-2 whitespace-pre-wrap font-serif">
              {text}
            </p>
          </details>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setStep("write")}>
              Tillbaka
            </Button>
            <Button className="flex-1" onClick={save}>
              Spara
            </Button>
          </div>
        </>
      )}

      {step === "saved" && (
        <div className="space-y-3">
          <Notice tone="ok">
            Sparat!{" "}
            {missed.size > 0
              ? `${missed.size} ${missed.size === 1 ? "punkt" : "punkter"} att öva på har lagts till i Öva.`
              : "Snyggt jobbat."}
          </Notice>
          <p lang="sv" className="whitespace-pre-wrap rounded-2xl border border-line bg-surface p-4 font-serif">
            {text}
          </p>
          <div className="flex flex-wrap gap-2">
            <ShareButton title={prompt.title} text={text} />
            {upNext ? (
              <LinkButton href={`/skriv/uppgift/?id=${encodeURIComponent(upNext.id)}`} className="flex-1">
                Nästa uppgift
              </LinkButton>
            ) : (
              <LinkButton href="/" className="flex-1">
                Till startsidan
              </LinkButton>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

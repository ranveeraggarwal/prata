"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { Button, Empty, LinkButton, Loading, Notice, Page, Panel } from "@/components/ui";
import { answerIndex, checkAnswer, stripOptionLetter } from "@/lib/check-answer";
import { PASS_MARK, placementAfter } from "@/lib/items";
import { markActivity, readSlice, updateSlice } from "@/lib/progress";
import { LEVEL_NAMES, type Level, type Test, type TestQuestion } from "@/lib/types";

export default function TestPage() {
  return (
    <Suspense>
      <TestLoader />
    </Suspense>
  );
}

function TestLoader() {
  const params = useSearchParams();
  const { content, status } = useContent();
  if (status === "loading") return <Page title="Test"><Loading /></Page>;
  const test = content.tests.find((t) => t.id === params.get("id"));
  if (!test) return <Page title="Test"><Empty>That test isn&apos;t in your Sheet.</Empty></Page>;
  return <TestRunner key={test.id} test={test} placement={params.get("placement") === "1"} />;
}

/** A question without a key in the kit is shown but not scored. */
function isScored(q: TestQuestion): boolean {
  return Boolean(q.answer.trim()) && (q.options.length === 0 || answerIndex(q.options, q.answer) >= 0);
}

function isCorrect(q: TestQuestion, given: string): boolean {
  if (q.options.length) return Number(given) === answerIndex(q.options, q.answer);
  const [main, ...alternatives] = q.answer.split("|").map((s) => s.trim());
  return checkAnswer(given, main, alternatives).result !== "wrong";
}

function correctText(q: TestQuestion): string {
  if (q.options.length) return stripOptionLetter(q.options[answerIndex(q.options, q.answer)] ?? q.answer);
  return q.answer.split("|")[0].trim();
}

type Outcome = { message: string; next?: string };

function TestRunner({ test, placement }: { test: Test; placement: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const scored = test.questions.map(isScored);
  const total = scored.filter(Boolean).length;
  const score = test.questions.filter((q, i) => scored[i] && isCorrect(q, answers[i] ?? "")).length;

  function submit() {
    updateSlice("tests", (r) => [...r, { testId: test.id, score, total, at: new Date().toISOString() }]);
    markActivity();
    const pct = total ? score / total : 0;
    if (placement && (test.id === "lund-1" || test.id === "lund-2")) {
      const result = placementAfter(test.id, score, total);
      if (result.next) {
        // Level 2 already stands; test 2 can only move it up.
        updateSlice("settings", (s) => ({ ...s, level: result.level, placementDone: true }));
        setOutcome({ message: "Bra! Gör test 2 för att se om du är på en högre nivå.", next: result.next });
      } else {
        updateSlice("settings", (s) => ({ ...s, level: result.level, placementDone: true }));
        setOutcome({ message: `Du börjar på ${LEVEL_NAMES[result.level]}.` });
      }
    } else {
      const { level } = readSlice("settings");
      if (pct >= PASS_MARK && test.level >= level && level < 5) {
        const next = Math.min(5, test.level + 1) as Level;
        updateSlice("settings", (s) => ({ ...s, level: next }));
        setOutcome({ message: `Godkänt! Du är nu på ${LEVEL_NAMES[next]}.` });
      } else {
        setOutcome({ message: pct >= PASS_MARK ? "Godkänt!" : "Fortsätt öva och försök igen senare." });
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sections: { name: string; items: { q: TestQuestion; i: number }[] }[] = [];
  test.questions.forEach((q, i) => {
    const last = sections[sections.length - 1];
    if (last && last.name === q.section) last.items.push({ q, i });
    else sections.push({ name: q.section, items: [{ q, i }] });
  });

  return (
    <Page title={test.title} kicker={`${LEVEL_NAMES[test.level]} · ${test.questions.length} frågor`}>
      {outcome && (
        <Panel className="mb-4">
          <p className="text-2xl font-semibold">
            {score} / {total}
          </p>
          <p className="mb-3">{outcome.message}</p>
          {outcome.next ? (
            <Button className="w-full" onClick={() => router.push(`/ova/test/?id=${outcome.next}&placement=1`)}>
              Till test 2
            </Button>
          ) : (
            <LinkButton href="/" className="w-full">
              Till startsidan
            </LinkButton>
          )}
        </Panel>
      )}
      <div className="space-y-6">
        {sections.map((section, s) => (
          <section key={s}>
            {section.name && <h2 className="mb-2 font-semibold text-muted">{section.name}</h2>}
            <ol className="space-y-3">
              {section.items.map(({ q, i }) => (
                <QuestionView
                  key={i}
                  name={`q${i}`}
                  q={q}
                  value={answers[i] ?? ""}
                  onChange={(v) => setAnswers({ ...answers, [i]: v })}
                  reveal={outcome !== null}
                  scored={scored[i]}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
      {!outcome && (
        <Button className="mt-6 w-full" onClick={submit}>
          Lämna in
        </Button>
      )}
    </Page>
  );
}

function QuestionView({
  name,
  q,
  value,
  onChange,
  reveal,
  scored,
}: {
  name: string;
  q: TestQuestion;
  value: string;
  onChange: (value: string) => void;
  reveal: boolean;
  scored: boolean;
}) {
  const correct = reveal && scored ? isCorrect(q, value) : null;
  const border = correct === null ? "border-line" : correct ? "border-ok" : "border-bad";
  return (
    <li className={`rounded-2xl border bg-surface p-4 ${border}`}>
      <p lang="sv" className="mb-3 whitespace-pre-line">
        {q.number && <span className="mr-1 font-semibold text-muted">{q.number}.</span>}
        {q.question}
      </p>
      {q.options.length ? (
        <div className="space-y-1.5" role="radiogroup">
          {q.options.map((option, o) => (
            <label key={o} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <input
                type="radio"
                name={name}
                checked={value === String(o)}
                onChange={() => onChange(String(o))}
                disabled={reveal}
                className="size-5 accent-[var(--brand)]"
              />
              <span lang="sv">{stripOptionLetter(option)}</span>
            </label>
          ))}
        </div>
      ) : (
        <input
          lang="sv"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={reveal}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`Svar ${q.number}`}
        />
      )}
      {reveal && !scored && <p className="mt-2 text-sm text-muted">No answer key in the kit for this one.</p>}
      {correct === false && (
        <Notice tone="bad">
          Rätt svar: <span lang="sv" className="font-semibold">{correctText(q)}</span>
        </Notice>
      )}
    </li>
  );
}

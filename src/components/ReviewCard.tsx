"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { checkAnswer, joinTiles, orderTiles, type CheckResult } from "@/lib/check-answer";
import type { ReviewItem } from "@/lib/items";
import { seededShuffle } from "@/lib/session";
import { Rating, type Grade } from "@/lib/srs";

/** Shows one Öva item and reports a grade once the learner has answered. */
export function ReviewCard({ item, onGraded }: { item: ReviewItem; onGraded: (grade: Grade) => void }) {
  if (item.mode === "order") return <OrderCard item={item} onGraded={onGraded} />;
  if (item.mode === "reveal") return <RevealCard item={item} onGraded={onGraded} />;
  return <TypeCard item={item} onGraded={onGraded} />;
}

const RESULT_TEXT: Record<CheckResult, string> = {
  correct: "Rätt!",
  accent: "Nästan! Kolla å, ä och ö.",
  wrong: "Inte riktigt.",
};

const RESULT_TONE: Record<CheckResult, string> = {
  correct: "bg-ok-soft text-ok",
  accent: "bg-warn-soft text-warn",
  wrong: "bg-bad-soft text-bad",
};

const GRADE_FOR: Record<CheckResult, Grade> = { correct: Rating.Good, accent: Rating.Hard, wrong: Rating.Again };

function Label({ text }: { text: string }) {
  return text ? <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{text}</p> : null;
}

function Feedback({
  result,
  expected,
  explanation,
  onNext,
  onOverride,
}: {
  result: CheckResult;
  expected: string;
  explanation?: string;
  onNext: () => void;
  onOverride?: () => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded-xl px-3.5 py-3 ${RESULT_TONE[result]}`} role="status">
        <p className="font-semibold">{RESULT_TEXT[result]}</p>
        {result !== "correct" && (
          <p className="mt-1">
            Svar: <span lang="sv" className="font-semibold">{expected}</span>
          </p>
        )}
        {explanation && <p className="mt-1 text-sm opacity-90">{explanation}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={onNext} className="flex-1" autoFocus>
          Nästa
        </Button>
        {onOverride && result === "wrong" && (
          <Button variant="secondary" onClick={onOverride}>
            Jag hade rätt
          </Button>
        )}
      </div>
    </div>
  );
}

function TypeCard({ item, onGraded }: { item: Extract<ReviewItem, { mode: "type" }>; onGraded: (g: Grade) => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  function check(event: React.FormEvent) {
    event.preventDefault();
    if (result) return;
    setResult(checkAnswer(value, item.answer, item.alternatives).result);
  }

  return (
    <form onSubmit={check}>
      <Label text={item.label} />
      <p lang="sv" className="text-xl font-semibold leading-snug">
        {item.prompt}
      </p>
      {item.hint && (
        <p lang="sv" className="mt-1 text-muted">
          {item.hint}
        </p>
      )}
      <input
        lang="sv"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={result !== null}
        className="mt-4 w-full rounded-xl border border-line bg-surface px-3 py-3 text-lg"
        placeholder="Skriv på svenska"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Ditt svar"
        autoFocus
      />
      {result === null ? (
        <Button type="submit" className="mt-3 w-full" disabled={!value.trim()}>
          Kontrollera
        </Button>
      ) : (
        <Feedback
          result={result}
          expected={item.answer}
          explanation={item.explanation}
          onNext={() => onGraded(GRADE_FOR[result])}
          onOverride={() => onGraded(Rating.Good)}
        />
      )}
    </form>
  );
}

function OrderCard({ item, onGraded }: { item: Extract<ReviewItem, { mode: "order" }>; onGraded: (g: Grade) => void }) {
  const tiles = orderTiles(item.answer);
  const [pool] = useState(() => seededShuffle(tiles.map((text, i) => ({ text, i })), item.ref.id));
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const sentence = joinTiles(picked.map((i) => tiles[i]));

  return (
    <div>
      <Label text={item.label || "Ordföljd"} />
      <p lang="sv" className="text-xl font-semibold">
        {item.prompt || "Sätt orden i rätt ordning."}
      </p>
      <p lang="sv" className="mt-4 min-h-12 rounded-xl border border-dashed border-line px-3 py-2.5 text-lg" aria-live="polite">
        {sentence || <span className="text-muted">Tryck på orden …</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pool.map(({ text, i }) => {
          const used = picked.includes(i);
          return (
            <button
              key={i}
              lang="sv"
              disabled={result !== null}
              onClick={() => setPicked(used ? picked.filter((p) => p !== i) : [...picked, i])}
              className={`rounded-lg border px-3 py-2 ${used ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface"}`}
            >
              {text}
            </button>
          );
        })}
      </div>
      {result === null ? (
        <Button
          className="mt-4 w-full"
          disabled={picked.length !== tiles.length}
          onClick={() => setResult(checkAnswer(sentence, joinTiles(tiles), item.alternatives).result)}
        >
          Kontrollera
        </Button>
      ) : (
        <Feedback
          result={result}
          expected={joinTiles(tiles)}
          explanation={item.explanation}
          onNext={() => onGraded(GRADE_FOR[result])}
        />
      )}
    </div>
  );
}

function RevealCard({ item, onGraded }: { item: Extract<ReviewItem, { mode: "reveal" }>; onGraded: (g: Grade) => void }) {
  const [attempt, setAttempt] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <div>
      <Label text={item.label} />
      <p lang="sv" className="text-xl font-semibold leading-snug">
        {item.prompt}
      </p>
      <textarea
        lang="sv"
        value={attempt}
        onChange={(e) => setAttempt(e.target.value)}
        rows={3}
        className="mt-4 w-full rounded-xl border border-line bg-surface px-3 py-2.5"
        placeholder="Skriv ditt svar (valfritt)"
        spellCheck
        aria-label="Ditt svar"
      />
      {!shown ? (
        <Button className="mt-3 w-full" onClick={() => setShown(true)}>
          {item.answer ? "Visa svar" : "Klar"}
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          {(item.answer || item.explanation) && (
            <div lang="sv" className="rounded-xl bg-brand-soft px-3.5 py-3">
              {item.answer && <p className="font-semibold">{item.answer}</p>}
              {item.explanation && <p className="mt-1 text-sm">{item.explanation}</p>}
            </div>
          )}
          <p className="text-sm text-muted">Hur gick det?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => onGraded(Rating.Again)}>
              Igen
            </Button>
            <Button variant="secondary" onClick={() => onGraded(Rating.Hard)}>
              Svårt
            </Button>
            <Button onClick={() => onGraded(Rating.Good)}>Bra</Button>
          </div>
        </div>
      )}
    </div>
  );
}

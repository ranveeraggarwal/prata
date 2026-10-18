import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LEVEL_NAMES, LEVELS, type Level } from "@/lib/types";

export function Page({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-nav">
      <header className="mb-5">
        {kicker && <p className="text-sm font-medium text-muted">{kicker}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink",
  secondary: "border border-line bg-surface text-ink",
  ghost: "text-brand",
  danger: "border border-bad text-bad",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`min-h-11 rounded-xl px-4 py-2.5 text-base font-medium transition active:scale-[0.98] disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function LinkButton({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-base font-medium ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function LevelChips({
  value,
  onChange,
  levels = LEVELS,
}: {
  value: Level;
  onChange: (level: Level) => void;
  levels?: Level[];
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Nivå">
      {levels.map((level) => (
        <button
          key={level}
          role="tab"
          aria-selected={value === level}
          onClick={() => onChange(level)}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
            value === level ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink"
          }`}
        >
          {LEVEL_NAMES[level]}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    info: "bg-brand-soft text-ink",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  };
  return <div className={`rounded-xl px-3.5 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{children}</p>;
}

export function Loading() {
  return <p className="py-10 text-center text-muted">Laddar …</p>;
}

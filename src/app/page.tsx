"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useContent } from "@/components/ContentProvider";
import { InstallHint } from "@/components/InstallHint";
import { LinkButton, Loading, Page, Panel } from "@/components/ui";
import { streak, useSlice } from "@/lib/progress";
import { nextPrompt, nextText, todaysQueue } from "@/lib/session";
import { LEVEL_NAMES } from "@/lib/types";

export default function Home() {
  const { content, status } = useContent();
  const settings = useSlice("settings");
  const srs = useSlice("srs");
  const saved = useSlice("saved");
  const checks = useSlice("checks");
  const reading = useSlice("reading");
  const writing = useSlice("writing");
  const activity = useSlice("activity");

  const queue = useMemo(
    () => todaysQueue(content, settings, srs, saved, checks),
    [content, settings, srs, saved, checks],
  );
  const text = nextText(content, settings, reading);
  const prompt = nextPrompt(content, settings, writing);
  const days = streak(activity);

  if (status === "loading") return <Page title="Prata"><Loading /></Page>;

  if (status === "empty") {
    return (
      <Page title="Välkommen till Prata" kicker="Läs och skriv svenska">
        <InstallHint />
        <Panel>
          <p className="mb-4 text-muted">
            Prata reads your study material from a Google Sheet. Connect it once and everything is kept on this phone.
          </p>
          <LinkButton href="/start/" className="w-full">
            Kom igång
          </LinkButton>
        </Panel>
      </Page>
    );
  }

  return (
    <Page title="Dagens pass" kicker={`${LEVEL_NAMES[settings.level]} · ${days} ${days === 1 ? "dag" : "dagar"} i rad`}>
      <InstallHint />
      {!settings.placementDone && (
        <Panel className="mb-4 border-brand bg-brand-soft">
          <p className="mb-3 font-medium">Vilken nivå passar dig? Gör ett kort nivåtest först.</p>
          <LinkButton href="/start/?step=level">Hitta min nivå</LinkButton>
        </Panel>
      )}
      <div className="space-y-3">
        <TaskCard
          step="1"
          title="Repetera"
          detail={queue.length ? `${queue.length} att öva på idag` : "Inget kvar idag – bra jobbat!"}
          href={queue.length ? "/ova/pass/" : undefined}
          action="Starta"
        />
        <TaskCard
          step="2"
          title="Läs"
          detail={text ? text.title : "Du har läst allt på din nivå."}
          href={text ? `/las/text/?id=${encodeURIComponent(text.id)}` : "/las/"}
          action={text ? "Läs" : "Biblioteket"}
        />
        <TaskCard
          step="3"
          title="Skriv"
          detail={prompt ? prompt.title : "Du har skrivit alla uppgifter på din nivå."}
          href={prompt ? `/skriv/uppgift/?id=${encodeURIComponent(prompt.id)}` : "/skriv/"}
          action={prompt ? "Skriv" : "Alla uppgifter"}
        />
      </div>
    </Page>
  );
}

function TaskCard({
  step,
  title,
  detail,
  href,
  action,
}: {
  step: string;
  title: string;
  detail: string;
  href?: string;
  action: string;
}) {
  const body = (
    <div className="flex items-center gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">
        {step}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="truncate text-sm text-muted">{detail}</p>
      </div>
      {href && <span className="text-sm font-semibold text-brand">{action} →</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl border border-line bg-surface p-4 active:bg-brand-soft">
      {body}
    </Link>
  ) : (
    <Panel>{body}</Panel>
  );
}

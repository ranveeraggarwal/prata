"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { SheetLinkForm } from "@/components/SheetLinkForm";
import { Button, LinkButton, Page, Panel } from "@/components/ui";
import { updateSlice } from "@/lib/progress";
import { LEVEL_NAMES, LEVELS, type Level } from "@/lib/types";

export default function StartPage() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}

function Start() {
  const params = useSearchParams();
  const router = useRouter();
  const { content, status } = useContent();
  const step = params.get("step") === "level" && status === "ready" ? "level" : "link";
  const [syncedWithWarnings, setSyncedWithWarnings] = useState(false);

  function pick(level: Level) {
    updateSlice("settings", (s) => ({ ...s, level, placementDone: true }));
    router.push("/");
  }

  if (step === "link") {
    return (
      <Page title="Koppla ditt material" kicker="Steg 1 av 2">
        <Panel className="mb-4 text-sm">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Open your content Sheet in Google Sheets.</li>
            <li>
              File → Share → <strong>Publish to web</strong> → Entire document → Comma-separated values → Publish.
            </li>
            <li>Copy the Sheet&apos;s normal link from the address bar and paste it below.</li>
          </ol>
        </Panel>
        <SheetLinkForm
          onSynced={(warnings) => (warnings.length ? setSyncedWithWarnings(true) : router.push("/start/?step=level"))}
        />
        {syncedWithWarnings && (
          <LinkButton href="/start/?step=level" variant="secondary" className="mt-3 w-full">
            Fortsätt ändå
          </LinkButton>
        )}
      </Page>
    );
  }

  const hasPlacement = content.tests.some((t) => t.id === "lund-1");
  return (
    <Page title="Hitta din nivå" kicker="Steg 2 av 2">
      {hasPlacement && (
        <Panel className="mb-4">
          <p className="mb-3">
            Lund University&apos;s placement test: multiple choice and short answers, about 15 minutes. If you do well
            you&apos;ll get a second, harder test.
          </p>
          <LinkButton href="/ova/test/?id=lund-1&placement=1" className="w-full">
            Gör nivåtestet
          </LinkButton>
        </Panel>
      )}
      <Panel>
        <p className="mb-3 text-sm text-muted">{hasPlacement ? "…or choose a level yourself:" : "Choose a level to start at:"}</p>
        <div className="grid grid-cols-2 gap-2">
          {LEVELS.map((level) => (
            <Button key={level} variant="secondary" onClick={() => pick(level)}>
              {LEVEL_NAMES[level]}
            </Button>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

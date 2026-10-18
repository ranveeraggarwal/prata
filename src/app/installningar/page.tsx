"use client";

import { useRef, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { SheetLinkForm } from "@/components/SheetLinkForm";
import { Button, Notice, Page, Panel } from "@/components/ui";
import { exportProgress, importProgress, resetProgress, updateSlice, useSlice } from "@/lib/progress";
import { LEVEL_NAMES, LEVELS, type Level } from "@/lib/types";

export default function SettingsPage() {
  const { content, status, forget } = useContent();
  const settings = useSlice("settings");
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function download() {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prata-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file: File) {
    try {
      importProgress(await file.text());
      setMessage({ tone: "ok", text: "Progress restored." });
    } catch (err) {
      setMessage({ tone: "bad", text: (err as Error).message });
    }
  }

  function reset() {
    if (!window.confirm("Delete all progress on this phone? Make a backup first if you might want it back.")) return;
    resetProgress();
    setMessage({ tone: "ok", text: "Progress deleted." });
  }

  const counts =
    status === "ready"
      ? [
          `${content.texts.length} texter`,
          `${content.cards.length} kort`,
          `${content.exercises.length} övningar`,
          `${content.tests.length} test`,
          `${content.prompts.length} skrivuppgifter`,
        ].join(" · ")
      : "Inget material hämtat än.";

  return (
    <Page title="Inställningar">
      <div className="space-y-4">
        <Panel>
          <h2 className="mb-1 font-semibold">Material</h2>
          <p className="mb-3 text-sm text-muted">
            {counts}
            {content.syncedAt && ` · synkat ${new Date(content.syncedAt).toLocaleString("sv-SE")}`}
          </p>
          <SheetLinkForm showTabLinks />
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold">Nivå och tempo</h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm">Din nivå</span>
            <select
              value={settings.level}
              onChange={(e) => updateSlice("settings", (s) => ({ ...s, level: Number(e.target.value) as Level, placementDone: true }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_NAMES[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Nya kort per dag</span>
            <select
              value={settings.newPerDay}
              onChange={(e) => updateSlice("settings", (s) => ({ ...s, newPerDay: Number(e.target.value) }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              {[5, 10, 15, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </Panel>

        <Panel>
          <h2 className="mb-1 font-semibold">Backup</h2>
          <p className="mb-3 text-sm text-muted">
            Your progress lives only on this phone. Save a backup now and then, or to move to a new phone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}>Spara backup</Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Återställ backup
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) restore(file);
                e.target.value = "";
              }}
            />
          </div>
          {message && (
            <div className="mt-3">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          )}
        </Panel>

        <Panel>
          <h2 className="mb-1 font-semibold">Installera</h2>
          <p className="text-sm text-muted">
            iPhone: Share → Add to Home Screen. Android: menu ⋮ → Install app. Installed, Prata works offline and your
            browser won&apos;t clear its data.
          </p>
        </Panel>

        <Panel>
          <h2 className="mb-3 font-semibold">Rensa</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => forget()}>
              Ta bort hämtat material
            </Button>
            <Button variant="danger" onClick={reset}>
              Radera all progress
            </Button>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

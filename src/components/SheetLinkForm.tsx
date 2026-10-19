"use client";

import { useEffect, useState } from "react";
import { useContent } from "@/components/ContentProvider";
import { Button, Notice } from "@/components/ui";
import { readSlice, updateSlice } from "@/lib/progress";
import { TAB_NAMES, type TabName } from "@/lib/sheets";

export function SheetLinkForm({ onSynced, showTabLinks = false }: { onSynced?: (warnings: string[]) => void; showTabLinks?: boolean }) {
  const { sync } = useContent();
  const [url, setUrl] = useState("");
  const [tabUrls, setTabUrls] = useState<Partial<Record<TabName, string>>>({});
  // Saved values are read after hydration so the first render matches the static HTML.
  useEffect(() => {
    const saved = readSlice("settings");
    setUrl(saved.sheetUrl);
    setTabUrls(saved.tabUrls);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setWarnings([]);
    const cleaned = Object.fromEntries(Object.entries(tabUrls).filter(([, v]) => v?.trim())) as Partial<Record<TabName, string>>;
    updateSlice("settings", (s) => ({ ...s, sheetUrl: url.trim(), tabUrls: cleaned }));
    try {
      const result = await sync();
      setWarnings(result);
      onSynced?.(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Google Sheet link</span>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      {showTabLinks && (
        <details className="rounded-xl border border-line p-3 text-sm">
          <summary className="cursor-pointer font-medium">Advanced: one CSV link per tab</summary>
          <p className="my-2 text-muted">
            For a Sheet you don&apos;t want to share by link. Publish each tab to the web instead (File → Share →
            Publish to web → pick a tab → &quot;Comma-separated values&quot;) and paste its link here. The main link
            above needs the Sheet to be shared by link.
          </p>
          <div className="space-y-2">
            {TAB_NAMES.map((tab) => (
              <label key={tab} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-muted">{tab}</span>
                <input
                  type="url"
                  value={tabUrls[tab] ?? ""}
                  onChange={(e) => setTabUrls({ ...tabUrls, [tab]: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <Button type="submit" disabled={busy || (!url.trim() && !Object.values(tabUrls).some(Boolean))} className="w-full">
        {busy ? "Hämtar …" : "Hämta materialet"}
      </Button>
      {error && <Notice tone="bad">{error}</Notice>}
      {warnings.length > 0 && (
        <Notice tone="warn">
          <p className="mb-1 font-semibold">Synced, with some problems:</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
    </form>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/** Opens the phone's share sheet, or copies the text where sharing isn't available. */
export function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing else to try.
    }
  }

  return (
    <Button variant="secondary" onClick={share}>
      {copied ? "Kopierat ✓" : "Dela / kopiera"}
    </Button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { updateSlice, useSlice } from "@/lib/progress";

/** iPhone Safari may clear a site's data after a while; Home Screen apps keep it. */
export function InstallHint() {
  const settings = useSlice("settings");
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
    setShow(ios && !standalone);
  }, []);

  if (!show || settings.installHintDismissed) return null;
  return (
    <div className="mb-4 rounded-2xl bg-warn-soft p-4 text-sm text-warn">
      <p className="font-semibold">Lägg till Prata på hemskärmen</p>
      <p className="mt-1">
        Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. Safari can delete a website&apos;s saved
        progress if you don&apos;t open it for a while — apps on the Home Screen keep it.
      </p>
      <button
        className="mt-2 font-semibold underline"
        onClick={() => updateSlice("settings", (s) => ({ ...s, installHintDismissed: true }))}
      >
        Okej
      </button>
    </div>
  );
}

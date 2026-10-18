"use client";

import { useEffect } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Registers the offline cache in production builds only, so dev reloads stay fresh. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  }, []);
  return null;
}

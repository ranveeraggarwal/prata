"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { clearContent, loadContent, saveContent } from "@/lib/content-cache";
import { readSlice } from "@/lib/progress";
import { fetchContent } from "@/lib/sheets";
import { EMPTY_CONTENT, type Content } from "@/lib/types";

type Status = "loading" | "empty" | "ready";

interface ContentState {
  content: Content;
  status: Status;
  /** Downloads the Sheet from the link in settings. Resolves to the sync warnings. */
  sync: () => Promise<string[]>;
  forget: () => Promise<void>;
}

const ContentContext = createContext<ContentState | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content>(EMPTY_CONTENT);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    loadContent().then((cached) => {
      if (cancelled) return;
      if (cached) {
        setContent(cached);
        setStatus("ready");
      } else {
        setStatus("empty");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sync = useCallback(async () => {
    const { sheetUrl, tabUrls } = readSlice("settings");
    const result = await fetchContent({ sheetUrl, tabUrls });
    await saveContent(result.content);
    setContent(result.content);
    setStatus("ready");
    return result.warnings;
  }, []);

  const forget = useCallback(async () => {
    await clearContent();
    setContent(EMPTY_CONTENT);
    setStatus("empty");
  }, []);

  return <ContentContext.Provider value={{ content, status, sync, forget }}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentState {
  const state = useContext(ContentContext);
  if (!state) throw new Error("useContent must be used inside ContentProvider");
  return state;
}

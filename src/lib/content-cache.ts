import { del, get, set } from "idb-keyval";
import type { Content } from "./types";

const KEY = "prata:content:v1";

/** The synced Sheet lives in IndexedDB: with the novels it is larger than localStorage allows. */
export async function loadContent(): Promise<Content | undefined> {
  try {
    return await get<Content>(KEY);
  } catch {
    return undefined;
  }
}

export async function saveContent(content: Content): Promise<void> {
  await set(KEY, content);
}

export async function clearContent(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // ignore
  }
}

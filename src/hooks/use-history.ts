"use client";

/**
 * Local history, from section 9 of the technical design. Saved on the device
 * only, newest first, capped at 200 entries. Kept in an external store so the
 * first render matches the server. Every write is wrapped safely in case
 * storage is full or blocked.
 */

import { useMemo, useSyncExternalStore } from "react";
import { STORAGE_KEYS, storageGetJSON, storageSetJSON } from "@/lib/storage";

export type HistoryEntry = {
  id: string;
  src: string;
  tgt: string;
  sourceText: string;
  targetText: string;
  createdAt: number;
  flagged: boolean;
};

const CAP = 200;
const EMPTY: HistoryEntry[] = [];

let snapshot: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): HistoryEntry[] {
  const stored = storageGetJSON<HistoryEntry[]>(STORAGE_KEYS.history);
  if (!Array.isArray(stored)) return [...EMPTY];
  return stored
    .filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        typeof e.sourceText === "string" &&
        // A corrupt createdAt must not survive the filter: formatting an
        // invalid date would break the whole sheet render (L-10).
        typeof e.createdAt === "number" &&
        Number.isFinite(e.createdAt),
    )
    .slice(0, CAP);
}

function getSnapshot(): HistoryEntry[] {
  if (snapshot === null) snapshot = readFromStorage();
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = () => {
    snapshot = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function write(next: HistoryEntry[]): void {
  snapshot = next.slice(0, CAP);
  storageSetJSON(STORAGE_KEYS.history, snapshot);
  notify();
}

/** Add an entry, or update the one from the same session instead of adding a
    near duplicate. The flagged mark survives an update. */
function addOrReplace(entry: HistoryEntry): void {
  const current = getSnapshot();
  const index = current.findIndex((e) => e.id === entry.id);
  if (index >= 0) {
    const existing = current[index]!;
    const next = [entry, ...current.slice(0, index), ...current.slice(index + 1)];
    entry.flagged = existing.flagged || entry.flagged;
    write(next);
  } else {
    write([entry, ...current]);
  }
}

function remove(id: string): void {
  write(getSnapshot().filter((e) => e.id !== id));
}

function setFlagged(id: string, flagged: boolean): void {
  write(getSnapshot().map((e) => (e.id === id ? { ...e, flagged } : e)));
}

function clear(): void {
  write([]);
}

export function useHistory() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const loaded = entries !== EMPTY;

  // A stable object (M-16): the old useCallback-then-call pattern built a
  // new actions object on every render and re-rendered everything that
  // depends on the history context on every keystroke.
  const actions = useMemo(() => ({ addOrReplace, remove, setFlagged, clear }), []);

  return { entries, loaded, ...actions };
}

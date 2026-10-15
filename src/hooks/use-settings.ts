"use client";

/**
 * Settings, persisted in localStorage under pt.settings.v1, read through an
 * external store so the first render matches the server and the stored values
 * arrive right after hydration without warnings.
 */

import { useCallback, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { STORAGE_KEYS, storageGetJSON, storageSetJSON } from "@/lib/storage";

export type Settings = {
  theme: "system" | "light" | "dark";
  hideInput: boolean;
  keepHistory: boolean;
  lastSrc: string;
  lastTgt: string;
  /** Prefer small fast models for pairs that have one. */
  useFastModels: boolean;
  /** Experimental: try WebGPU instead of WebAssembly. Off by default. */
  useWebGPU: boolean;
  /** Language pairs ("src|tgt" registry codes) the person chose to always
   *  run on the full model, from the approximate notice's button. Stored
   *  separately from useFastModels so the global switch stays untouched. */
  fullModelFor: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  hideInput: false,
  keepHistory: true,
  lastSrc: "eng_Latn",
  lastTgt: "fra_Latn",
  useFastModels: true,
  useWebGPU: false,
  fullModelFor: [],
};

let snapshot: Settings | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): Settings {
  const stored = storageGetJSON<Partial<Settings>>(STORAGE_KEYS.settings);
  if (!stored) return { ...DEFAULT_SETTINGS };
  return {
    theme: stored.theme === "light" || stored.theme === "dark" || stored.theme === "system" ? stored.theme : DEFAULT_SETTINGS.theme,
    hideInput: typeof stored.hideInput === "boolean" ? stored.hideInput : DEFAULT_SETTINGS.hideInput,
    keepHistory: typeof stored.keepHistory === "boolean" ? stored.keepHistory : DEFAULT_SETTINGS.keepHistory,
    lastSrc: typeof stored.lastSrc === "string" ? stored.lastSrc : DEFAULT_SETTINGS.lastSrc,
    lastTgt: typeof stored.lastTgt === "string" ? stored.lastTgt : DEFAULT_SETTINGS.lastTgt,
    useFastModels: typeof stored.useFastModels === "boolean" ? stored.useFastModels : DEFAULT_SETTINGS.useFastModels,
    useWebGPU: typeof stored.useWebGPU === "boolean" ? stored.useWebGPU : DEFAULT_SETTINGS.useWebGPU,
    fullModelFor: Array.isArray(stored.fullModelFor)
      ? stored.fullModelFor.filter((k) => typeof k === "string" && k.includes("|")).slice(0, 64)
      : DEFAULT_SETTINGS.fullModelFor,
  };
}

function getSnapshot(): Settings {
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

function updateStore(patch: Partial<Settings>): void {
  snapshot = { ...getSnapshot(), ...patch };
  storageSetJSON(STORAGE_KEYS.settings, snapshot);
  notify();
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS);
  const { setTheme } = useTheme();

  const update = useCallback(
    (patch: Partial<Settings>) => {
      updateStore(patch);
    },
    [],
  );

  // True once the stored settings have been read on the client. The server
  // snapshot is the defaults object itself, so identity tells them apart.
  const loaded = settings !== DEFAULT_SETTINGS;

  const applyTheme = useCallback(
    (theme: Settings["theme"]) => {
      setTheme(theme);
    },
    [setTheme],
  );

  /** Store "use the full model for this pair" from the notice's button. */
  const addFullModelFor = useCallback(
    (pairKey: string) => {
      const current = getSnapshot().fullModelFor;
      if (current.includes(pairKey)) return;
      updateStore({ fullModelFor: [...current, pairKey] });
    },
    [],
  );

  /** Remove one pair override (Settings list). */
  const removeFullModelFor = useCallback(
    (pairKey: string) => {
      updateStore({ fullModelFor: getSnapshot().fullModelFor.filter((k) => k !== pairKey) });
    },
    [],
  );

  return { settings, update, loaded, applyTheme, addFullModelFor, removeFullModelFor };
}

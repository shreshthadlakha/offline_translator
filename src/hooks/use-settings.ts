"use client";

/**
 * Settings, persisted in localStorage under pt.settings.v1, read through an
 * external store so the first render matches the server and the stored values
 * arrive right after hydration without warnings.
 */

import { useCallback, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { STORAGE_KEYS, storageGetJSON, storageSetJSON } from "@/lib/storage";
import { restoredPair } from "@/lib/engines";
import { languageByCode } from "@/lib/languages";

export type Settings = {
  theme: "system" | "light" | "dark";
  hideInput: boolean;
  keepHistory: boolean;
  lastSrc: string;
  lastTgt: string;
  /** The most recent pair that runs on a small model, so the page can open
   * on it when the last used pair needs the large model (which never starts
   * on page load). */
  lastSmallSrc: string;
  lastSmallTgt: string;
  /** Prefer small fast models for pairs that have one. */
  useFastModels: boolean;
  /** Experimental: try WebGPU instead of WebAssembly. Off by default. */
  useWebGPU: boolean;
  /** Keep the large-model languages out of the pickers. Off by default: they
   * are offered normally, with their plain "Large" tag. */
  hideLargeLanguages: boolean;
  /** Minutes without a translation before the large model is unloaded to
   * free memory. 0 means never. */
  idleUnloadMinutes: 5 | 15 | 0;
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
  lastSmallSrc: "eng_Latn",
  lastSmallTgt: "fra_Latn",
  useFastModels: true,
  useWebGPU: false,
  hideLargeLanguages: false,
  idleUnloadMinutes: 5,
  fullModelFor: [],
};

let snapshot: Settings | null = null;
const listeners = new Set<() => void>();

// ---- the session pair -------------------------------------------------------------
//
// The pair the page opens on. Decided exactly once, on the first render after
// the stored settings arrive: when the last used pair needs the large model,
// the page opens on the last small-model pair (or English to French), because
// the large model never starts on page load. Any later write to lastSrc or
// lastTgt is a deliberate choice (a picker, a swap, a share link), and the
// chosen pair is used as it is from then on.

let sessionDecided = false;
let sessionOverride: { src: string; tgt: string } | null = null;

/** The pair to use this visit: the last used pair, with the one-time
 *  page-load fallback away from the large model. */
export function sessionPair(settings: Settings): { src: string; tgt: string } {
  // Only decide once the stored settings have been read: the server snapshot
  // and the hydration snapshot are the defaults object itself.
  if (!sessionDecided && settings !== DEFAULT_SETTINGS) {
    sessionDecided = true;
    const restored = restoredPair(settings);
    if (restored.changed) sessionOverride = { src: restored.src, tgt: restored.tgt };
  }
  if (sessionOverride) return sessionOverride;
  return {
    src: languageByCode(settings.lastSrc)?.code ?? "eng_Latn",
    tgt: languageByCode(settings.lastTgt)?.code ?? "fra_Latn",
  };
}

function readFromStorage(): Settings {
  const stored = storageGetJSON<Partial<Settings>>(STORAGE_KEYS.settings);
  if (!stored) return { ...DEFAULT_SETTINGS };
  return {
    theme: stored.theme === "light" || stored.theme === "dark" || stored.theme === "system" ? stored.theme : DEFAULT_SETTINGS.theme,
    hideInput: typeof stored.hideInput === "boolean" ? stored.hideInput : DEFAULT_SETTINGS.hideInput,
    keepHistory: typeof stored.keepHistory === "boolean" ? stored.keepHistory : DEFAULT_SETTINGS.keepHistory,
    lastSrc: typeof stored.lastSrc === "string" ? stored.lastSrc : DEFAULT_SETTINGS.lastSrc,
    lastTgt: typeof stored.lastTgt === "string" ? stored.lastTgt : DEFAULT_SETTINGS.lastTgt,
    lastSmallSrc: typeof stored.lastSmallSrc === "string" ? stored.lastSmallSrc : DEFAULT_SETTINGS.lastSmallSrc,
    lastSmallTgt: typeof stored.lastSmallTgt === "string" ? stored.lastSmallTgt : DEFAULT_SETTINGS.lastSmallTgt,
    useFastModels: typeof stored.useFastModels === "boolean" ? stored.useFastModels : DEFAULT_SETTINGS.useFastModels,
    useWebGPU: typeof stored.useWebGPU === "boolean" ? stored.useWebGPU : DEFAULT_SETTINGS.useWebGPU,
    // The old "show experimental languages" switch is deliberately not read:
    // the large-model languages are offered normally now, whatever the old
    // switch said.
    hideLargeLanguages:
      typeof stored.hideLargeLanguages === "boolean"
        ? stored.hideLargeLanguages
        : DEFAULT_SETTINGS.hideLargeLanguages,
    idleUnloadMinutes:
      stored.idleUnloadMinutes === 5 || stored.idleUnloadMinutes === 15 || stored.idleUnloadMinutes === 0
        ? stored.idleUnloadMinutes
        : DEFAULT_SETTINGS.idleUnloadMinutes,
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
  // A write to the pair is a deliberate choice: the page-load fallback no
  // longer applies.
  if ("lastSrc" in patch || "lastTgt" in patch) sessionOverride = null;
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

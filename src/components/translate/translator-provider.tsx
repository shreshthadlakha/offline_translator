"use client";

/**
 * Holds the translate view's state and shares it with the header controls:
 * the text, the language pair, the engine, hide input, history settling and
 * flagging. Keeps the text in one state value inside useTranslator so a
 * keystroke re renders the panes, not the whole page.
 *
 * The pair sits in its own narrow context, because parts of the page that
 * only care about the languages (the picker row, the language grid) must not
 * re render on every keystroke.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useEngineContext, type Engine } from "@/hooks/use-engine";
import { useHistory, type HistoryEntry } from "@/hooks/use-history";
import { useSettings, type Settings } from "@/hooks/use-settings";
import { useTranslator, type OutputModel } from "@/hooks/use-translator";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { languageByCode } from "@/lib/languages";
import type { Language } from "@/lib/languages";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/copy";

export type TranslatorState = {
  // text
  input: string;
  setInput: (value: string) => void;
  output: OutputModel;
  // pair
  srcCode: string;
  tgtCode: string;
  srcLang: Language | undefined;
  tgtLang: Language | undefined;
  setPair: (src: string, tgt: string) => void;
  // engine
  engine: Engine;
  // settings
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  // actions
  translateNow: () => void;
  clearInput: () => void;
  flagCurrent: () => void;
  manualTick: number;
  // starts setup when needed, honouring the data saver and offline gates
  maybeStartSetup: () => void;
  // history
  history: ReturnType<typeof useHistory>;
  // setup gating
  dataSaverAskOpen: boolean;
  confirmDataSaver: () => void;
  declineDataSaver: () => void;
  // the honest ask before a heavy full model setup
  heavyAsk: { open: boolean; language: string; lowMemoryGB: string | null };
  confirmHeavySetup: () => void;
  declineHeavySetup: () => void;
  /** The target language picker's open state, shared with the tool card so
   * the heavy ask's "Choose another language" answer can open it. */
  targetPickerOpen: boolean;
  setTargetPickerOpen: (open: boolean) => void;
};

export type PairState = {
  srcCode: string;
  tgtCode: string;
  srcLang: Language | undefined;
  tgtLang: Language | undefined;
  setPair: (src: string, tgt: string) => void;
  /** Picking the language already set on the other side swaps the two. */
  chooseSource: (code: string) => void;
  chooseTarget: (code: string) => void;
};

const TranslatorContext = createContext<TranslatorState | null>(null);
const PairContext = createContext<PairState | null>(null);

export function useTranslatorState(): TranslatorState {
  const state = useContext(TranslatorContext);
  if (!state) throw new Error("useTranslatorState must be used inside TranslatorProvider");
  return state;
}

/** The language pair only. Components using this don't re render while typing. */
export function usePairState(): PairState {
  const state = useContext(PairContext);
  if (!state) throw new Error("usePairState must be used inside TranslatorProvider");
  return state;
}

const SETTLE_MS = 2000;

function newSessionId(): string {
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TranslatorProvider({ children }: { children: React.ReactNode }) {
  const engine = useEngineContext();
  const { settings, update, loaded, applyTheme } = useSettings();
  const history = useHistory();
  const online = useOnlineStatus();

  // Apply the stored theme once settings have loaded.
  useEffect(() => {
    if (loaded) applyTheme(settings.theme);
  }, [loaded, settings.theme, applyTheme]);

  const [dataSaverAskOpen, setDataSaverAskOpen] = useState(false);

  // The honest ask before a heavy setup: pairs that need the full model and
  // don't have it saved yet. Asked before the download starts, not after it
  // goes wrong, on every path that can start one. Not asked again once the
  // model is saved, or for a pair whose ask was already answered this visit.
  const [heavyAsk, setHeavyAsk] = useState<{ open: boolean; language: string; lowMemoryGB: string | null }>({
    open: false,
    language: "",
    lowMemoryGB: null,
  });
  const heavyAcceptedRef = useRef<Set<string>>(new Set());
  /** The ask that is waiting for an answer: the pair it was opened for, and
   * the engine load's gate promise to resolve with the answer. */
  const heavyPendingRef = useRef<{ pairKey: string; resolve: (allowed: boolean) => void } | null>(null);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);

  // The pair derives from the stored settings, so the first render matches the
  // server and the stored pair arrives right after hydration.
  const srcCode = languageByCode(settings.lastSrc)?.code ?? "eng_Latn";
  const tgtCode = languageByCode(settings.lastTgt)?.code ?? "fra_Latn";

  const translator = useTranslator(srcCode, tgtCode);
  const { input, setInput, output, translateNow, clearInput, manualTick } = translator;

  // ---- the heavy gate ---------------------------------------------------------------
  // Attached to the engine (which sits above this provider in the tree) so
  // every route to a full model download asks first: a first start, a switch
  // from a small model, and a restart. The dialog names the language without
  // a fast model, which is the target, unless the target is English.
  const heavyGate = useCallback(
    (engineToLoad: { modelId: string }, pair: { src: string; tgt: string }) =>
      new Promise<boolean>((resolve) => {
        const pairKey = `${pair.src}|${pair.tgt}`;
        if (heavyAcceptedRef.current.has(pairKey)) {
          resolve(true);
          return;
        }
        const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
        const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 4 ? String(Math.round(deviceMemory)) : null;
        const exotic = pair.tgt === "eng_Latn" ? pair.src : pair.tgt;
        heavyPendingRef.current = { pairKey, resolve };
        setHeavyAsk({
          open: true,
          language: languageByCode(exotic)?.english ?? "this language",
          lowMemoryGB: lowMemory,
        });
      }),
    [],
  );
  useEffect(() => {
    engine.setHeavyGate(heavyGate);
    return () => engine.setHeavyGate(null);
  }, [engine, heavyGate]);

  // ---- setup gating ---------------------------------------------------------------

  const dataSaverAskedRef = useRef(false);

  const maybeStartSetup = useCallback(() => {
    if (engine.status !== "idle") return;
    if (typeof navigator === "undefined") return;
    if (engine.error) return;
    if (typeof navigator.onLine === "boolean" && !navigator.onLine) return;
    // The honest ask for a full model pair is inside the engine's load path
    // (the heavy gate below), so it fires on every route to that download:
    // here, an engine switch, and a restart after an error.
    const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData && !dataSaverAskedRef.current) {
      dataSaverAskedRef.current = true;
      setDataSaverAskOpen(true);
      return;
    }
    engine.start();
  }, [engine]);

  const handleSetInput = useCallback(
    (value: string) => {
      setInput(value);
      if (value.trim().length > 0) maybeStartSetup();
    },
    [setInput, maybeStartSetup],
  );

  const handleTranslateNow = useCallback(() => {
    // An explicit Translate press may ask about data saver again after a decline.
    dataSaverAskedRef.current = false;
    if (input.trim().length > 0) {
      maybeStartSetup();
      // If the engine isn't up yet, say what happens to what was typed,
      // instead of a press that looks like it did nothing.
      if (engine.status !== "ready" && engine.status !== "error") {
        toast({ description: copy.setup.willRunAfterSetup });
      }
    }
    translateNow();
  }, [input, engine.status, maybeStartSetup, translateNow]);

  const confirmDataSaver = useCallback(() => {
    setDataSaverAskOpen(false);
    engine.start();
  }, [engine]);

  const declineDataSaver = useCallback(() => {
    setDataSaverAskOpen(false);
  }, []);

  const confirmHeavySetup = useCallback(() => {
    setHeavyAsk((prev) => ({ ...prev, open: false }));
    // The load that asked is waiting on the gate's promise; resolving it
    // lets it continue. No start call: whichever path asked (first start,
    // switch, restart) already owns the next step.
    const pending = heavyPendingRef.current;
    heavyPendingRef.current = null;
    if (pending) {
      heavyAcceptedRef.current.add(pending.pairKey);
      pending.resolve(true);
    }
  }, []);

  const declineHeavySetup = useCallback(() => {
    setHeavyAsk((prev) => ({ ...prev, open: false }));
    const pending = heavyPendingRef.current;
    heavyPendingRef.current = null;
    if (pending) pending.resolve(false);
    // The engine that is loaded (if any) cannot serve the chosen pair, so
    // it is stopped rather than left to translate with the wrong model. The
    // card returns to its offer, and the picker opens for another language.
    if (engine.desiredEngine?.kind === "nllb") engine.stop();
    setTargetPickerOpen(true);
  }, [engine]);

  // ---- pair handling ----------------------------------------------------------------

  const setPair = useCallback(
    (src: string, tgt: string) => {
      // The pair lives in the settings store, which persists it.
      update({ lastSrc: src, lastTgt: tgt });
    },
    [update],
  );

  const pairValue = useMemo<PairState>(
    () => ({
      srcCode,
      tgtCode,
      srcLang: languageByCode(srcCode),
      tgtLang: languageByCode(tgtCode),
      setPair,
      chooseSource: (code: string) => {
        if (code === tgtCode) {
          // Picking the language already set on the other side swaps the two.
          setPair(tgtCode, srcCode);
        } else {
          setPair(code, tgtCode);
        }
      },
      chooseTarget: (code: string) => {
        if (code === srcCode) {
          setPair(tgtCode, srcCode);
        } else {
          setPair(srcCode, code);
        }
      },
    }),
    [srcCode, tgtCode, setPair],
  );

  // ---- history settling ---------------------------------------------------------------

  const sessionRef = useRef<{ id: string; src: string; tgt: string } | null>(null);
  const lastSavedRef = useRef<string>("");

  // A change of language pair starts a new session.
  useEffect(() => {
    if (!sessionRef.current || sessionRef.current.src !== srcCode || sessionRef.current.tgt !== tgtCode) {
      sessionRef.current = { id: newSessionId(), src: srcCode, tgt: tgtCode };
    }
  }, [srcCode, tgtCode]);

  const saveEntry = useCallback(
    (force = false) => {
      if (!settings.keepHistory) return;
      if (input.trim().length === 0) return;
      if (!output.hasAnyOutput) return;
      if (output.pendingCount > 0) return;
      const session = sessionRef.current;
      if (!session) return;
      const fingerprint = `${session.id}|${srcCode}|${tgtCode}|${input}|${output.plainText}`;
      if (!force && fingerprint === lastSavedRef.current) return;
      lastSavedRef.current = fingerprint;
      const entry: HistoryEntry = {
        id: session.id,
        src: srcCode,
        tgt: tgtCode,
        sourceText: input,
        targetText: output.plainText,
        createdAt: Date.now(),
        flagged: history.entries.find((e) => e.id === session.id)?.flagged ?? false,
      };
      history.addOrReplace(entry);
    },
    [settings.keepHistory, input, output, srcCode, tgtCode, history],
  );

  // Save once the translation has settled: about two seconds without typing
  // and every sentence translated.
  useEffect(() => {
    if (!settings.keepHistory || input.trim().length === 0) return;
    const timer = setTimeout(() => saveEntry(), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [input, output.pendingCount, output.plainText, settings.keepHistory, saveEntry]);

  // Manual completion: translate pressed, everything done, show the quiet note.
  useEffect(() => {
    if (manualTick === 0) return;
    if (input.trim().length === 0) return;
    if (output.pendingCount > 0 || !output.hasAnyOutput) return;
    const alreadyNoted = lastSavedRef.current.endsWith(`|${output.plainText}`);
    saveEntry(true);
    if (!alreadyNoted) {
      toast({ description: copy.translate.translationReady });
    }
  }, [manualTick, output.pendingCount]);

  // The first time a translation completes while the device is offline, say so
  // once, quietly. It's the completion that matters, not the offline state on
  // its own, so the transition into "everything settled" is what fires it.
  const offlineNotedRef = useRef(false);
  const wasSettledRef = useRef(false);
  useEffect(() => {
    const settled = input.trim().length > 0 && output.hasAnyOutput && output.pendingCount === 0;
    const justSettled = settled && !wasSettledRef.current;
    wasSettledRef.current = settled;
    if (!justSettled) return;
    if (online) return;
    if (offlineNotedRef.current) return;
    offlineNotedRef.current = true;
    toast({ description: copy.translate.translatedOffline });
  }, [online, input, output.hasAnyOutput, output.pendingCount]);

  const flagCurrent = useCallback(() => {
    if (input.trim().length === 0 || !output.hasAnyOutput) return;
    const session = sessionRef.current;
    if (!session) return;
    saveEntry(true);
    window.setTimeout(() => {
      history.setFlagged(session.id, true);
      toast({ description: copy.translate.flagMarked });
    }, 0);
  }, [input, output.hasAnyOutput, saveEntry, history]);

  const value = useMemo<TranslatorState>(
    () => ({
      input,
      setInput: handleSetInput,
      output,
      srcCode,
      tgtCode,
      srcLang: languageByCode(srcCode),
      tgtLang: languageByCode(tgtCode),
      setPair,
      engine,
      settings,
      updateSettings: update,
      translateNow: handleTranslateNow,
      clearInput,
      flagCurrent,
      manualTick,
      maybeStartSetup,
      history,
      dataSaverAskOpen,
      confirmDataSaver,
      declineDataSaver,
      heavyAsk,
      confirmHeavySetup,
      declineHeavySetup,
      targetPickerOpen,
      setTargetPickerOpen,
    }),
    [
      input,
      handleSetInput,
      output,
      srcCode,
      tgtCode,
      setPair,
      engine,
      settings,
      update,
      handleTranslateNow,
      clearInput,
      flagCurrent,
      manualTick,
      maybeStartSetup,
      history,
      dataSaverAskOpen,
      confirmDataSaver,
      declineDataSaver,
      heavyAsk,
      confirmHeavySetup,
      declineHeavySetup,
      targetPickerOpen,
    ],
  );

  return (
    <TranslatorContext.Provider value={value}>
      <PairContext.Provider value={pairValue}>{children}</PairContext.Provider>
    </TranslatorContext.Provider>
  );
}

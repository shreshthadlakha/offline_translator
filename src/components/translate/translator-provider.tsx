"use client";

/**
 * Holds the translate view's state and shares it with the header controls:
 * the text, the language pair, the engine, hide input, history settling and
 * flagging. Keeps the text in one state value inside useTranslator so a
 * keystroke re renders the panes, not the whole page.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useEngineContext, type Engine } from "@/hooks/use-engine";
import { useHistory, type HistoryEntry } from "@/hooks/use-history";
import { useSettings, type Settings } from "@/hooks/use-settings";
import { useTranslator, type OutputModel } from "@/hooks/use-translator";
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
};

const TranslatorContext = createContext<TranslatorState | null>(null);

export function useTranslatorState(): TranslatorState {
  const state = useContext(TranslatorContext);
  if (!state) throw new Error("useTranslatorState must be used inside TranslatorProvider");
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

  // Apply the stored theme once settings have loaded.
  useEffect(() => {
    if (loaded) applyTheme(settings.theme);
  }, [loaded, settings.theme, applyTheme]);

  const [dataSaverAskOpen, setDataSaverAskOpen] = useState(false);

  // The pair derives from the stored settings, so the first render matches the
  // server and the stored pair arrives right after hydration.
  const srcCode = languageByCode(settings.lastSrc)?.code ?? "eng_Latn";
  const tgtCode = languageByCode(settings.lastTgt)?.code ?? "fra_Latn";

  const translator = useTranslator(srcCode, tgtCode);
  const { input, setInput, output, translateNow, clearInput, manualTick } = translator;

  // ---- setup gating ---------------------------------------------------------------

  const dataSaverAskedRef = useRef(false);

  const maybeStartSetup = useCallback(() => {
    if (engine.status !== "idle") return;
    if (typeof navigator === "undefined") return;
    if (engine.error) return;
    if (typeof navigator.onLine === "boolean" && !navigator.onLine) return;
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
    if (input.trim().length > 0) maybeStartSetup();
    translateNow();
  }, [input, maybeStartSetup, translateNow]);

  const confirmDataSaver = useCallback(() => {
    setDataSaverAskOpen(false);
    engine.start();
  }, [engine]);

  const declineDataSaver = useCallback(() => {
    setDataSaverAskOpen(false);
  }, []);

  // ---- pair handling ----------------------------------------------------------------

  const setPair = useCallback(
    (src: string, tgt: string) => {
      // The pair lives in the settings store, which persists it.
      update({ lastSrc: src, lastTgt: tgt });
    },
    [update],
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
    ],
  );

  return <TranslatorContext.Provider value={value}>{children}</TranslatorContext.Provider>;
}

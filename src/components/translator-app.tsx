"use client";

/**
 * The app shell. One main surface: the translate view. Secondary things
 * (History, Batch, Share, Settings, How it works) are reachable from the
 * header as layers over the translate view, never separate pages.
 * Opening a share link fills in the text and languages, then translation runs
 * as normal.
 */

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { EngineProvider } from "@/hooks/use-engine";
import { TranslatorProvider, useTranslatorState } from "@/components/translate/translator-provider";
import { TranslateView } from "@/components/translate/translate-view";
import { HistorySheet } from "@/components/history/history-sheet";
import { BatchDialog } from "@/components/batch/batch-dialog";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { HowItWorksDialog } from "@/components/about/how-it-works";
import { initInstallPrompt } from "@/hooks/use-install-prompt";
import { consumeShareFromLocation } from "@/lib/share";
import { languageByCode } from "@/lib/languages";

function ShareImport() {
  const { setInput, setPair } = useTranslatorState();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = await consumeShareFromLocation();
      if (!payload || cancelled) return;
      const src = languageByCode(payload.src)?.code;
      const tgt = languageByCode(payload.tgt)?.code;
      if (src && tgt) setPair(src, tgt);
      setInput(payload.s);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once, after mount, so nothing browser only happens during render.
  }, []);

  return null;
}

function TranslatorAppInner() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  // Capture the browser install offer quietly, for Settings.
  useEffect(() => {
    initInstallPrompt();
  }, []);

  // Register the service worker so the app keeps working with no connection.
  // It only caches this app's own files. Read in an effect, never during render.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support just doesn't turn on. The app still works online.
    });
  }, []);

  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const openBatch = useCallback(() => setBatchOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openHowItWorks = useCallback(() => setHowItWorksOpen(true), []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader onOpenHistory={openHistory} onOpenBatch={openBatch} onOpenSettings={openSettings} />
      <main className="flex-1 py-5 md:py-7">
        <TranslateView />
      </main>
      <AppFooter onOpenHowItWorks={openHowItWorks} />

      <ShareImport />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <BatchDialog open={batchOpen} onOpenChange={setBatchOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onOpenHowItWorks={openHowItWorks} />
      <HowItWorksDialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
    </div>
  );
}

export function TranslatorApp() {
  return (
    <EngineProvider>
      <TranslatorProvider>
        <TranslatorAppInner />
      </TranslatorProvider>
    </EngineProvider>
  );
}

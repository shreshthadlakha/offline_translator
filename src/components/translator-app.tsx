"use client";

/**
 * One continuous page. The tool is the hero: headline, subline, then the
 * translate card. Below it, in one scroll, the page says the idea (where your
 * words go), shows it can be checked (the live request log in a navy band),
 * shows the languages themselves (the grid), says what to expect, answers
 * questions, and ends with the privacy line. History, Batch and Settings stay
 * as layers over the page, reached from the header. Opening a share link
 * fills in the text and languages, then translation runs as normal.
 */

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { EngineProvider } from "@/hooks/use-engine";
import { TranslatorProvider, useTranslatorState } from "@/components/translate/translator-provider";
import { TranslateView } from "@/components/translate/translate-view";
import { Hero } from "@/components/page/hero";
import { WhereYourWordsGo } from "@/components/page/where-your-words-go";
import { CheckForYourself } from "@/components/page/check-for-yourself";
import { LanguageGrid } from "@/components/page/language-grid";
import { WhatToExpect } from "@/components/page/what-to-expect";
import { Questions } from "@/components/page/questions";
import { HistorySheet } from "@/components/history/history-sheet";
import { BatchDialog } from "@/components/batch/batch-dialog";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { initInstallPrompt } from "@/hooks/use-install-prompt";
import { consumeShareFromLocation } from "@/lib/share";
import { startNetLogObserver } from "@/lib/netlog";
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

  // Capture the browser install offer quietly, for Settings.
  useEffect(() => {
    initInstallPrompt();
  }, []);

  // Register the service worker so the app keeps working with no connection.
  // It only caches this app's own files. In development it is not registered
  // at all, and any earlier registration is removed, so stale worker bundles
  // and old shells never mask fresh code. Read in an effect, never during
  // render.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      }).catch(() => {
        // Nothing to unregister.
      });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support just doesn't turn on. The app still works online.
    });
  }, []);

  // The request log: everything the page asks for, from the start of the visit.
  useEffect(() => startNetLogObserver(), []);

  // Sections settle in once as they enter the screen. The hidden state only
  // exists when JavaScript is running, and reduced motion turns it off.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = document.querySelectorAll<HTMLElement>(".reveal");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  // Every link to the explanation scrolls to the "Where your words go"
  // section on the page.
  const scrollToHowItWorks = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById("where-your-words-go")
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const openBatch = useCallback(() => setBatchOpen(true), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader onOpenHistory={openHistory} onOpenBatch={openBatch} onOpenSettings={openSettings} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
          <Hero />
          <TranslateView />
        </div>

        <WhereYourWordsGo />
        <CheckForYourself />
        <LanguageGrid />
        <WhatToExpect />
        <Questions />
      </main>

      <AppFooter onHowItWorks={scrollToHowItWorks} />

      <ShareImport />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <BatchDialog open={batchOpen} onOpenChange={setBatchOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onHowItWorks={scrollToHowItWorks} />
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

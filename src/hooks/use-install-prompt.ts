"use client";

/**
 * Install prompt capture. The browser's own install pop up is prevented so
 * installation stays quiet, and is offered from Settings only.
 */

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    for (const listener of listeners) listener();
  });
  // Once installed, the offer goes away.
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    for (const listener of listeners) listener();
  });
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "accepted" | "dismissed" | "failed">("idle");

  useEffect(() => {
    const notify = () => setAvailable(deferredPrompt !== null);
    notify();
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setOutcome(choice.outcome);
    } catch {
      setOutcome("failed");
    }
    deferredPrompt = null;
    setAvailable(false);
  }, []);

  return { available, outcome, install };
}

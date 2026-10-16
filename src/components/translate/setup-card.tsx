"use client";

/**
 * The setup card. Until setup has finished it lives in the output pane, in
 * place of the empty state, so the one time download is always in view.
 *
 * Every state is designed, never silent: the offer (per engine, with the
 * small model copy for fast pairs), offline and not set up, the data saver
 * ask, checking, downloading with the single progress bar and its numbers,
 * reading into memory with a visible timer (no bytes move there, so it would
 * otherwise look frozen), checking that translation works, the ready note,
 * and the honest error states: memory, download, quota, another tab, and out
 * of date files, each with the right way forward.
 */

import { memo, useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { clockMs, mbWhole, speed as speedFmt, eta as etaFmt, formatBytes } from "@/lib/format";
import { clearShellCache, savedModels } from "@/lib/model-cache";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

function Card({ className, children, ...rest }: React.ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "my-auto w-full max-w-sm rounded-[var(--radius-control)] border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The out of date files action: clear the old caches and reload. */
async function reloadStaleFiles(): Promise<void> {
  await clearShellCache();
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    for (const registration of registrations ?? []) void registration.unregister();
  } catch {
    // Unregistering is best effort. The reload is what matters.
  }
  window.location.reload();
}

function SetupCardInner() {
  const { engine, srcLang, tgtLang, dataSaverAskOpen, confirmDataSaver, declineDataSaver, heavyAsk, confirmHeavySetup, declineHeavySetup } = useTranslatorState();
  const online = useOnlineStatus();
  const { status, error, progress, switching, notes, crashNotice, stallSeconds } = engine;
  const desired = engine.desiredEngine;

  // A visible clock for the stages where nothing would otherwise change on
  // screen: reading the model into memory, and the check that follows.
  const [, clockTick] = useState(0);
  const stageStartRef = useRef<number | null>(null);
  // Whether any model is saved on this device at all: decides which offline
  // line to show (never set up, or just this pair not set up). Null while
  // the cache is being read.
  const [anyModelSaved, setAnyModelSaved] = useState<boolean | null>(null);
  useEffect(() => {
    if (status !== "initializing" && status !== "testing") {
      stageStartRef.current = null;
      return;
    }
    stageStartRef.current = performance.now();
    const timer = setInterval(() => clockTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);
  const stageClock = stageStartRef.current != null ? performance.now() - stageStartRef.current : 0;

  // Offline and idle: which message depends on whether any model is saved
  // on this device at all.
  useEffect(() => {
    if (status !== "idle" || online) return;
    let cancelled = false;
    void (async () => {
      const saved = await savedModels();
      if (!cancelled) setAnyModelSaved(saved.size > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, online]);

  // The honest ask renders in every branch: over the idle offer (the gate
  // runs before any load state exists), during an active setup (a switch or
  // restart), over an error, and over a ready engine (a switch away from a
  // small model, before anything changes).
  const heavyDialog = (
    <AlertDialog open={heavyAsk.open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.setup.heavyTitle(heavyAsk.language)}</AlertDialogTitle>
          <AlertDialogDescription>
            {heavyAsk.lowMemoryGB != null
              ? copy.setup.heavyBodyLowMemory(heavyAsk.lowMemoryGB)
              : copy.setup.heavyBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={declineHeavySetup}>{copy.setup.heavyChooseAnother}</AlertDialogCancel>
          <AlertDialogAction onClick={confirmHeavySetup}>{copy.setup.heavyContinue}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // After setup finished, the pane handles the ready confirmation itself.
  // The honest ask can still open over a ready engine: picking a full model
  // pair while a small model is loaded asks before anything switches.
  if (status === "ready") return heavyAsk.open ? heavyDialog : null;

  if (dataSaverAskOpen) {
    return (
      <>
        <Card role="group" aria-label={copy.setup.dataSaverTitle}>
          <p className="type-body font-medium">{copy.setup.dataSaverTitle}</p>
          <p className="type-small mt-1 text-muted-foreground">{copy.setup.dataSaverBody}</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={confirmDataSaver}>
              {copy.setup.dataSaverConfirm}
            </Button>
            <Button size="sm" variant="ghost" onClick={declineDataSaver}>
              {copy.setup.dataSaverDecline}
            </Button>
          </div>
        </Card>
        {heavyDialog}
      </>
    );
  }

  if (status === "error" && error) {
    let body: string;
    let action: React.ReactNode = null;
    switch (error.code) {
      case "quota":
        body = copy.setup.quotaTooSmall(
          error.quota != null ? formatBytes(error.quota) : "",
          error.needed != null ? formatBytes(error.needed) : "",
        );
        break;
      case "another-tab":
        body = copy.setup.anotherTab;
        break;
      case "stale-code":
        body = copy.setup.staleCode;
        action = (
          <Button size="sm" variant="outline" onClick={() => void reloadStaleFiles()}>
            {copy.setup.reload}
          </Button>
        );
        break;
      case "memory":
        body = copy.setup.outOfMemory;
        action = (
          <Button size="sm" variant="outline" onClick={() => engine.start()}>
            {copy.setup.retry}
          </Button>
        );
        break;
      default:
        body = copy.setup.downloadFailed;
        action = (
          <Button size="sm" variant="outline" onClick={() => engine.start()}>
            {copy.setup.retry}
          </Button>
        );
    }
    return (
      <>
        <Card role="alert" className="border-danger/40">
          {crashNotice ? (
            <p className="type-small mb-2 text-danger">{copy.setup.crashedLastTime}</p>
          ) : null}
          <p className="type-small text-danger">{body}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </Card>
        {heavyDialog}
      </>
    );
  }

  if (status === "idle") {
    const showCrashNotice = crashNotice != null;
    if (!online) {
      const offlineLine =
        anyModelSaved == null || anyModelSaved === false
          ? copy.setup.offlineNotSetup
          : copy.setup.offlinePairNotSetup;
      return (
        <>
          <Card role="status">
            <CloudOff aria-hidden className="size-5 text-muted-foreground" />
            {showCrashNotice ? (
              <p className="type-small mt-2 text-danger">{copy.setup.crashedLastTime}</p>
            ) : null}
            <p className="type-small mt-2 text-muted-foreground">{offlineLine}</p>
          </Card>
          {heavyDialog}
        </>
      );
    }
    const fastPair = desired?.kind === "opus" || desired?.kind === "bergamot";
    const pairEnglish = `${srcLang?.english ?? "English"} to ${tgtLang?.english ?? "French"}`;
    return (
      <>
        <Card>
          {showCrashNotice ? (
            <p className="type-small mb-2 text-danger">{copy.setup.crashedLastTime}</p>
          ) : null}
          {fastPair && desired ? (
            <>
              <h3 className="type-body font-medium">
                {(desired.expectedBytes >= 200 * 1024 * 1024
                  ? copy.setup.settingUpLargePair(pairEnglish, mbWhole(desired.expectedBytes))
                  : copy.setup.settingUpPair(pairEnglish, mbWhole(desired.expectedBytes)))}
              </h3>
              <p className="type-small mt-1.5 text-muted-foreground">{copy.setup.line2}</p>
            </>
          ) : (
            <>
              <h3 className="type-body font-medium">{copy.setup.title}</h3>
              <p className="type-small mt-1.5 text-muted-foreground">{copy.setup.line1}</p>
              <p className="type-small mt-1 text-muted-foreground">{copy.setup.line2}</p>
            </>
          )}
          <div className="mt-4">
            <Button size="sm" onClick={() => engine.start()}>
              {copy.setup.start}
            </Button>
          </div>
        </Card>
        {heavyDialog}
      </>
    );
  }

  // Active setup: checking, downloading, initializing, testing. A Cancel
  // button is always there: no stage may trap the person.
  const primaryLine =
    status === "checking"
      ? copy.setup.stageChecking
      : status === "downloading"
        ? switching
          ? copy.setup.switching
          : desired?.kind === "opus" || desired?.kind === "bergamot"
            ? desired.expectedBytes >= 200 * 1024 * 1024
              ? copy.setup.settingUpLargePair(`${srcLang?.english ?? "English"} to ${tgtLang?.english ?? "French"}`, mbWhole(desired.expectedBytes))
              : copy.setup.settingUpPair(`${srcLang?.english ?? "English"} to ${tgtLang?.english ?? "French"}`, mbWhole(desired.expectedBytes))
            : copy.setup.stageDownloading
        : status === "initializing"
          ? copy.setup.stageInitializing
          : copy.setup.stageTesting;

  const speedText = speedFmt(progress.bps);
  const etaText = etaFmt(progress.etaMs);
  const elapsedText = clockMs(progress.elapsedMs);
  const numbersLine = [speedText, etaText ? `${etaText} left` : "", `${elapsedText} so far`]
    .filter((part) => part.length > 0)
    .join(" · ");

  return (
    <>
    <Card role="status" aria-live="polite">
      <p className="type-small text-muted-foreground">{primaryLine}</p>

      {status === "downloading" && progress.total > 0 ? (
        <>
          <Progress value={Math.round(progress.fraction * 100)} className="mt-2.5" aria-label={primaryLine} />
          <p className="type-small mt-1.5 text-muted-foreground tabular-nums">
            {copy.setup.progress(mbWhole(progress.loaded), mbWhole(progress.total))}
          </p>
          {numbersLine.length > 0 ? (
            <p className="type-small mt-0.5 text-muted-foreground tabular-nums">{numbersLine}</p>
          ) : null}
        </>
      ) : null}

      {status === "downloading" && progress.total > 0 && progress.fraction >= 1 ? (
        <p className="type-small mt-1.5 text-muted-foreground">{copy.setup.stageInitializing}</p>
      ) : null}

      {(status === "initializing" || status === "testing") && stageClock > 0 ? (
        <>
          <p className="type-small mt-2 text-muted-foreground tabular-nums">
            {copy.setup.workingFor(clockMs(stageClock))}
          </p>
          <p className="type-small mt-0.5 text-muted-foreground">{copy.setup.unpackingNote}</p>
          {status === "initializing" && stageClock >= 240_000 ? (
            <p className="type-small mt-1.5 text-danger" role="status">
              {copy.setup.veryLongLoadNote}
            </p>
          ) : status === "initializing" && stageClock >= 90_000 ? (
            <p className="type-small mt-1.5 text-muted-foreground" role="status">
              {copy.setup.longLoadNote}
            </p>
          ) : null}
        </>
      ) : null}

      {stallSeconds != null && status === "downloading" ? (
        <p className="type-small mt-2 text-danger" role="status">
          {copy.setup.stalled(stallSeconds)}
        </p>
      ) : null}

      {notes.storageDisabled ? (
        <p className="type-small mt-2 text-muted-foreground">{copy.setup.storageDisabled}</p>
      ) : null}
      {notes.memoryWarning ? (
        <p className="type-small mt-2 text-muted-foreground">
          {copy.setup.lowMemory(notes.memoryGB != null ? String(Math.round(notes.memoryGB)) : "4")}
        </p>
      ) : null}
      {notes.webgpuFellBack && status !== "checking" ? (
        <p className="type-small mt-2 text-muted-foreground">{copy.setup.webgpuFellBack}</p>
      ) : null}

      <div className="mt-3">
        <Button size="sm" variant="ghost" onClick={() => engine.stop()}>
          {copy.setup.cancelSetup}
        </Button>
      </div>
    </Card>
    {heavyDialog}
    </>
  );
}

export const SetupCard = memo(SetupCardInner);

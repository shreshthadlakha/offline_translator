"use client";

/**
 * The setup card, anchored under the input. Shows the first use note before
 * setup, the single calm progress bar during it, and the honest error
 * messages (out of memory, download failed) when something goes wrong.
 */

import { memo } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

function mb(value: number): string {
  return Math.max(0, Math.round(value / (1024 * 1024))).toString();
}

function SetupCardInner({ className }: { className?: string }) {
  const { engine, dataSaverAskOpen, confirmDataSaver, declineDataSaver } = useTranslatorState();

  // After setup finished, this card goes quiet. The badge carries the state.
  if (engine.status === "ready") return null;

  if (dataSaverAskOpen) {
    return (
      <div className={cn("rounded-lg border bg-surface p-3", className)} role="group" aria-label={copy.setup.dataSaverTitle}>
        <p className="type-small font-medium">{copy.setup.dataSaverTitle}</p>
        <p className="type-small text-muted-foreground">{copy.setup.dataSaverBody}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={confirmDataSaver}>
            {copy.setup.dataSaverConfirm}
          </Button>
          <Button size="sm" variant="ghost" onClick={declineDataSaver}>
            {copy.setup.dataSaverDecline}
          </Button>
        </div>
      </div>
    );
  }

  if (engine.status === "error" && engine.error) {
    const outOfMemory = engine.error.code === "memory";
    return (
      <div className={cn("rounded-lg border border-danger/40 bg-surface p-3", className)} role="alert">
        <p className="type-small text-danger">{outOfMemory ? copy.setup.outOfMemory : copy.setup.downloadFailed}</p>
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={engine.start}>
            {copy.setup.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (engine.status === "downloading") {
    // Starting from cache is quick. Show the quiet line, not a progress bar.
    if (engine.autoStarted) {
      return (
        <p className={cn("type-small text-muted-foreground", className)} aria-live="polite">
          {copy.status.starting}
        </p>
      );
    }
    const { loaded, total, fraction } = engine.progress;
    return (
      <div className={cn("rounded-lg border bg-surface p-3", className)} aria-live="polite">
        <p className="type-small text-muted-foreground">{copy.setup.settingUp}</p>
        {total > 0 ? (
          <>
            <Progress value={Math.round(fraction * 100)} className="mt-2" aria-label={copy.setup.settingUp} />
            <p className="type-small mt-1.5 text-muted-foreground tabular-nums">
              {copy.setup.progress(mb(loaded), mb(total))}
            </p>
          </>
        ) : null}
      </div>
    );
  }

  // Idle: the first use note, stated up front with its size.
  return (
    <p className={cn("type-small text-muted-foreground", className)}>{copy.setup.firstUseNote}</p>
  );
}

export const SetupCard = memo(SetupCardInner);

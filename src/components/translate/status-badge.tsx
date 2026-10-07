"use client";

/**
 * One small badge in one place, with a polite live region. States: Starting,
 * Setting up, Ready, Works offline, Offline and not set up.
 */

import { memo } from "react";
import { CloudOff } from "lucide-react";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

function StatusBadgeInner({ className }: { className?: string }) {
  const { engine } = useTranslatorState();
  const online = useOnlineStatus();

  let content: React.ReactNode = null;

  if (engine.status === "ready") {
    if (online) {
      content = (
        <>
          <span aria-hidden className="size-2 rounded-full bg-accent-green" />
          <span>{copy.status.ready}</span>
        </>
      );
    } else {
      content = (
        <>
          <CloudOff aria-hidden className="size-3.5 text-accent-green-text" />
          <span>{copy.status.worksOffline}</span>
        </>
      );
    }
  } else if (engine.status === "downloading") {
    content = (
      <>
        <span aria-hidden className="size-2 rounded-full bg-accent-green opacity-70" />
        <span>{engine.autoStarted ? copy.status.starting : copy.status.settingUp}</span>
      </>
    );
  } else if ((engine.status === "idle" || engine.status === "error") && !online) {
    content = (
      <>
        <CloudOff aria-hidden className="size-3.5 text-muted-foreground" />
        <span>{copy.status.offlineNotSetup}</span>
      </>
    );
  }

  if (!content) return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        "type-small inline-flex max-w-full items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-muted-foreground shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {content}
    </div>
  );
}

export const StatusBadge = memo(StatusBadgeInner);

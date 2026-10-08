"use client";

/**
 * The engine details: one row per model file with its state and sizes, the
 * device and precision, whether the files are saved on this device, storage
 * and memory as the browser reports them, how long each stage took, the last
 * error, and the app version. Shown inside the setup card's Details
 * disclosure while setup runs, and in a dialog from the status badge after.
 *
 * Copy details produces the same facts as plain text. It can never contain
 * anything the person typed: only file names, sizes, timings, device facts
 * and library error messages.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEngineContext } from "@/hooks/use-engine";
import { toast } from "@/hooks/use-toast";
import {
  APP_VERSION,
  activeModel,
  fileLabel,
  fileSortCompare,
  serializeEngineFacts,
  type EngineFacts,
} from "@/lib/engine-details";
import { WORKER_BUILD_ID } from "@/generated/worker-build";
import { copy } from "@/lib/copy";
import { durationShort, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="type-small shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("type-small min-w-0 text-end", mono && "tabular-nums")}>{value}</span>
    </div>
  );
}

function fileStateText(state: string): string {
  switch (state) {
    case "waiting":
      return copy.details.stateWaiting;
    case "downloading":
      return copy.details.stateDownloading;
    case "saved":
      return copy.details.stateSaved;
    case "from-cache":
      return copy.details.stateFromCache;
    default:
      return state;
  }
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "checking":
      return copy.status.stageChecking;
    case "downloading":
      return copy.status.stageDownloading;
    case "initializing":
      return copy.status.stageInitializing;
    case "testing":
      return copy.status.stageTesting;
    case "ready":
      return copy.status.ready;
    default:
      return stage;
  }
}

function EngineDetailsInner() {
  const engine = useEngineContext();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  // The storage numbers while the details are on screen. Never during render.
  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (!cancelled && estimate && typeof estimate.usage === "number" && typeof estimate.quota === "number") {
          setStorage({ usage: estimate.usage, quota: estimate.quota });
        } else if (!cancelled) {
          setStorage(null);
        }
      } catch {
        if (!cancelled) setStorage(null);
      }
    };
    void read();
    const timer = setInterval(read, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const model = activeModel();
  const savedOnDevice = engine.modelPresent || engine.files.some((f) => f.state === "saved" || f.state === "from-cache");

  const facts: EngineFacts = useMemo(
    () => ({
      model: model.id,
      debug: model.debug,
      device: engine.device,
      dtype: engine.dtype,
      fellBack: engine.fellBack,
      warmupMs: engine.warmupMs,
      files: engine.files,
      filesSavedOnDevice: savedOnDevice,
      stages: engine.stages,
      lastError: engine.error ? { code: engine.error.code, message: engine.error.message } : null,
      storage,
      memory: engine.memory,
      translatingNow: engine.status === "ready",
    }),
    [model, engine.device, engine.dtype, engine.fellBack, engine.warmupMs, engine.files, savedOnDevice, engine.stages, engine.error, storage, engine.memory, engine.status],
  );

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serializeEngineFacts(facts));
      toast({ description: copy.details.copied });
    } catch {
      toast({ description: copy.details.copyFailed });
    }
  }, [facts]);

  const sortedFiles = useMemo(() => [...engine.files].sort(fileSortCompare), [engine.files]);

  return (
    <div className="w-full">
      {engine.fellBack ? (
        <p className="type-small mb-2 text-accent-green-text">{copy.setup.fellBack}</p>
      ) : null}

      {/* One row per file, with stable positions and tabular numerals. */}
      <p className="type-small font-medium text-muted-foreground">{copy.details.filesHeading}</p>
      <ul className="mt-1.5 space-y-0.5">
        {sortedFiles.length === 0 ? (
          <li className="type-small py-1 text-muted-foreground">{copy.details.stateWaiting}</li>
        ) : (
          sortedFiles.map((row) => (
            <li key={row.file} className="flex min-h-8 items-baseline justify-between gap-3 py-1">
              <span className="type-small min-w-0">
                {fileLabel(row.file)}
                <span className="sr-only"> ({row.file})</span>
                <span aria-hidden className="ml-1.5 hidden text-[0.6875rem] text-muted-foreground/80 sm:inline">
                  {row.file.split("/").pop()}
                </span>
              </span>
              <span className="type-small shrink-0 text-end tabular-nums">
                {fileStateText(row.state)}
                {row.total > 0 ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {row.state === "downloading" ? `${(row.loaded / (1024 * 1024)).toFixed(1)} of ` : ""}
                    {row.total >= 100 * 1024 * 1024
                      ? `${Math.round(row.total / (1024 * 1024))} MB`
                      : `${(row.total / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                ) : null}
              </span>
            </li>
          ))
        )}
      </ul>

      <div className="mt-3 border-t pt-2">
        <Row
          label={copy.details.device}
          value={
            engine.device === "webgpu"
              ? copy.details.deviceWebgpu
              : engine.device === "wasm"
                ? copy.details.deviceWasm
                : copy.details.none
          }
        />
        <Row label={copy.details.precision} value={engine.dtype ?? copy.details.none} mono />
        <Row label={copy.details.savedOnDevice} value={savedOnDevice ? copy.details.savedYes : copy.details.savedNo} />
        {engine.warmupMs != null ? <Row label={copy.details.warmup} value={durationShort(engine.warmupMs)} mono /> : null}
        {storage ? (
          <Row
            label={copy.details.storageUsed}
            value={`${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`}
            mono
          />
        ) : null}
        {engine.memory && (engine.memory.used != null || engine.memory.limit != null) ? (
          <Row
            label={copy.details.memoryReported}
            value={`${engine.memory.used != null ? formatBytes(engine.memory.used) : "—"} of ${
              engine.memory.limit != null ? formatBytes(engine.memory.limit) : "—"
            }`}
            mono
          />
        ) : null}
      </div>

      <div className="mt-2 border-t pt-2">
        <p className="type-small font-medium text-muted-foreground">{copy.details.stagesHeading}</p>
        {engine.stages.length === 0 ? (
          <p className="type-small py-1.5 text-muted-foreground">{copy.details.none}</p>
        ) : (
          engine.stages.map((s) => (
            <Row key={s.stage} label={stageLabel(s.stage)} value={durationShort(s.ms)} mono />
          ))
        )}
      </div>

      <div className="mt-2 border-t pt-2">
        <Row
          label={copy.details.lastError}
          value={
            engine.error ? (
              <span className="text-danger">
                {engine.error.workerDied ? copy.setup.workerDied : engine.error.message}
              </span>
            ) : (
              copy.details.none
            )
          }
        />
        <Row label={copy.details.appVersion} value={`${APP_VERSION} (${WORKER_BUILD_ID.slice(0, 6)})`} mono />
      </div>

      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => void onCopy()} className="type-small">
          <Copy aria-hidden className="size-3.5" />
          {copy.details.copyButton}
        </Button>
      </div>
    </div>
  );
}

export const EngineDetails = memo(EngineDetailsInner);

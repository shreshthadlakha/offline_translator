"use client";

/**
 * The Details panel. A quiet, collapsible block under the tool that says
 * what the engine is doing and how fast it is: the engine in use and its
 * licence, the device, per file progress, storage, stage times, the last
 * error, the app version, the last ten translations (counts and durations
 * only), and a speed test on five built in sentences.
 *
 * Privacy: nothing shown or copied here ever includes anything the person
 * typed or translated. Only counts, times, sizes and statuses.
 */

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy as CopyIcon, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslatorState } from "@/components/translate/translator-provider";
import { directionQuality } from "@/lib/quality";
import { toast } from "@/hooks/use-toast";
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage";
import { getTimings, medianQueueMs, medianTranslateMs, subscribeTimings } from "@/lib/speed-metrics";
import { clockMs, secondsPrecise, mbWhole, formatBytes } from "@/lib/format";
import { APP_VERSION, copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** Five built in sentences. Never anything typed. */
const SPEED_TEST_SENTENCES = [
  "Good morning.",
  "The train leaves at ten past noon.",
  "Could you help me carry this upstairs?",
  "I would like to book a table for two tonight.",
  "The children were playing in the garden while their grandmother watched from the window.",
] as const;

/** Plain labels for the files the engines download. */
const FILE_LABELS: Record<string, string> = {
  "encoder_model_quantized.onnx": "Encoder",
  "encoder_model.onnx": "Encoder",
  "decoder_model_merged_quantized.onnx": "Decoder",
  "decoder_model_merged.onnx": "Decoder",
  "tokenizer.json": "Tokenizer",
  "vocab.json": "Vocabulary",
  "source.spm": "Vocabulary",
  "target.spm": "Vocabulary",
  "merges.txt": "Vocabulary",
};

function fileLabel(name: string): string {
  if (FILE_LABELS[name]) return FILE_LABELS[name] ?? name;
  // Bergamot: the int8 Marian model, the lexical shortlist, the SentencePiece
  // vocabularies, and the self hosted wasm runtime files.
  if (name.includes("intgemm.alphas.bin")) return "Model";
  if (name.startsWith("lex.")) return "Word shortlist";
  if (name.endsWith(".spm") || name.startsWith("srcvocab.") || name.startsWith("trgvocab.")) return "Vocabulary";
  if (name === "bergamot-translator-worker.js") return "Runtime";
  if (name === "bergamot-translator-worker.wasm") return "Runtime";
  if (name.endsWith(".json")) return "Configuration";
  return name;
}

function fileStatusText(row: { status: "waiting" | "downloading" | "done"; fromCache: boolean }): string {
  if (row.status === "waiting") return copy.details.fileStatusWaiting;
  if (row.status === "downloading") return copy.details.fileStatusDownloading;
  return row.fromCache ? copy.details.fileStatusFromCache : copy.details.fileStatusSaved;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="type-small shrink-0 text-muted-foreground">{label}</dt>
      <dd className="type-small min-w-0 text-end tabular-nums">{value}</dd>
    </div>
  );
}

function DetailsPanelInner() {
  const { engine, srcCode, tgtCode, srcLang } = useTranslatorState();
  const timings = useSyncExternalStore(subscribeTimings, getTimings, getTimings);
  const { status, device, engineInfo, desiredEngine, fileRows, stageTimings, heap, lastSwitchMs, notes } = engine;

  // The measured quality of this pair's route: the tier, and for developers
  // the chrF++ distance to the published full-model score.
  const quality = directionQuality(srcCode, tgtCode);
  const absGap = quality?.gap != null ? Math.abs(quality.gap).toFixed(1) : null;
  const qualityLine =
    desiredEngine?.kind === "nllb"
      ? copy.details.qualityFull
      : quality == null
        ? copy.details.qualityUnmeasured
        : quality.tier === "best"
          ? quality.gap != null && quality.gap > 0
            ? copy.details.qualityBestAbove(quality.gap.toFixed(1))
            : copy.details.qualityBest(absGap ?? "0.0")
          : quality.tier === "good"
            ? copy.details.qualityGood(absGap ?? "0.0")
            : quality.tier === "limited"
              ? copy.details.qualityLimited(absGap ?? "0.0")
              : copy.details.qualityUnmeasured;
  const lastError = engine.lastError;

  const [open, setOpen] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [speedTest, setSpeedTest] = useState<{ running: boolean; result: string | null; failed: boolean }>({
    running: false,
    result: null,
    failed: false,
  });
  const speedTestUnsubscribeRef = useRef<(() => void) | null>(null);

  // A ticking clock for the stage that is running right now, so Details
  // shows which stage it is and for how long. One tick per second, only
  // while the panel is open and a stage is active.
  const [, nowTick] = useState(0);
  const stageStartRef = useRef<number | null>(null);
  useEffect(() => {
    const active = status === "checking" || status === "downloading" || status === "initializing" || status === "testing";
    if (!open || !active) {
      stageStartRef.current = null;
      return;
    }
    stageStartRef.current = performance.now();
    const timer = setInterval(() => nowTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [open, status]);
  const stageClock = stageStartRef.current != null ? performance.now() - stageStartRef.current : 0;
  const stageName =
    status === "checking"
      ? copy.setup.stageChecking
      : status === "downloading"
        ? copy.setup.stageDownloading
        : status === "initializing"
          ? copy.setup.stageInitializing
          : status === "testing"
            ? copy.setup.stageTesting
            : null;

  // Remembered between visits. Read after hydration (not in the state
  // initializer) so the first client render matches the server and no
  // hydration warning fires for people who left it open.
  useEffect(() => {
    setOpen(storageGet(STORAGE_KEYS.detailsOpen) === "1");
  }, []);
  const onToggle = useCallback(() => {
    setOpen((prev) => {
      storageSet(STORAGE_KEYS.detailsOpen, prev ? "0" : "1");
      return !prev;
    });
  }, []);

  // Storage figures, read while open. Never during render.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const read = async () => {
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (!cancelled && estimate && typeof estimate.usage === "number" && typeof estimate.quota === "number") {
          setStorage({ usage: estimate.usage, quota: estimate.quota });
        }
      } catch {
        // Storage figures are optional here.
      }
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, [open, status]);

  // Clean up a speed test subscription on unmount.
  useEffect(() => {
    return () => {
      speedTestUnsubscribeRef.current?.();
    };
  }, []);

  const canRunSpeedTest = srcLang?.code === "eng_Latn" && status === "ready" && !speedTest.running;

  const runSpeedTest = useCallback(() => {
    if (!canRunSpeedTest) return;
    setSpeedTest({ running: true, result: null, failed: false });
    const ids = SPEED_TEST_SENTENCES.map((_, index) => `speed-${Date.now().toString(36)}-${index}`);
    const results = new Map<string, { queueMs: number; translateMs: number }>();
    let failures = 0;

    speedTestUnsubscribeRef.current?.();
    speedTestUnsubscribeRef.current = engine.subscribe((message) => {
      if (message.type === "result" && ids.includes(message.id)) {
        results.set(message.id, { queueMs: message.queueMs ?? 0, translateMs: message.ms });
      } else if (message.type === "error" && message.id != null && ids.includes(message.id)) {
        failures += 1;
      } else {
        return;
      }
      if (results.size + failures < ids.length) return;
      speedTestUnsubscribeRef.current?.();
      speedTestUnsubscribeRef.current = null;
      if (results.size === 0) {
        setSpeedTest({ running: false, result: null, failed: true });
        return;
      }
      const translateMedian = median([...results.values()].map((t) => t.translateMs));
      const queueMedian = median([...results.values()].map((t) => t.queueMs));
      setSpeedTest({
        running: false,
        failed: failures > 0,
        result: copy.details.speedTestResult(
          secondsPrecise(translateMedian ?? 0),
          secondsPrecise(queueMedian ?? 0),
        ),
      });
    });

    ids.forEach((id, index) => {
      engine.translate(id, SPEED_TEST_SENTENCES[index] ?? "", srcCode, tgtCode, "manual");
    });
  }, [canRunSpeedTest, engine, srcCode, tgtCode]);

  // The text that Copy details puts on the clipboard. Counts, times, sizes
  // and statuses only. Nothing typed, nothing translated.
  const buildDetailsText = useCallback(() => {
    const lines: string[] = [];
    const engineShown = engineInfo ?? desiredEngine;
    lines.push(`App version: ${APP_VERSION}`);
    if (engineShown) {
      lines.push(`Engine: ${engineShown.name} (${engineShown.modelId})`);
      lines.push(`Size: about ${mbWhole(engineShown.expectedBytes)} MB`);
      lines.push(`Licence: ${engineShown.license} (${engineShown.attribution})`);
    }
    const deviceText = device === "webgpu" ? copy.details.deviceWebgpu : device === "wasm" ? copy.details.deviceWasm : "—";
    lines.push(`Device: ${deviceText}`);
    lines.push(`Precision: ${copy.details.precisionValue}`);
    if (status !== "ready") lines.push(`Engine state: ${status}`);
    if (fileRows.length > 0) {
      lines.push("Files:");
      for (const row of fileRows) {
        const sizeText = row.total > 0 ? ` ${mbWhole(row.loaded)} of ${mbWhole(row.total)} MB` : "";
        lines.push(`  ${fileLabel(row.file)} (${row.file}): ${fileStatusText(row)}${sizeText}`);
      }
    }
    if (storage) lines.push(`Storage: ${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`);
    if (heap.used != null) lines.push(`Reported memory: ${formatBytes(heap.used)} used of ${formatBytes(heap.limit ?? 0)}`);
    const stageLines = [
      stageTimings.checkingMs != null ? `checking ${secondsPrecise(stageTimings.checkingMs)}` : null,
      stageTimings.downloadingMs != null ? `downloading ${secondsPrecise(stageTimings.downloadingMs)}` : null,
      stageTimings.initializingMs != null ? `reading into memory ${secondsPrecise(stageTimings.initializingMs)}` : null,
      stageTimings.testingMs != null ? `checking translation works ${secondsPrecise(stageTimings.testingMs)}` : null,
    ].filter((line): line is string => line != null);
    if (stageLines.length > 0) lines.push(`Stage times: ${stageLines.join(", ")}`);
    if (stageName && stageClock > 0) lines.push(copy.details.nowLine(stageName, clockMs(stageClock)));
    if (stageTimings.initializingMs != null && engine.sessionOptLevel) {
      lines.push(copy.details.graphOptLine(engine.sessionOptLevel, secondsPrecise(stageTimings.initializingMs)));
    }
    if (lastSwitchMs != null) lines.push(copy.details.switchTime(secondsPrecise(lastSwitchMs)));
    if (notes.storageDisabled) lines.push("Storage: switched off in this window");
    if (lastError) lines.push(`Last error: ${lastError.code} ${lastError.message}`);
    const medianTranslate = medianTranslateMs();
    const medianQueue = medianQueueMs();
    if (timings.length > 0) {
      lines.push("Recent translations:");
      for (const timing of timings) {
        lines.push(
          `  ${copy.details.recentLine(timing.chars, secondsPrecise(timing.queueMs), secondsPrecise(timing.translateMs))}`,
        );
      }
      if (medianTranslate != null) lines.push(copy.details.medianLine(secondsPrecise(medianTranslate)));
      if (medianQueue != null) lines.push(`Median queue wait: ${secondsPrecise(medianQueue)} s`);
    } else {
      lines.push(copy.details.noTranslationsYet);
    }
    if (speedTest.result) lines.push(speedTest.result);
    return lines.join("\n");
  }, [engineInfo, desiredEngine, device, status, fileRows, storage, heap, stageTimings, lastSwitchMs, notes.storageDisabled, lastError, timings, speedTest.result, stageName, stageClock, engine.sessionOptLevel]);

  const onCopyDetails = useCallback(async () => {
    const text = buildDetailsText();
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: copy.details.copied });
    } catch {
      toast({ description: copy.details.copyFailed });
    }
  }, [buildDetailsText]);

  const engineShown = engineInfo ?? desiredEngine;
  const medianTranslate = medianTranslateMs();

  return (
    <div className="border-t px-4 py-2 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="engine-details"
          className="type-small -mx-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          <Chevron open={open} />
          {copy.details.title}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onCopyDetails()}
          className="type-small h-8 text-muted-foreground"
        >
          <CopyIcon aria-hidden className="size-3.5" />
          {copy.details.copyDetails}
        </Button>
      </div>

      {open ? (
        <div id="engine-details" className="scroll-surface max-h-96 overflow-y-auto pb-3">
          <p className="type-small text-muted-foreground">{copy.details.summary}</p>

          {engineShown ? (
            <dl className="mt-2">
              <Row label={copy.details.engine} value={engineShown.name} />
              <Row label={copy.details.modelId} value={<span className="break-all">{engineShown.modelId}</span>} />
              <Row label={copy.details.precision} value={`${copy.details.precisionValue}, about ${mbWhole(engineShown.expectedBytes)} MB`} />
              <Row label={copy.details.license} value={`${engineShown.license} · ${engineShown.attribution}`} />
              <Row label={copy.details.quality} value={qualityLine} />
              <Row label={copy.details.device} value={device === "webgpu" ? copy.details.deviceWebgpu : device === "wasm" ? copy.details.deviceWasm : "—"} />
            </dl>
          ) : null}

          {fileRows.length > 0 ? (
            <section className="mt-3" aria-label={copy.details.files}>
              <h3 className="type-small font-medium text-muted-foreground">{copy.details.files}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {fileRows.map((row) => (
                  <li key={row.file} className="flex items-baseline justify-between gap-3">
                    <span className="type-small min-w-0">
                      {fileLabel(row.file)}
                      <span className="block truncate text-[0.6875rem] leading-tight text-muted-foreground/80">{row.file}</span>
                    </span>
                    <span className="type-small shrink-0 text-end text-muted-foreground tabular-nums">
                      {fileStatusText(row)}
                      {row.status === "downloading" && row.total > 0 ? (
                        <span className="block">
                          {mbWhole(row.loaded)} of {mbWhole(row.total)} MB
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <dl className="mt-3">
            {storage ? (
              <Row label={copy.details.storage} value={copy.details.storageLine(formatBytes(storage.usage), formatBytes(storage.quota))} />
            ) : null}
            {heap.used != null ? (
              <Row label={copy.details.memory} value={`${formatBytes(heap.used)} of ${formatBytes(heap.limit ?? 0)}`} />
            ) : null}
            {stageTimings.checkingMs != null ? (
              <Row label={copy.details.timings} value={copy.details.timingLine("checking", secondsPrecise(stageTimings.checkingMs))} />
            ) : null}
            {stageTimings.downloadingMs != null ? (
              <Row label="" value={copy.details.timingLine("downloading", secondsPrecise(stageTimings.downloadingMs))} />
            ) : null}
            {stageTimings.initializingMs != null ? (
              <Row label="" value={copy.details.timingLine("into memory", secondsPrecise(stageTimings.initializingMs))} />
            ) : null}
            {stageTimings.testingMs != null ? (
              <Row label="" value={copy.details.timingLine("check", secondsPrecise(stageTimings.testingMs))} />
            ) : null}
            {stageName && stageClock > 0 ? (
              <Row label="" value={copy.details.nowLine(stageName, clockMs(stageClock))} />
            ) : null}
            {stageTimings.initializingMs != null && engine.sessionOptLevel ? (
              <Row label="" value={copy.details.graphOptLine(engine.sessionOptLevel, secondsPrecise(stageTimings.initializingMs))} />
            ) : null}
            {lastSwitchMs != null ? <Row label="" value={copy.details.switchTime(secondsPrecise(lastSwitchMs))} /> : null}
            {lastError ? <Row label={copy.details.lastError} value={`${lastError.code}: ${lastError.message}`} /> : null}
            <Row label={copy.details.version} value={APP_VERSION} />
          </dl>

          <section className="mt-3" aria-label={copy.details.recentTranslations}>
            <h3 className="type-small font-medium text-muted-foreground">{copy.details.recentTranslations}</h3>
            {timings.length === 0 ? (
              <p className="type-small mt-1 text-muted-foreground">{copy.details.noTranslationsYet}</p>
            ) : (
              <>
                <ul className="mt-1.5 space-y-1">
                  {timings.map((timing) => (
                    <li key={timing.at} className="type-small text-muted-foreground tabular-nums">
                      {copy.details.recentLine(timing.chars, secondsPrecise(timing.queueMs), secondsPrecise(timing.translateMs))}
                    </li>
                  ))}
                </ul>
                {medianTranslate != null ? (
                  <p className="type-small mt-1.5 text-muted-foreground tabular-nums">
                    {copy.details.medianLine(secondsPrecise(medianTranslate))}
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="mt-3" aria-label={copy.details.speedTest}>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={runSpeedTest} disabled={!canRunSpeedTest} className="type-small">
                <Gauge aria-hidden className="size-3.5" />
                {speedTest.running ? copy.details.speedTestRunning : copy.details.speedTest}
              </Button>
            </div>
            {srcLang?.code !== "eng_Latn" ? (
              <p className="type-small mt-1.5 text-muted-foreground">{copy.details.speedTestUnavailable}</p>
            ) : null}
            {speedTest.result ? (
              <p className="type-small mt-1.5 tabular-nums">{speedTest.result}</p>
            ) : null}
            {speedTest.failed && !speedTest.result ? (
              <p className="type-small mt-1.5 text-danger">{copy.translate.sentenceFailed}</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
      fill="none"
    >
      <path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const DetailsPanel = memo(DetailsPanelInner);

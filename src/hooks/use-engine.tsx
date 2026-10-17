"use client";

/**
 * The engine: one translation worker, shared by the translate view and batch
 * mode. Owns setup state, the single aggregated progress value, the message
 * protocol, and the engine switching for fast pairs.
 *
 * The state machine runs idle, checking (storage and lock prechecks), the
 * worker's own stages (downloading, reading into memory, checking that
 * translation works), ready, and error. Requests that arrive before the
 * engine is ready are held and sent the moment it is, so nothing typed during
 * setup is lost.
 *
 * Protection against silent failure: a version handshake with the worker, a
 * heartbeat with a death watch, a crash flag that survives reloads, one tab
 * at a time through Web Locks, and a storage quota check before every
 * download.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PROTOCOL_VERSION, type EngineDevice, type EngineErrorCode, type EngineSpec, type GraphOptimizationLevel, type Priority, type WorkerToMain } from "@/workers/protocol";
import { BUILD_ID } from "@/workers/build-id";
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from "@/lib/storage";
import { netlog } from "@/lib/netlog";
import { engineForPair, fullModelPairHidden, type PairEngine } from "@/lib/engines";
import { directionQuality } from "@/lib/quality";
import { cachedModelFiles, modelFilesCached } from "@/lib/model-cache";
import { recordTiming } from "@/lib/speed-metrics";
import { useSettings } from "@/hooks/use-settings";
import { SPEED_CONFIG } from "@/lib/speed-config";
import { languageByCode } from "@/lib/languages";

export type EngineStatus = "idle" | "checking" | "downloading" | "initializing" | "testing" | "ready" | "error";

export type EngineError = {
  code: EngineErrorCode;
  message: string;
  /** For quota errors: what the window can store, and what the model needs. */
  quota?: number;
  needed?: number;
};

export type EngineProgress = {
  loaded: number;
  total: number;
  /** Fraction of 0 to 1, never allowed to go backwards. */
  fraction: number;
  /** Transfer speed in bytes per second, measured over recent samples. */
  bps: number;
  /** Estimated time left in ms, when a speed is measurable. */
  etaMs: number | null;
  /** Time since the download stage began. */
  elapsedMs: number;
};

export type FileRow = {
  file: string;
  status: "waiting" | "downloading" | "done";
  loaded: number;
  total: number;
  /** True when this file was already saved on this device before this load. */
  fromCache: boolean;
};

export type StageTimings = {
  checkingMs?: number;
  downloadingMs?: number;
  initializingMs?: number;
  testingMs?: number;
};

export type EngineNotes = {
  /** The device reports little memory. A note, not a block. */
  memoryWarning: boolean;
  /** The reported memory in GB, when the browser says. */
  memoryGB: number | null;
  /** Storage is unavailable, so nothing can be saved for next time. */
  storageDisabled: boolean;
  /** WebGPU was wanted and the engine fell back to WebAssembly. */
  webgpuFellBack: boolean;
};

/** The session optimization level, read once from the URL flag
 * ?ptSessionOpt=disabled|basic|all; null when the person did not set one.
 * Shown in Details with the session creation time, so the levels can be
 * compared on a real device. */
function readSessionOptLevel(): GraphOptimizationLevel | null {
  try {
    const value = new URLSearchParams(window.location.search).get("ptSessionOpt");
    if (value === "disabled" || value === "basic" || value === "all") return value;
  } catch {
    // Not a browser context, or no URL to read.
  }
  return null;
}

type Listener = (message: WorkerToMain) => void;

const LOCK_NAME = "pt-engine";

/** Bytes per second over the last few seconds of progress samples. */
function measureBps(samples: { at: number; loaded: number }[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const seconds = (last.at - first.at) / 1000;
  if (seconds <= 0.3) return 0;
  return Math.max(0, (last.loaded - first.loaded) / seconds);
}

/** A gate the provider can close: called before any full model load begins
 * (first start, switch, or restart) with the model not saved on this device.
 * Resolves true to proceed, false to give up without touching anything. */
export type HeavyGate = (engine: PairEngine, pair: { src: string; tgt: string }) => Promise<boolean>;

/** The worker spec for a pair engine: identity, the group tag, the
 * IndicTrans2 bundle, and the route's measured quality tier (drives the
 * honest notice and the punctuation policy on limited routes). */
function specFor(engine: PairEngine, srcCode: string, tgtCode: string): EngineSpec {
  const quality = directionQuality(srcCode, tgtCode);
  const tier = quality?.tier === "best" || quality?.tier === "good" || quality?.tier === "limited" ? quality.tier : undefined;
  return { id: engine.id, kind: engine.kind, modelId: engine.modelId, langTag: engine.tag, bundle: engine.bundle, tier };
}

export function useEngine(heavyGate?: HeavyGate) {
  const { settings, loaded: settingsLoaded } = useSettings();

  // The gate is consulted through a ref so a new callback identity never
  // recreates the load path. A gate can also be attached later, from a
  // provider below this one, through setHeavyGate.
  const heavyGateRef = useRef<HeavyGate | undefined>(heavyGate);
  if (heavyGate) heavyGateRef.current = heavyGate;
  const setHeavyGate = useCallback((gate: HeavyGate | null) => {
    heavyGateRef.current = gate ?? undefined;
  }, []);

  const [status, setStatus] = useState<EngineStatus>("idle");
  const [device, setDevice] = useState<EngineDevice | null>(null);
  const [error, setError] = useState<EngineError | null>(null);
  const [progress, setProgress] = useState<EngineProgress>({ loaded: 0, total: 0, fraction: 0, bps: 0, etaMs: null, elapsedMs: 0 });
  const [readyTick, setReadyTick] = useState(0);
  /** True when this load began on its own from files already saved here. */
  const [autoStarted, setAutoStarted] = useState(false);
  /** True when the selected pair's engine model is saved on this device. */
  const [modelPresent, setModelPresent] = useState(false);
  /** The engine currently loaded or being loaded. */
  const [engineInfo, setEngineInfo] = useState<PairEngine | null>(null);
  /** True while a loaded engine is being swapped for a different one. */
  const [switching, setSwitching] = useState(false);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [stageTimings, setStageTimings] = useState<StageTimings>({});
  const [notes, setNotes] = useState<EngineNotes>({ memoryWarning: false, memoryGB: null, storageDisabled: false, webgpuFellBack: false });
  const [crashNotice, setCrashNotice] = useState<string | null>(null);
  /** Seconds since data last arrived, while downloading. */
  const [stallSeconds, setStallSeconds] = useState<number | null>(null);
  const [heap, setHeap] = useState<{ used: number | null; limit: number | null }>({ used: null, limit: null });
  const [lastSwitchMs, setLastSwitchMs] = useState<number | null>(null);
  /** The session optimization level for this visit, from the URL flag. */
  const [sessionOptLevel] = useState<GraphOptimizationLevel | null>(() => readSessionOptLevel());

  const workerRef = useRef<Worker | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const fractionRef = useRef(0);
  const wasReadyBeforeRef = useRef(false);
  const statusRef = useRef<EngineStatus>("idle");
  const activeSpecRef = useRef<EngineSpec | null>(null);
  const heldQueueRef = useRef<{ id: string; message: Record<string, unknown> }[]>([]);
  const preExistingFilesRef = useRef<Set<string>>(new Set());
  const stageStartRef = useRef<{ checking?: number; downloading?: number; initializing?: number; testing?: number }>({});
  const progressSamplesRef = useRef<{ at: number; loaded: number }[]>([]);
  const downloadStartRef = useRef<number | null>(null);
  const lastProgressAtRef = useRef<number | null>(null);
  const lastPongRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const helloTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockReleaseRef = useRef<(() => void) | null>(null);
  const desiredRef = useRef<PairEngine | null>(null);
  const switchStartRef = useRef<number | null>(null);
  const lastErrorRef = useRef<EngineError | null>(null);
  const fileRowOrderRef = useRef<string[]>([]);
  /** When each translate request was actually posted to the worker, by id.
   * The queue wait is measured from here: the worker's own view of the wait
   * is blind, because wasm inference blocks its message loop and requests
   * are often delivered only when they start running. */
  const sentAtRef = useRef(new Map<string, number>());
  /** Inference blocks the worker's message loop, so pongs cannot arrive
   * while a translation runs. A posted translate grants a grace window in
   * which silence does not count as death; the result itself proves life. */
  const busyUntilRef = useRef(0);

  const setStatusSafe = useCallback((next: EngineStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // The pair and the engine it needs, from the stored settings. The first
  // render matches the server; the stored pair arrives right after hydration.
  const srcCode = languageByCode(settings.lastSrc)?.code ?? "eng_Latn";
  const tgtCode = languageByCode(settings.lastTgt)?.code ?? "fra_Latn";
  const desired = useMemo(
    () => engineForPair(srcCode, tgtCode, settings.useFastModels && !settings.fullModelFor.includes(`${srcCode}|${tgtCode}`)),
    [srcCode, tgtCode, settings.useFastModels, settings.fullModelFor],
  );
  desiredRef.current = desired;

  // The experimental gate: this pair's only model is the full one and the
  // "Show experimental languages" switch is off (the default). Explicit asks
  // (fast models off, or the per-pair "use the full model" override) are not
  // the default list and stay offered with the heavy warning.
  const experimentalHidden = useMemo(
    () => fullModelPairHidden(srcCode, tgtCode, settings.useFastModels, settings.fullModelFor, settings.showExperimentalLanguages),
    [srcCode, tgtCode, settings.useFastModels, settings.fullModelFor, settings.showExperimentalLanguages],
  );
  const experimentalHiddenRef = useRef(false);
  experimentalHiddenRef.current = experimentalHidden;
  /** True while the current pair is hidden behind the experimental switch:
   * the setup card shows the plain notice instead of an offer, and no load
   * can start. */
  const experimentalPairHidden = experimentalHidden;

  const post = useCallback((message: Record<string, unknown>) => {
    workerRef.current?.postMessage(message);
  }, []);

  const releaseLock = useCallback(() => {
    lockReleaseRef.current?.();
    lockReleaseRef.current = null;
  }, []);

  const stopTimers = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (helloTimeoutRef.current !== null) {
      clearTimeout(helloTimeoutRef.current);
      helloTimeoutRef.current = null;
    }
  }, []);

  const terminate = useCallback(() => {
    stopTimers();
    releaseLock();
    workerRef.current?.terminate();
    workerRef.current = null;
    activeSpecRef.current = null;
    heldQueueRef.current = [];
    // Requests posted to the old worker can never come back.
    sentAtRef.current.clear();
    busyUntilRef.current = 0;
    netlog.setEngineReady(false);
  }, [stopTimers, releaseLock]);

  // --- stage bookkeeping ---------------------------------------------------------

  const finishStage = useCallback((stage: "checking" | "downloading" | "initializing" | "testing") => {
    const start = stageStartRef.current[stage];
    if (start == null) return;
    const ms = performance.now() - start;
    stageStartRef.current[stage] = undefined;
    setStageTimings((prev) => ({ ...prev, [`${stage}Ms`]: Math.round(ms) }));
  }, []);

  const onStage = useCallback(
    (stage: "downloading" | "initializing" | "testing") => {
      if (stage === "downloading" && stageStartRef.current.downloading == null) {
        finishStage("checking");
        stageStartRef.current.downloading = performance.now();
        if (downloadStartRef.current == null) downloadStartRef.current = performance.now();
        lastProgressAtRef.current = performance.now();
        setStatusSafe("downloading");
        // Watch for a stalled download: no bytes for 15 seconds gets an
        // honest note, not a silent bar.
        if (stallTimerRef.current === null) {
          stallTimerRef.current = setInterval(() => {
            const last = lastProgressAtRef.current;
            if (statusRef.current !== "downloading" || last == null) {
              setStallSeconds(null);
              return;
            }
            const stalledFor = performance.now() - last;
            setStallSeconds(stalledFor > SPEED_CONFIG.downloadStallMs ? Math.floor(stalledFor / 1000) : null);
          }, 1000);
        }
      } else if (stage === "initializing" && stageStartRef.current.initializing == null) {
        finishStage("downloading");
        stageStartRef.current.initializing = performance.now();
        setStatusSafe("initializing");
        setStallSeconds(null);
        if (stallTimerRef.current !== null) {
          clearInterval(stallTimerRef.current);
          stallTimerRef.current = null;
        }
      } else if (stage === "testing" && stageStartRef.current.testing == null) {
        finishStage("initializing");
        stageStartRef.current.testing = performance.now();
        setStatusSafe("testing");
      }
    },
    [finishStage, setStatusSafe],
  );

  // --- worker messages ---------------------------------------------------------------

  const handleWorkerMessage = useCallback(
    (message: WorkerToMain) => {
      // Any message at all proves the worker is alive: pongs, but also
      // results, progress and stats, which arrive between translations when
      // the event loop is briefly free.
      lastPongRef.current = performance.now();
      switch (message.type) {
        case "hello": {
          if (helloTimeoutRef.current !== null) {
            clearTimeout(helloTimeoutRef.current);
            helloTimeoutRef.current = null;
          }
          if (message.protocolVersion !== PROTOCOL_VERSION || message.buildId !== BUILD_ID) {
            // The app files on this device don't match each other. Say so,
            // instead of failing in a way that looks like anything else.
            terminate();
            setStatusSafe("error");
            const err = { code: "stale-code" as EngineErrorCode, message: "version handshake failed" };
            setError(err);
            lastErrorRef.current = err;
          }
          break;
        }
        case "stage": {
          onStage(message.stage);
          break;
        }
        case "progress": {
          const now = performance.now();
          lastProgressAtRef.current = now;
          const fraction = message.total > 0 ? Math.min(1, message.loaded / message.total) : 0;
          // The displayed value never goes backwards, even when the known
          // total grows as more files start downloading.
          fractionRef.current = Math.max(fractionRef.current, fraction);
          const samples = progressSamplesRef.current;
          samples.push({ at: now, loaded: message.loaded });
          while (samples.length > 2 && now - (samples[0]?.at ?? now) > 6000) samples.shift();
          const bps = measureBps(samples);
          const remaining = message.total > message.loaded ? message.total - message.loaded : 0;
          const downloadStart = downloadStartRef.current ?? now;
          setProgress({
            loaded: message.loaded,
            total: message.total,
            fraction: fractionRef.current,
            bps,
            etaMs: bps > 0 && remaining > 0 ? (remaining / bps) * 1000 : null,
            elapsedMs: now - downloadStart,
          });
          break;
        }
        case "file": {
          const fromCache = preExistingFilesRef.current.has(message.file);
          setFileRows((prev) => {
            const index = fileRowOrderRef.current.indexOf(message.file);
            if (index === -1) {
              fileRowOrderRef.current.push(message.file);
              return [
                ...prev,
                { file: message.file, status: message.status, loaded: message.loaded, total: message.total, fromCache },
              ];
            }
            const next = [...prev];
            next[index] = {
              file: message.file,
              status: message.status,
              loaded: message.loaded,
              total: message.total,
              fromCache: fromCache || (next[index]?.fromCache ?? false),
            };
            return next;
          });
          break;
        }
        case "ready": {
          // Setup finished. Clear the crash flag and remember that setup has
          // been completed once, for the compact hero on return visits.
          storageRemove(STORAGE_KEYS.setupCrash);
          setCrashNotice(null);
          if (!wasReadyBeforeRef.current) storageSet(STORAGE_KEYS.modelReady, "1");
          wasReadyBeforeRef.current = true;
          finishStage("testing");
          if (switchStartRef.current != null) {
            setLastSwitchMs(Math.round(performance.now() - switchStartRef.current));
            switchStartRef.current = null;
          }
          setSwitching(false);
          setDevice(message.device);
          setEngineInfo(desiredRef.current);
          setError(null);
          setStatusSafe("ready");
          setReadyTick((t) => t + 1);
          netlog.setEngineReady(true);
          // Requests that arrived while setup ran are sent now, in order.
          // The wait is counted from this moment, not from when they were
          // first typed: waiting for setup is not queue backlog.
          const held = heldQueueRef.current;
          heldQueueRef.current = [];
          for (const { id: heldId, message: heldMessage } of held) {
            sentAtRef.current.set(heldId, performance.now());
            post(heldMessage);
          }
          break;
        }
        case "result": {
          // The queue wait, measured on this side: how long the request sat
          // around before the engine translated it. The worker cannot see
          // this itself (its message loop is blocked while it works), so it
          // is arrival time minus translating time minus send time.
          const sentAt = sentAtRef.current.get(message.id);
          if (sentAt != null) {
            const queueMs = Math.max(0, Math.round(performance.now() - sentAt - message.ms));
            message.queueMs = queueMs;
            sentAtRef.current.delete(message.id);
          }
          recordTiming({
            chars: message.chars,
            queueMs: message.queueMs ?? 0,
            translateMs: message.ms,
            engineId: message.engineId,
          });
          netlog.countTranslation();
          netlog.markTranslateSettled(message.id);
          break;
        }
        case "error": {
          if (message.id !== undefined) {
            // This request failed: it will never produce a result.
            sentAtRef.current.delete(message.id);
            netlog.markTranslateSettled(message.id);
          }
          if (message.id === undefined) {
            // A setup level failure. Recreate the worker on retry.
            lastErrorRef.current = { code: message.code, message: message.message };
            terminate();
            setSwitching(false);
            setStatusSafe("error");
            setError({ code: message.code, message: message.message });
            netlog.setEngineReady(false);
          }
          break;
        }
        case "netlog": {
          netlog.recordWorkerFetch(message.url, message.finalUrl, message.size);
          break;
        }
        case "stats": {
          setHeap({ used: message.used, limit: message.limit });
          if (message.device) setDevice(message.device);
          break;
        }
        case "pong": {
          lastPongRef.current = performance.now();
          break;
        }
      }
      for (const listener of listenersRef.current) listener(message);
    },
    [finishStage, netlog, onStage, post, setStatusSafe, terminate],
  );

  const wireWorker = useCallback(
    (worker: Worker) => {
      worker.onmessage = (event: MessageEvent<WorkerToMain>) => handleWorkerMessage(event.data);
      worker.onerror = () => {
        terminate();
        setSwitching(false);
        setStatusSafe("error");
        const err = { code: "download" as EngineErrorCode, message: "The worker could not be started." };
        setError(err);
        lastErrorRef.current = err;
        netlog.setEngineReady(false);
      };
      worker.onmessageerror = () => {
        terminate();
        setSwitching(false);
        setStatusSafe("error");
        const err = { code: "download" as EngineErrorCode, message: "The worker could not be started." };
        setError(err);
        lastErrorRef.current = err;
        netlog.setEngineReady(false);
      };
    },
    [handleWorkerMessage, netlog, setStatusSafe, terminate],
  );

  // Heartbeat: the worker answers pings unless it died. While an engine is
  // ready, 15 seconds without an answer means dead. While loading, WebAssembly
  // session creation can legitimately block the worker's thread for a long
  // stretch, so the watch is wider there and worker errors do the fast work.
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) return;
    lastPongRef.current = performance.now();
    heartbeatTimerRef.current = setInterval(() => {
      const worker = workerRef.current;
      if (!worker) return;
      worker.postMessage({ type: "ping" });
      worker.postMessage({ type: "stats" });
      const last = lastPongRef.current ?? performance.now();
      const silent = performance.now() - last;
      // While a translation is in flight the worker cannot answer: wasm
      // inference blocks its message loop, and the pings queue up behind
      // it. Silence only counts against the worker once the busy window
      // from the last posted translate has passed.
      const busy = performance.now() < busyUntilRef.current;
      const limit = busy || statusRef.current !== "ready" ? 90_000 : SPEED_CONFIG.heartbeat.timeoutMs;
      if (silent > limit) {
        terminate();
        setSwitching(false);
        setStatusSafe("error");
        const err = { code: "download" as EngineErrorCode, message: "The engine stopped responding." };
        setError(err);
        lastErrorRef.current = err;
        netlog.setEngineReady(false);
      }
    }, SPEED_CONFIG.heartbeat.intervalMs);
  }, [netlog, setStatusSafe, terminate]);

  // --- prechecks and loading -----------------------------------------------------------

  /** One tab at a time. Returns false when another tab holds the engine. */
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks?.request) return true;
    try {
      return await new Promise<boolean>((resolve) => {
        void navigator.locks!.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          const held = new Promise<void>((release) => {
            lockReleaseRef.current = release;
          });
          resolve(true);
          return held;
        });
      });
    } catch {
      // Locks misbehaving shouldn't block translation.
      return true;
    }
  }, []);

  /**
   * Send init for an engine, after the prechecks. Shared by the first start
   * and by switches, so every download gets the storage check and the crash
   * flag, whatever came before it.
   */
  const beginLoad = useCallback(
    async (engine: PairEngine): Promise<boolean> => {
      // The experimental gate comes before anything else: nothing that needs
      // the full model is loaded while it is hidden. The setup card already
      // shows the plain notice for such a pair; this is the defensive backstop
      // for any start path that races a settings change. An engine already
      // running for such a pair is left alone — the switch stops new setups,
      // it does not kill working translations.
      if (experimentalHiddenRef.current && engine.kind === "nllb") {
        setStatusSafe("idle");
        return false;
      }
      // The honest ask before a heavy full model setup, on every path that
      // can start one: first start, an engine switch, and a restart. Only
      // when the model isn't already saved on this device; a saved model
      // was committed to once and loads without asking again.
      if (engine.kind === "nllb" && heavyGateRef.current) {
        let savedAlready = false;
        try {
          savedAlready = await modelFilesCached(engine.modelId);
        } catch {
          savedAlready = false;
        }
        if (!savedAlready) {
          let allowed = true;
          try {
            allowed = (await heavyGateRef.current?.(engine, { src: srcCode, tgt: tgtCode })) ?? true;
          } catch {
            allowed = false;
          }
          if (!allowed) return false;
        }
      }

      // Storage prechecks. A window whose quota can't hold the model is told
      // so plainly. Storage that can't be read at all is a note, not a block:
      // translating still works, it just can't be saved for next time.
      let storageDisabled = false;
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate && typeof estimate.quota === "number" && estimate.quota > 0 && estimate.quota < engine.expectedBytes) {
          const err: EngineError = {
            code: "quota",
            message: `quota ${estimate.quota} < ${engine.expectedBytes}`,
            quota: estimate.quota,
            needed: engine.expectedBytes,
          };
          setError(err);
          lastErrorRef.current = err;
          setStatusSafe("error");
          return false;
        }
      } catch {
        storageDisabled = true;
      }
      if (typeof caches === "undefined") storageDisabled = true;

      const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;
      const memoryWarning = engine.kind === "nllb" && typeof deviceMemory === "number" && deviceMemory <= 4;
      setNotes((prev) => ({ ...prev, storageDisabled, memoryWarning, memoryGB: typeof deviceMemory === "number" ? deviceMemory : null }));

      // Which files are already saved here, so Details can tell saved this
      // visit apart from loaded from saved files.
      preExistingFilesRef.current = await cachedModelFiles(engine.modelId);

      // The crash flag: set while setup runs, cleared when it finishes.
      storageSet(STORAGE_KEYS.setupCrash, String(Date.now()));

      stageStartRef.current = { checking: performance.now() };
      fileRowOrderRef.current = [];
      setFileRows([]);
      setStageTimings({});
      fractionRef.current = 0;
      progressSamplesRef.current = [];
      downloadStartRef.current = null;
      setProgress({ loaded: 0, total: 0, fraction: 0, bps: 0, etaMs: null, elapsedMs: 0 });

      const spec: EngineSpec = specFor(engine, srcCode, tgtCode);
      activeSpecRef.current = spec;
      setEngineInfo(engine);
      setStatusSafe("checking");
      post({ type: "init", engine: spec, src: srcCode, tgt: tgtCode, device: settings.useWebGPU ? "webgpu" : "wasm", ...(sessionOptLevel ? { graphOptimizationLevel: sessionOptLevel } : {}) });
      startHeartbeat();
      return true;
    },
    [post, setStatusSafe, srcCode, tgtCode, startHeartbeat, settings.useWebGPU, sessionOptLevel],
  );

  const start = useCallback(
    (options?: { auto?: boolean }) => {
      if (workerRef.current) return;
      const engine = desiredRef.current;
      if (!engine) return;
      setError(null);
      setDevice(null);
      setSwitching(false);
      switchStartRef.current = null;
      setAutoStarted(options?.auto === true);
      void (async () => {
        // One tab at a time.
        const locked = await acquireLock();
        if (!locked) {
          const err = { code: "another-tab" as EngineErrorCode, message: "another tab holds the engine" };
          setError(err);
          lastErrorRef.current = err;
          setStatusSafe("error");
          return;
        }
        if (workerRef.current) return; // A second start raced in.
        const worker = new Worker("/translator.worker.js", { type: "module" });
        workerRef.current = worker;
        wireWorker(worker);
        // The version handshake. No hello in time means files that don't
        // belong together.
        helloTimeoutRef.current = setTimeout(() => {
          if (statusRef.current === "checking" || statusRef.current === "idle") {
            terminate();
            setStatusSafe("error");
            const err = { code: "stale-code" as EngineErrorCode, message: "no hello from the worker" };
            setError(err);
            lastErrorRef.current = err;
          }
        }, 5000);
        worker.postMessage({ type: "hello" });
        await beginLoad(engine);
        // The pair may have changed while the prechecks ran. The desired
        // engine effect re-runs on every status change and will catch it,
        // because activeSpecRef is set before the first status update.
      })();
    },
    [acquireLock, beginLoad, setStatusSafe, terminate, wireWorker],
  );

  // --- switching engines -----------------------------------------------------------

  const switchTo = useCallback(
    async (engine: PairEngine) => {
      if (!workerRef.current) return;
      if (activeSpecRef.current?.id === engine.id) {
        if (activeSpecRef.current?.langTag === engine.tag) return;
        // Same model, different language tag: the model is already in
        // memory. Tell the worker the new tag; it confirms ready without
        // reloading anything. Messages are delivered in order, so this init
        // reaches the worker before any translate posted after it, and
        // requests held from before the pair changed are flushed on ready.
        setSwitching(true);
        switchStartRef.current = performance.now();
        const spec: EngineSpec = specFor(engine, srcCode, tgtCode);
        post({ type: "init", engine: spec, src: srcCode, tgt: tgtCode, device: settings.useWebGPU ? "webgpu" : "wasm", ...(sessionOptLevel ? { graphOptimizationLevel: sessionOptLevel } : {}) });
        activeSpecRef.current = spec;
        return;
      }
      setSwitching(true);
      switchStartRef.current = performance.now();
      heldQueueRef.current = [];
      const ok = await beginLoad(engine);
      if (!ok) {
        // The ask was declined. Nothing was started and nothing switched:
        // the decline handler stopped the engine and returned the card to
        // its offer, because the loaded engine cannot serve this pair.
        setSwitching(false);
      }
    },
    [beginLoad, post, settings.useWebGPU, srcCode, tgtCode, sessionOptLevel],
  );

  // The desired engine, followed. Loading starts early when the model is
  // already saved here, during idle time. A pair change inside the same
  // engine never reloads anything. A change to a different engine switches.
  useEffect(() => {
    if (!settingsLoaded) return;
    const engine = desiredRef.current;
    if (!engine) return;

    let cancelled = false;
    void (async () => {
      const saved = await modelFilesCached(engine.modelId);
      if (cancelled) return;
      setModelPresent(saved);

      if (workerRef.current) {
        // An engine is loaded or loading. Follow the selection. A group
        // model can serve the new pair with just a language tag change.
        const active = activeSpecRef.current;
        const changed = active && statusRef.current !== "error" && (active.id !== engine.id || active.langTag !== engine.tag);
        if (changed) {
          const online = typeof navigator === "undefined" ? true : navigator.onLine;
          if (!online && !saved) {
            // The pair changed to an engine that isn't on this device, and
            // there's no connection to get it. Say so, instead of starting a
            // download that can only fail. The old engine can't translate
            // the new pair, so it goes too.
            terminate();
            setSwitching(false);
            setStatusSafe("idle");
            return;
          }
          // Leaving Bergamot for another engine kind ends the worker: the
          // wasm runtime's heap never shrinks inside a living worker, and a
          // stale half gigabyte next to the full model's three is exactly
          // the memory pressure this app refuses to create silently.
          // (Entering Bergamot needs no such step: the other engines release
          // their sessions on dispose.) The desired-engine effect restarts
          // on its own once the status is idle — through the idle callback,
          // which also gives the one-tab lock time to process our release.
          if (active.kind === "bergamot" && engine.kind !== "bergamot") {
            terminate();
            setAutoStarted(false);
            setSwitching(false);
            setStatusSafe("idle");
            return;
          }
          if (statusRef.current === "ready") {
            switchTo(engine);
          } else {
            // A different engine was wanted mid load. Starting clean is
            // quicker than waiting out a load nobody needs.
            terminate();
            setAutoStarted(false);
            setSwitching(false);
            setStatusSafe("idle");
            start({ auto: true });
          }
        }
        return;
      }

      if (statusRef.current !== "idle" && statusRef.current !== "error") return;
      if (!saved) return;
      // Saved already: begin loading during idle time, without delaying
      // first paint. Don't repeat this for the same engine.
      setAutoStarted(true);
      const begin = () => {
        if (cancelled || workerRef.current) return;
        start({ auto: true });
      };
      if (typeof requestIdleCallback === "function") {
        const handle = requestIdleCallback(begin, { timeout: 2000 });
        void handle;
      } else {
        setTimeout(begin, 300);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The engine identity and its language tag (not every pair) are what
    // trigger this, plus the status changes of a load in progress, so a pair
    // change during the prechecks is still caught once the spec is known.
  }, [desired.id, desired.tag, settingsLoaded, settings.useFastModels, status]);

  // A crash flag left behind means the last setup stopped before finishing.
  // Say so once, on load, while nothing is running.
  useEffect(() => {
    try {
      const raw = storageGet(STORAGE_KEYS.setupCrash);
      if (!raw) return;
      const at = Number(raw);
      if (Number.isFinite(at) && Date.now() - at < SPEED_CONFIG.crashFlagMaxAgeMs) {
        setCrashNotice("crash");
      }
    } catch {
      // Reading storage is best effort.
    }
  }, []);

  // The WebGPU note: wanted, and the engine came back on WebAssembly.
  useEffect(() => {
    if (status !== "ready" || !device) return;
    setNotes((prev) => ({ ...prev, webgpuFellBack: settings.useWebGPU && device === "wasm" }));
  }, [status, device, settings.useWebGPU]);

  const reset = useCallback(() => {
    terminate();
    setStatusSafe("idle");
    setDevice(null);
    setError(null);
    setEngineInfo(null);
    setModelPresent(false);
    setProgress({ loaded: 0, total: 0, fraction: 0, bps: 0, etaMs: null, elapsedMs: 0 });
    setFileRows([]);
    setStageTimings({});
    setSwitching(false);
    setAutoStarted(false);
    setStallSeconds(null);
    setHeap({ used: null, limit: null });
    netlog.setEngineReady(false);
  }, [netlog, setStatusSafe, terminate]);

  /**
   * Stop a setup in progress, by choice. Unlike an error, this leaves no
   * crash flag behind: a deliberate stop is not a crash, and saying so on
   * the next visit would be dishonest. The worker is ended, which also
   * stops any download or session creation inside it, and the engine
   * returns to the idle offer.
   */
  const stop = useCallback(() => {
    storageRemove(STORAGE_KEYS.setupCrash);
    setCrashNotice(null);
    reset();
  }, [reset]);

  // --- the public surface ------------------------------------------------------------

  const translate = useCallback(
    (id: string, text: string | string[], src: string, tgt: string, priority: Priority) => {
      const message: Record<string, unknown> =
        Array.isArray(text)
          ? { type: "translate", id, texts: text, src, tgt, priority }
          : { type: "translate", id, text, src, tgt, priority };
      netlog.markTranslateSent(id);
      if (workerRef.current && statusRef.current === "ready") {
        // While the loaded engine (or its language tag) is being changed to
        // what the pair needs, hold the request: posting it now could run it
        // with the old tag. Flushed on ready, in order.
        const desiredEngine = desiredRef.current;
        const active = activeSpecRef.current;
        const stale =
          desiredEngine && active && (active.id !== desiredEngine.id || active.langTag !== desiredEngine.tag);
        if (!stale) {
          sentAtRef.current.set(id, performance.now());
          // The worker's message loop is blocked while it translates, so it
          // cannot answer pings then. Posting work grants it a grace window
          // in which silence does not count as death.
          busyUntilRef.current = Math.max(busyUntilRef.current, performance.now() + SPEED_CONFIG.heartbeat.busyGraceMs);
          workerRef.current.postMessage(message);
          return;
        }
      }
      // Held, not dropped. Sent the moment the engine is ready.
      heldQueueRef.current.push({ id, message });
    },
    [netlog],
  );

  const cancel = useCallback(
    (id: string) => {
      const heldIndex = heldQueueRef.current.findIndex((entry) => entry.id === id);
      if (heldIndex >= 0) heldQueueRef.current.splice(heldIndex, 1);
      // If it was posted, no result will ever be shown for it: forget the
      // send time so the map cannot leak.
      sentAtRef.current.delete(id);
      post({ type: "cancel", id });
    },
    [post],
  );

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    return () => {
      terminate();
    };
  }, [terminate]);

  return useMemo(
    () => ({
      status,
      device,
      error,
      progress,
      readyTick,
      autoStarted,
      modelPresent,
      engineInfo,
      desiredEngine: desired,
      switching,
      fileRows,
      stageTimings,
      notes,
      crashNotice,
      stallSeconds,
      heap,
      lastSwitchMs,
      lastError: lastErrorRef.current,
      sessionOptLevel,
      experimentalBlocked: experimentalPairHidden,
      start,
      reset,
      stop,
      setHeavyGate,
      translate,
      cancel,
      subscribe,
      clearCrashNotice: () => setCrashNotice(null),
    }),
    [
      status,
      device,
      error,
      progress,
      readyTick,
      autoStarted,
      modelPresent,
      engineInfo,
      desired,
      switching,
      fileRows,
      stageTimings,
      notes,
      crashNotice,
      stallSeconds,
      heap,
      lastSwitchMs,
      sessionOptLevel,
      experimentalPairHidden,
      start,
      reset,
      stop,
      setHeavyGate,
      translate,
      cancel,
      subscribe,
    ],
  );
}

export type Engine = ReturnType<typeof useEngine>;

const EngineContext = createContext<Engine | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const engine = useEngine();
  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngineContext(): Engine {
  const engine = useContext(EngineContext);
  if (!engine) throw new Error("useEngineContext must be used inside EngineProvider");
  return engine;
}

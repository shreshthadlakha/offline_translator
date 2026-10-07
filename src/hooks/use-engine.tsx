"use client";

/**
 * The engine: one translation worker, shared by the translate view and batch
 * mode. Owns setup state, the single aggregated progress value, and the
 * message protocol from section 6.1 of the technical design.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EngineDevice, EngineErrorCode, Priority, WorkerToMain } from "@/workers/protocol";
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from "@/lib/storage";

export type EngineStatus = "idle" | "downloading" | "initializing" | "ready" | "error";

export type EngineError = {
  code: EngineErrorCode;
  message: string;
};

export type EngineProgress = {
  loaded: number;
  total: number;
  /** Fraction of 0 to 1, never allowed to go backwards. */
  fraction: number;
};

type Listener = (message: WorkerToMain) => void;

const MODEL_CACHE_NAME = "transformers-cache";
const MODEL_FILE_HINTS = ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"];

/** Check the browser's Cache API still holds the model files. */
export async function modelFilesCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    const keys = await caches.keys();
    if (!keys.includes(MODEL_CACHE_NAME)) return false;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    const urls = requests.map((r) => r.url);
    return MODEL_FILE_HINTS.every((hint) => urls.some((url) => url.endsWith(hint)));
  } catch {
    return false;
  }
}

export async function deleteModelCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(MODEL_CACHE_NAME);
  } catch {
    // Nothing to do. The cache may already be gone.
  }
}

export function useEngine() {
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [device, setDevice] = useState<EngineDevice | null>(null);
  const [error, setError] = useState<EngineError | null>(null);
  const [progress, setProgress] = useState<EngineProgress>({ loaded: 0, total: 0, fraction: 0 });
  const [readyTick, setReadyTick] = useState(0);
  /** True when the engine started on its own from a previous setup. */
  const [autoStarted, setAutoStarted] = useState(false);
  /** True when the model files are present on this device. */
  const [modelPresent, setModelPresent] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const listenersRef = useRef(new Set<Listener>());
  const fractionRef = useRef(0);
  const wasReadyBeforeRef = useRef(false);
  const startAttemptedRef = useRef(false);

  const post = useCallback((message: Parameters<Worker.prototype.postMessage>[0]) => {
    workerRef.current?.postMessage(message);
  }, []);

  const terminate = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (workerRef.current) return;
    startAttemptedRef.current = true;
    fractionRef.current = 0;
    setError(null);
    setDevice(null);
    setStatus("downloading");
    setProgress({ loaded: 0, total: 0, fraction: 0 });

    const worker = new Worker("/translator.worker.js", { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
      const message = event.data;
      switch (message.type) {
        case "progress": {
          const fraction = message.total > 0 ? Math.min(1, message.loaded / message.total) : 0;
          // The displayed value never goes backwards, even when the known
          // total grows as more files start downloading.
          fractionRef.current = Math.max(fractionRef.current, fraction);
          setProgress({ loaded: message.loaded, total: message.total, fraction: fractionRef.current });
          break;
        }
        case "ready": {
          const firstTime = !wasReadyBeforeRef.current;
          wasReadyBeforeRef.current = true;
          if (firstTime) storageSet(STORAGE_KEYS.modelReady, "1");
          setDevice(message.device);
          setError(null);
          setStatus("ready");
          setModelPresent(true);
          setReadyTick((t) => t + 1);
          break;
        }
        case "error": {
          if (message.id === undefined) {
            // A setup level failure. Recreate the worker on retry.
            terminate();
            setStatus("error");
            setError({ code: message.code, message: message.message });
          }
          break;
        }
      }
      for (const listener of listenersRef.current) listener(message);
    };
    worker.onerror = () => {
      terminate();
      setStatus("error");
      setError({ code: "download", message: "The worker could not be started." });
    };
    worker.postMessage({ type: "init" });
  }, [terminate]);

  const reset = useCallback(() => {
    terminate();
    startAttemptedRef.current = false;
    wasReadyBeforeRef.current = false;
    setStatus("idle");
    setDevice(null);
    setError(null);
    setModelPresent(false);
    setProgress({ loaded: 0, total: 0, fraction: 0 });
  }, [terminate]);

  const translate = useCallback(
    (id: string, text: string, src: string, tgt: string, priority: Priority) => {
      post({ type: "translate", id, text, src, tgt, priority });
    },
    [post],
  );

  const cancel = useCallback((id: string) => {
    post({ type: "cancel", id });
  }, [post]);

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // On mount: if setup finished on an earlier visit, start the engine from the
  // browser cache, but only when the model files are still there. If they were
  // cleared, treat it as a first time setup again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (storageGet(STORAGE_KEYS.modelReady) !== "1") return;
        const cached = await modelFilesCached();
        if (cached) {
          if (!cancelled) {
            setAutoStarted(true);
            setModelPresent(true);
            start();
          }
        } else {
          storageRemove(STORAGE_KEYS.modelReady);
        }
      } catch {
        // Leave setup to the first use.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      terminate();
    };
  }, [terminate]);

  return useMemo(
    () => ({ status, device, error, progress, readyTick, autoStarted, modelPresent, start, reset, translate, cancel, subscribe }),
    [status, device, error, progress, readyTick, autoStarted, modelPresent, start, reset, translate, cancel, subscribe],
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

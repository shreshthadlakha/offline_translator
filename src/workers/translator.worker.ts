/// <reference lib="webworker" />
/**
 * Translation worker. All model loading and inference happens here, off the main
 * thread, so typing never blocks.
 *
 * Privacy: the only network requests made from this worker are the app's own files
 * (this script and /ort/*) and the one time model download from the Hugging Face Hub.
 * Nothing the person types leaves the device; the worker only ever receives text,
 * src and tgt language codes and returns text.
 */

import { pipeline, env, type TranslationPipeline } from "@huggingface/transformers";
import type { EngineDevice, EngineErrorCode, MainToWorker, Priority, WorkerToMain } from "./protocol";
import { PRIORITY_RANK } from "./protocol";

const MODEL_ID = "Xenova/nllb-200-distilled-600M";

// --- Privacy critical configuration ------------------------------------------

// Do not probe for local model files. Load from the hub once, then from the
// browser's Cache API on later visits.
env.allowLocalModels = false;
// Keep downloaded model files in the browser cache so the app works offline afterwards.
env.useBrowserCache = true;
// Self hosted ONNX runtime files. Without this the library points its wasm loader
// at a public CDN, which would leak a request to a third party.
const onnxEnv = env.backends.onnx as unknown as {
  wasm?: { wasmPaths?: string; numThreads?: number };
};
onnxEnv.wasm = onnxEnv.wasm ?? {};
onnxEnv.wasm.wasmPaths = "/ort/";
// Single threaded inference. Multi threading needs cross origin isolation, which
// this app does not have, and one thread keeps the memory footprint lower.
onnxEnv.wasm.numThreads = 1;

// -----------------------------------------------------------------------------

type Job = {
  id: string;
  text: string;
  src: string;
  tgt: string;
  priority: Priority;
  seq: number;
  cancelled: boolean;
};

const queue: Job[] = [];
let runningJob: Job | null = null;
let translator: TranslationPipeline | null = null;
let deviceUsed: EngineDevice | null = null;
let loading = false;
let seqCounter = 0;

function post(message: WorkerToMain) {
  self.postMessage(message);
}

// --- Download progress: aggregate per file, throttle, never go backwards ------

const fileProgress = new Map<string, { loaded: number; total: number }>();
let lastProgressPost = 0;

function aggregateProgress(): { loaded: number; total: number } {
  let loaded = 0;
  let total = 0;
  for (const { loaded: l, total: t } of fileProgress.values()) {
    loaded += l;
    total += t;
  }
  return { loaded, total };
}

function onProgressCallback(data: { status: string; file?: string; loaded?: number; total?: number }) {
  if (!data.file) return;
  if (data.status === "initiate" || data.status === "download" || data.status === "progress" || data.status === "done") {
    const prev = fileProgress.get(data.file) ?? { loaded: 0, total: 0 };
    // Per file values never go backwards either.
    fileProgress.set(data.file, {
      loaded: Math.max(prev.loaded, data.loaded ?? 0),
      total: Math.max(prev.total, data.total ?? 0),
    });
  }
  const now = performance.now();
  if (now - lastProgressPost > 150 || data.status === "done") {
    lastProgressPost = now;
    const { loaded, total } = aggregateProgress();
    post({ type: "progress", loaded, total });
  }
}

// --- Device detection and fallback --------------------------------------------

async function supportsWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

function classifyLoadError(err: unknown): EngineErrorCode {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/out of memory|memory access|allocation failed|oom/i.test(message)) return "memory";
  return "download";
}

function classifyTranslateError(err: unknown): EngineErrorCode {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/out of memory|memory access|allocation failed|oom/i.test(message)) return "memory";
  return "translate";
}

async function load(deviceWanted: "auto" | "wasm" | "webgpu", dtype: string): Promise<void> {
  if (loading || translator) return;
  loading = true;
  try {
    const wantsGPU = deviceWanted === "webgpu" || (deviceWanted === "auto" && (await supportsWebGPU()));
    if (wantsGPU) {
      try {
        translator = await pipeline("translation", MODEL_ID, {
          dtype,
          device: "webgpu",
          progress_callback: onProgressCallback,
        });
        deviceUsed = "webgpu";
      } catch {
        // WebGPU failed to start. Fall back to WebAssembly with the same
        // downloaded files, without surfacing an error.
        translator = null;
        deviceUsed = null;
      }
    }
    if (!translator) {
      translator = await pipeline("translation", MODEL_ID, {
        dtype,
        device: "wasm",
        progress_callback: onProgressCallback,
        // Trim the memory peak while sessions are created. The arena pre allocates
        // a large block, and full graph optimization needs a big temporary workspace.
        // Without these, loading peaks above 2.7 GB of resident memory on this model.
        session_options: {
          enableCpuMemArena: false,
          graphOptimizationLevel: "basic",
          enableMemPattern: false,
        },
      });
      deviceUsed = "wasm";
    }
    post({ type: "ready", device: deviceUsed });
    void pump();
  } catch (err) {
    post({
      type: "error",
      code: classifyLoadError(err),
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading = false;
  }
}

// --- Queue: one request at a time, in priority order --------------------------

function pickNext(): Job | null {
  let bestIndex = -1;
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    if (job.cancelled) continue;
    if (
      bestIndex === -1 ||
      PRIORITY_RANK[job.priority] < PRIORITY_RANK[queue[bestIndex].priority] ||
      (PRIORITY_RANK[job.priority] === PRIORITY_RANK[queue[bestIndex].priority] && job.seq < queue[bestIndex].seq)
    ) {
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;
  return queue.splice(bestIndex, 1)[0] ?? null;
}

async function pump(): Promise<void> {
  if (runningJob || !translator) return;
  for (;;) {
    const job = pickNext();
    if (!job) return;
    runningJob = job;
    try {
      const started = performance.now();
      const output = await translator(job.text, {
        src_lang: job.src,
        tgt_lang: job.tgt,
        max_new_tokens: Math.min(512, Math.max(80, job.text.length)),
      });
      const text = Array.isArray(output)
        ? output
            .map((o) => (typeof o === "string" ? o : o.translation_text))
            .join("")
            .trim()
        : String(output).trim();
      if (!job.cancelled) {
        post({ type: "result", id: job.id, text, ms: Math.round(performance.now() - started) });
      }
    } catch (err) {
      if (!job.cancelled) {
        post({
          type: "error",
          id: job.id,
          code: classifyTranslateError(err),
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      runningJob = null;
    }
  }
}

// --- Message handling ----------------------------------------------------------

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      void load(msg.device ?? "auto", msg.dtype ?? "q8");
      break;
    case "translate":
      queue.push({
        id: msg.id,
        text: msg.text,
        src: msg.src,
        tgt: msg.tgt,
        priority: msg.priority,
        seq: seqCounter++,
        cancelled: false,
      });
      void pump();
      break;
    case "cancel": {
      for (const job of queue) {
        if (job.id === msg.id) job.cancelled = true;
      }
      if (runningJob?.id === msg.id) runningJob.cancelled = true;
      // Drop cancelled jobs that are still queued so they never pile up.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]?.cancelled) queue.splice(i, 1);
      }
      break;
    }
    case "stats": {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
      post({
        type: "stats",
        used: memory?.usedJSHeapSize ?? null,
        limit: memory?.jsHeapSizeLimit ?? null,
        device: deviceUsed,
      });
      break;
    }
  }
};

/// <reference lib="webworker" />
/**
 * Translation worker. All model loading and inference happens here, off the
 * main thread, so typing never blocks.
 *
 * One engine in memory at a time. The init message says which engine to
 * load (model id, kind, precision); loading a different one disposes the
 * old pipeline first. Setup runs through explicit stages (downloading,
 * reading into memory, checking that translation works) reported to the
 * page, and ready only arrives after a short warm up translation succeeds,
 * which also removes the cost of the first real sentence.
 *
 * Privacy: the only network requests made from this worker are the app's own
 * files (this script and /ort/*) and the one time model download from the
 * Hugging Face Hub. Nothing the person types leaves the device; the worker
 * only ever receives text, src and tgt language codes and returns text.
 */

// Must be first: it wraps fetch before the transformers library is evaluated,
// so every request the worker makes is reported to the page (origin, path and
// size only). The translation logic below is untouched by this.
import "./net-report";

import { pipeline, env, StoppingCriteria, type PretrainedModelOptions, type TranslationPipeline } from "@huggingface/transformers";
import type { EngineDevice, EngineErrorCode, EngineSpec, FileRowStatus, GraphOptimizationLevel, MainToWorker, Priority, WorkerToMain } from "./protocol";
import { PROTOCOL_VERSION, PRIORITY_RANK } from "./protocol";
import { BUILD_ID } from "./build-id";
import { MODEL_REVISIONS } from "../lib/engines";
import { SPEED_CONFIG } from "../lib/speed-config";

// --- Privacy critical configuration ------------------------------------------

// Do not probe for local model files. Load from the hub once, then from the
// browser's Cache API on later visits.
env.allowLocalModels = false;
// Keep downloaded model files in the browser cache so the app works offline afterwards.
env.useBrowserCache = true;
// Self hosted ONNX runtime files. Without this the library points its wasm loader
// at a public CDN, which would leak a request to a third party.
const onnxEnv = env.backends.onnx as unknown as {
  wasm?: { wasmPaths?: string };
};
onnxEnv.wasm = onnxEnv.wasm ?? {};
onnxEnv.wasm.wasmPaths = "/ort/";
// Thread settings stay at the library default. Multi threading would need
// cross origin isolation, which belongs to deployment, not here.

// -----------------------------------------------------------------------------

type Job = {
  id: string;
  texts: string[];
  src: string;
  tgt: string;
  priority: Priority;
  seq: number;
  cancelled: boolean;
};

const queue: Job[] = [];
let runningJob: Job | null = null;
let runningInterrupt: InterruptCriteria | null = null;
let pumpScheduled = false;
let translator: TranslationPipeline | null = null;
let loadedEngine: EngineSpec | null = null;
let deviceUsed: EngineDevice | null = null;
let loading = false;
let seqCounter = 0;
/** Session optimization level for the next pipeline creation. The main
 * thread reads it from the URL flag; "basic" is the default. */
let graphOptimizationLevel: GraphOptimizationLevel = "basic";

/** The warm up sentence. Built in text, never anything the person typed. */
const WARMUP_TEXT = "Hello.";

function post(message: WorkerToMain) {
  self.postMessage(message);
}

// --- Interruptible generation --------------------------------------------------

/**
 * A stopping criterion the queue can flip when a job's result is no longer
 * needed: generation stops at the next token instead of running on. Jobs that
 * are still needed are never interrupted.
 */
class InterruptCriteria extends StoppingCriteria {
  stopped = false;
  _call(inputIds: unknown, _scores: unknown): boolean[] {
    const length = Array.isArray(inputIds) ? inputIds.length : 1;
    return new Array<boolean>(length).fill(this.stopped);
  }
}

// --- Download progress: per file rows, aggregate, throttled, never backwards --

const fileProgress = new Map<string, { loaded: number; total: number; status: FileRowStatus }>();
let lastAggregatePost = 0;
let lastFilePost = new Map<string, number>();
let downloadStagePosted = false;
let initializingStagePosted = false;

function aggregateProgress(): { loaded: number; total: number } {
  let loaded = 0;
  let total = 0;
  for (const { loaded: l, total: t } of fileProgress.values()) {
    loaded += l;
    total += t;
  }
  return { loaded, total };
}

function allFilesDone(): boolean {
  if (fileProgress.size === 0) return false;
  for (const { status, loaded, total } of fileProgress.values()) {
    if (status !== "done") return false;
    if (total > 0 && loaded < total) return false;
  }
  return true;
}

function onProgressCallback(data: { status: string; file?: string; loaded?: number; total?: number }) {
  if (!data.file) return;
  const name = data.file;
  const prev = fileProgress.get(name) ?? { loaded: 0, total: 0, status: "waiting" as FileRowStatus };

  if (data.status === "initiate") {
    fileProgress.set(name, { ...prev, status: "waiting" });
    post({ type: "file", file: name, status: "waiting", loaded: prev.loaded, total: prev.total });
  } else if (data.status === "progress" || data.status === "download") {
    // Per file values never go backwards either.
    const loaded = Math.max(prev.loaded, data.loaded ?? prev.loaded);
    const total = Math.max(prev.total, data.total ?? prev.total);
    fileProgress.set(name, { loaded, total, status: "downloading" });
    const now = performance.now();
    const last = lastFilePost.get(name) ?? 0;
    if (now - last > SPEED_CONFIG.progressThrottleMs) {
      lastFilePost.set(name, now);
      post({ type: "file", file: name, status: "downloading", loaded, total });
    }
  } else if (data.status === "done") {
    const total = Math.max(prev.total, data.total ?? prev.total);
    const loaded = total > 0 ? total : prev.loaded;
    fileProgress.set(name, { loaded, total, status: "done" });
    lastFilePost.delete(name);
    post({ type: "file", file: name, status: "done", loaded, total });
  }

  if (!downloadStagePosted) {
    downloadStagePosted = true;
    post({ type: "stage", stage: "downloading" });
  }

  const now = performance.now();
  if (now - lastAggregatePost > SPEED_CONFIG.progressThrottleMs || data.status === "done") {
    lastAggregatePost = now;
    const { loaded, total } = aggregateProgress();
    post({ type: "progress", loaded, total });
  }

  // Every file complete: the next phase is session creation, where no bytes
  // move. The page shows the memory stage from here.
  if (!initializingStagePosted && allFilesDone()) {
    initializingStagePosted = true;
    post({ type: "stage", stage: "initializing" });
  }
}

// --- Device detection -----------------------------------------------------------

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

// --- Language tags for group models ------------------------------------------------

/**
 * Group models (like Opus-MT English to many languages) pick their language
 * with a tag at the very start of the source text, for example ">>hrv<<".
 * The tag comes from the engine spec; the worker adds it here, right before
 * the text reaches the model, and it is never shown anywhere else. Outputs
 * never contain it, and a stray tag echo is stripped defensively.
 */
function applyLangTag(text: string): string {
  const tag = loadedEngine?.langTag;
  if (!tag) return text;
  return `>>${tag}<< ${text}`;
}

/** Remove a leading ">>code<<" from an output, just in case a group model
 * ever echoes its own tag. It must never reach the page. */
function stripLangTagEcho(text: string): string {
  return text.replace(/^>>[a-zA-Z_][a-zA-Z0-9_-]*<<\s*/, "");
}

// --- Token budget ---------------------------------------------------------------

/**
 * max_new_tokens follows the source length: about 1.6 times the source tokens
 * plus 8, capped, so a bad generation can't run on and long sentences can't
 * be cut off mid thought.
 */
function maxNewTokensFor(text: string): number {
  const { factor, plus, cap, charsPerToken } = SPEED_CONFIG.decoding;
  let tokens: number;
  try {
    const tokenizer = (translator as unknown as { tokenizer?: { encode?: (t: string, o?: { add_special_tokens?: boolean }) => number[] } }).tokenizer;
    tokens = tokenizer?.encode ? tokenizer.encode(text, { add_special_tokens: false }).length : Math.ceil(text.length / charsPerToken);
  } catch {
    tokens = Math.ceil(text.length / charsPerToken);
  }
  return Math.min(cap, Math.max(12, Math.round(factor * tokens + plus)));
}

/** The per call generate options: greedy decoding (one beam, no sampling),
 * the token budget, the interrupt criterion, and NLLB's language pair.
 * Typed concretely so the values line up with the library's generation
 * options; the criterion and language fields ride along as extras, exactly
 * as the library's runtime accepts. */
type GenerateOptions = {
  max_new_tokens: number;
  num_beams: number;
  do_sample: boolean;
  stopping_criteria: InterruptCriteria;
  src_lang?: string;
  tgt_lang?: string;
};

/** The per call options. Greedy decoding: one beam, no sampling. */
function generateOptions(text: string, src: string, tgt: string, interrupt: InterruptCriteria): GenerateOptions {
  const options: GenerateOptions = {
    max_new_tokens: maxNewTokensFor(text),
    num_beams: SPEED_CONFIG.decoding.numBeams,
    do_sample: SPEED_CONFIG.decoding.doSample,
    stopping_criteria: interrupt,
  };
  // NLLB takes the pair per call. Opus models are single pair Marian models
  // and take no language arguments.
  if (loadedEngine?.kind === "nllb") {
    options.src_lang = src;
    options.tgt_lang = tgt;
  }
  return options;
}

/** Options for a batch call. The token budget is per sentence, the longest
 * sentence in the group sets it; generation runs per sequence. */
function generateOptionsForGroup(texts: string[], src: string, tgt: string, interrupt: InterruptCriteria): GenerateOptions {
  const options = generateOptions(texts[0] ?? "", src, tgt, interrupt);
  let maxTokens = options.max_new_tokens;
  for (const text of texts.slice(1)) {
    maxTokens = Math.max(maxTokens, maxNewTokensFor(text));
  }
  options.max_new_tokens = maxTokens;
  return options;
}

// --- Loading and switching --------------------------------------------------------

function resetFileProgress(): void {
  fileProgress.clear();
  lastFilePost.clear();
  lastAggregatePost = 0;
  downloadStagePosted = false;
  initializingStagePosted = false;
}

async function disposeCurrent(): Promise<void> {
  // Stop whatever is running and drop queued work: it belongs to the old
  // engine, and the scheduler re-queues anything still needed.
  if (runningJob) runningJob.cancelled = true;
  if (runningInterrupt) runningInterrupt.stopped = true;
  for (const job of queue) job.cancelled = true;
  queue.length = 0;
  if (translator) {
    try {
      await translator.dispose();
    } catch {
      // Best effort. The pipeline is being replaced regardless.
    }
    translator = null;
  }
  loadedEngine = null;
  deviceUsed = null;
  postStatsSnapshot();
}

/** The library's generic pipeline() typing collapses into a union too
 * complex for the compiler under bundler module resolution — a typings
 * limitation of transformers.js v3, not a code problem. This one cast pins
 * the exact overload the worker uses; everything after it stays fully
 * typed. */
const startTranslationPipeline = pipeline as unknown as (
  task: "translation",
  model: string,
  options?: PretrainedModelOptions,
) => Promise<TranslationPipeline>;

async function createPipeline(spec: EngineSpec, device: "wasm" | "webgpu"): Promise<TranslationPipeline> {
  // The pinned revision from the engine table: the app downloads exactly the
  // commit that was benchmarked and licensed, never "whatever is on main
  // now". Same model, same files, deterministic across upstream changes.
  const options: PretrainedModelOptions = {
    dtype: "q8",
    device,
    progress_callback: onProgressCallback,
    // Trim the memory peak while sessions are created. The arena pre allocates
    // a large block, and full graph optimization needs a big temporary workspace.
    session_options: {
      enableCpuMemArena: false,
      graphOptimizationLevel,
      enableMemPattern: false,
    },
  };
  const revision = MODEL_REVISIONS[spec.modelId];
  if (revision) options.revision = revision;
  return startTranslationPipeline("translation", spec.modelId, options);
}

/** The library's translation pipeline typing demands a full GenerationConfig
 * object even though only the fields actually present are read at runtime
 * (its own documented examples pass partial options). This helper states
 * that plainly at the two call sites. */
function asCallOptions(options: GenerateOptions) {
  return options as unknown as Parameters<TranslationPipeline>[1];
}

/** Translate the warm up sentence. Returns false on empty output. */
async function warmUp(spec: EngineSpec, src: string, tgt: string): Promise<boolean> {
  if (!translator) return false;
  const interrupt = new InterruptCriteria();
  const warmupText = applyLangTag(WARMUP_TEXT);
  const output = await translator(warmupText, asCallOptions(generateOptions(warmupText, src, tgt, interrupt)));
  const text = Array.isArray(output)
    ? output.map((o) => (typeof o === "string" ? o : o.translation_text)).join("").trim()
    : String(output).trim();
  return text.length > 0;
}

async function load(spec: EngineSpec, src: string, tgt: string, deviceWanted: "wasm" | "webgpu"): Promise<void> {
  if (loading) return;
  // Already running this model? Group models serve many pairs that differ
  // only by the language tag: switching the tag updates the spec and confirms
  // ready without reloading anything. Anything queued for the previous tag is
  // cancelled; the scheduler re-queues what is still needed.
  if (translator && loadedEngine?.id === spec.id) {
    if (loadedEngine.langTag !== spec.langTag) {
      if (runningJob) runningJob.cancelled = true;
      if (runningInterrupt) runningInterrupt.stopped = true;
      for (const job of queue) job.cancelled = true;
      queue.length = 0;
      loadedEngine = spec;
    }
    post({ type: "ready", device: deviceUsed ?? "wasm", engineId: spec.id });
    return;
  }
  loading = true;
  try {
    await disposeCurrent();
    resetFileProgress();

    let usedDevice: EngineDevice = "wasm";
    if (deviceWanted === "webgpu" && (await supportsWebGPU())) {
      try {
        translator = await createPipeline(spec, "webgpu");
        deviceUsed = "webgpu";
        usedDevice = "webgpu";
        post({ type: "stage", stage: "testing" });
        const ok = await warmUp(spec, src, tgt);
        if (!ok) throw new Error("empty warm up output");
      } catch {
        // WebGPU didn't work on this device. Tear it down and use the more
        // compatible mode with the same downloaded files.
        if (translator) {
          try {
            await translator.dispose();
          } catch {
            // Ignore. Starting over regardless.
          }
        }
        translator = null;
        deviceUsed = null;
        resetFileProgress();
      }
    }

    if (!translator) {
      translator = await createPipeline(spec, "wasm");
      deviceUsed = "wasm";
      usedDevice = "wasm";
      post({ type: "stage", stage: "testing" });
      const ok = await warmUp(spec, src, tgt);
      if (!ok) throw new Error("empty warm up output");
    }

    loadedEngine = spec;
    post({ type: "ready", device: usedDevice, engineId: spec.id });
  } catch (err) {
    post({
      type: "error",
      code: classifyLoadError(err),
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading = false;
    // Drain anything that arrived during the load (an engine switch can
    // post translates while the main thread still shows "ready").
    schedulePump();
  }
}

// --- Queue: one request at a time, in priority order -----------------------------

function pickNext(): Job | null {
  let bestIndex = -1;
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    if (job.cancelled) continue;
    if (
      bestIndex === -1 ||
      PRIORITY_RANK[job.priority] < PRIORITY_RANK[queue[bestIndex]!.priority] ||
      (PRIORITY_RANK[job.priority] === PRIORITY_RANK[queue[bestIndex]!.priority] && job.seq < queue[bestIndex]!.seq)
    ) {
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return null;
  return queue.splice(bestIndex, 1)[0] ?? null;
}

/**
 * Run the next job from a macrotask, never synchronously from onmessage.
 *
 * ONNX wasm inference blocks the worker's event loop: messages posted while
 * a job runs are delivered only after it finishes. If pump() ran a job
 * synchronously inside onmessage, a translate would start before sibling
 * messages (later translates, cancels) could be delivered, so neither the
 * priority order nor cancellation would ever take effect, and every job's
 * queue wait would read as zero. Scheduling through the message loop lets
 * all messages posted together land in the queue first; the pump then picks
 * by priority and skips cancelled work.
 */
function schedulePump(): void {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setTimeout(() => {
    pumpScheduled = false;
    void pump();
  }, 0);
}

async function pump(): Promise<void> {
  if (runningJob || !translator || loading) return;
  // Re-check right before starting: a job whose source text no longer
  // exists is never started.
  const job = pickNext();
  if (!job) return;
  runningJob = job;
  const interrupt = new InterruptCriteria();
  runningInterrupt = interrupt;
  const started = performance.now();
  const chars = job.texts.reduce((sum, t) => sum + t.length, 0);
  try {
    // A batch job carries several sentences in one call; live typing is
    // always one sentence at a time. Group models carry the language tag on
    // every sentence.
    const taggedTexts = job.texts.map(applyLangTag);
    const perCallOptions =
      job.texts.length === 1
        ? generateOptions(taggedTexts[0] ?? "", job.src, job.tgt, interrupt)
        : generateOptionsForGroup(taggedTexts, job.src, job.tgt, interrupt);
    const output = await translator(job.texts.length === 1 ? (taggedTexts[0] ?? "") : taggedTexts, asCallOptions(perCallOptions));
    const texts = (Array.isArray(output) ? output : [output]).map((o) =>
      typeof o === "string" ? stripLangTagEcho(o).trim() : String((o as { translation_text?: string }).translation_text ?? "").trim(),
    );
    if (!job.cancelled) {
      post({
        type: "result",
        id: job.id,
        texts,
        ms: Math.round(performance.now() - started),
        chars,
        engineId: loadedEngine?.id ?? "",
      });
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
    runningInterrupt = null;
    // Yield to the message loop before the next job, so a cancel posted
    // while this one ran is honoured instead of translating stale text.
    // A wasm job that already started always runs to completion (message
    // delivery is blocked during inference); the waste is bounded to that
    // one job, and its result is dropped.
    schedulePump();
  }
}

// --- Stats ------------------------------------------------------------------------

function postStatsSnapshot(): void {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  post({
    type: "stats",
    used: memory?.usedJSHeapSize ?? null,
    limit: memory?.jsHeapSizeLimit ?? null,
    device: deviceUsed,
  });
}

// --- Message handling ---------------------------------------------------------------

self.onmessage = (event: MessageEvent<MainToWorker>) => {
  const msg = event.data;
  switch (msg.type) {
    case "hello":
      post({ type: "hello", protocolVersion: PROTOCOL_VERSION, buildId: BUILD_ID });
      break;
    case "init":
      if (msg.graphOptimizationLevel) graphOptimizationLevel = msg.graphOptimizationLevel;
      void load(msg.engine, msg.src, msg.tgt, msg.device);
      break;
    case "translate": {
      const texts = msg.texts ?? (msg.text !== undefined ? [msg.text] : []);
      if (texts.length === 0) break;
      queue.push({
        id: msg.id,
        texts,
        src: msg.src,
        tgt: msg.tgt,
        priority: msg.priority,
        seq: seqCounter++,
        cancelled: false,
      });
      schedulePump();
      break;
    }
    case "cancel": {
      for (const job of queue) {
        if (job.id === msg.id) job.cancelled = true;
      }
      // Drop cancelled jobs that are still queued so they never pile up.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]?.cancelled) queue.splice(i, 1);
      }
      if (runningJob?.id === msg.id) {
        // The result is no longer needed. On a device where generation
        // yields to the message loop this stops it at the next token; on
        // plain wasm the job runs to completion and the result is dropped
        // here. Either way the work is never delivered as a result.
        runningJob.cancelled = true;
        if (runningInterrupt) runningInterrupt.stopped = true;
      }
      break;
    }
    case "ping":
      post({ type: "pong" });
      break;
    case "stats":
      postStatsSnapshot();
      break;
  }
};

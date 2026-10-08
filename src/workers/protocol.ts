/**
 * Message protocol between the main thread and the translation worker.
 *
 * Version handshake: the worker introduces itself with "hello", carrying the
 * protocol version and the build id both sides were built from. If they don't
 * match what the main thread expects, the app says the files on the device
 * are out of date and asks for a reload, instead of failing in ways that look
 * like anything else.
 *
 * Engine descriptions: the worker no longer hard codes a model. The init
 * message carries the engine to load (model id, kind, precision), and every
 * result says which engine produced it.
 *
 * v5: engines can be group models that need a language tag, ">>hrv<<", at
 * the start of the source text. The worker adds it from the spec and never
 * shows it anywhere.
 */

export const PROTOCOL_VERSION = 5;

export type Priority = "manual" | "sentence" | "fragment" | "batch";

export type EngineDevice = "webgpu" | "wasm";

export type EngineErrorCode = "memory" | "download" | "translate" | "quota" | "another-tab" | "stale-code";

/** The engine description the worker takes. Mirrors lib/engines.ts, kept
 * structural so the worker bundle doesn't pull the whole catalog in. */
export type EngineSpec = {
  id: string;
  kind: "nllb" | "opus";
  modelId: string;
  /** For group models: the language tag the worker prepends, e.g. "hrv".
   *  Absent for single pair models and the full model. */
  langTag?: string;
};

/** Graph optimization levels the session creation can use. The default is
 * "basic"; a URL flag lets a person try the others on their own device and
 * compare the times in Details. */
export type GraphOptimizationLevel = "disabled" | "basic" | "all";

export type FileRowStatus = "waiting" | "downloading" | "done";

/** Setup stages, reported by the worker. "checking" happens on the main
 * thread before the worker is even asked to load anything. */
export type WorkerStage = "downloading" | "initializing" | "testing";

// main -> worker
export type MainToWorker =
  | { type: "hello" }
  | {
      type: "init";
      engine: EngineSpec;
      /** Pair for the warm up translation. Registry codes. */
      src: string;
      tgt: string;
      /** "wasm", or "webgpu" for the experimental setting. */
      device: "wasm" | "webgpu";
      /** Session optimization level, from the URL flag. Default "basic". */
      graphOptimizationLevel?: GraphOptimizationLevel;
    }
  | {
      type: "translate";
      id: string;
      /** One sentence, or a group of sentences for batch mode. */
      text?: string;
      texts?: string[];
      src: string;
      tgt: string;
      priority: Priority;
    }
  | { type: "cancel"; id: string }
  | { type: "ping" }
  /** Spike and Details support: worker heap usage. */
  | { type: "stats" };

// worker -> main
export type WorkerToMain =
  | { type: "hello"; protocolVersion: number; buildId: string }
  | { type: "stage"; stage: WorkerStage }
  | { type: "progress"; loaded: number; total: number }
  | { type: "file"; file: string; status: FileRowStatus; loaded: number; total: number }
  | { type: "ready"; device: EngineDevice; engineId: string }
  | {
      type: "result";
      id: string;
      /** One output per input sentence. */
      texts: string[];
      ms: number;
      /**
       * Set by the MAIN thread, not the worker: how long the request waited
       * before translation started. The worker cannot measure this honestly,
       * because wasm inference blocks its message loop, so a message is often
       * delivered only when the previous job has finished - exactly when it
       * starts running. The main thread knows when it sent the request and
       * when the result landed, so it computes the wait as arrival minus
       * translating time minus send time.
       */
      queueMs?: number;
      /** Characters of source text. A count, never the text. */
      chars: number;
      engineId: string;
    }
  | { type: "error"; id?: string; code: EngineErrorCode; message: string }
  | { type: "netlog"; url: string; finalUrl: string; size: number }
  | { type: "stats"; used: number | null; limit: number | null; device: EngineDevice | null }
  | { type: "pong" };

export const PRIORITY_RANK: Record<Priority, number> = {
  manual: 0,
  sentence: 1,
  fragment: 2,
  batch: 3,
};

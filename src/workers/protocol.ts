/**
 * Message protocol between the main thread and the translation worker.
 * Mirrors section 6.1 of the technical design. The `init` message carries optional
 * overrides used by the Phase 1 spike; the shipped app sends `{ type: 'init' }` alone.
 */

export type Priority = "manual" | "sentence" | "fragment" | "batch";

export type EngineDevice = "webgpu" | "wasm";

export type EngineErrorCode = "memory" | "download" | "translate";

export type EngineState = "idle" | "downloading" | "initializing" | "ready" | "error";

// main -> worker
export type MainToWorker =
  | { type: "init"; device?: "auto" | "wasm" | "webgpu"; dtype?: string }
  | { type: "translate"; id: string; text: string; src: string; tgt: string; priority: Priority }
  | { type: "cancel"; id: string }
  /** Spike only: ask the worker for its own heap usage. */
  | { type: "stats" };

// worker -> main
export type WorkerToMain =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device: EngineDevice }
  | { type: "result"; id: string; text: string; ms?: number }
  | { type: "error"; id?: string; code: EngineErrorCode; message: string }
  /** Spike only. */
  | { type: "stats"; used: number | null; limit: number | null; device: EngineDevice | null };

export const PRIORITY_RANK: Record<Priority, number> = {
  manual: 0,
  sentence: 1,
  fragment: 2,
  batch: 3,
};

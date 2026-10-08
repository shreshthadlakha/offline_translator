/**
 * The engine details behind the setup experience's Details disclosure and the
 * status badge's details view: one row per model file, the device and
 * precision used, whether the files are saved on this device, storage and
 * memory as the browser reports them, how long each stage took, the last
 * error, and the app version.
 *
 * Privacy: none of this can contain anything the person typed. File names,
 * sizes, timings, device facts and library error messages only. The plain
 * text form makes that explicit.
 */

import type { EngineDevice, EngineErrorCode, FileState, WorkerStage } from "@/workers/protocol";
import { FILE_LABELS } from "@/workers/protocol";
import { DEBUG_MODEL } from "@/lib/debug";
import { WORKER_BUILD_ID } from "@/generated/worker-build";
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;

export type EngineFileRow = {
  file: string;
  label: string;
  state: FileState;
  loaded: number;
  total: number;
  cached: boolean;
};

export type StageTiming = {
  stage: WorkerStage | "ready";
  ms: number;
};

export type EngineErrorFact = {
  code: EngineErrorCode;
  message: string;
} | null;

export type EngineFacts = {
  model: string;
  debug: boolean;
  device: EngineDevice | null;
  dtype: string | null;
  /** True when the faster graphics mode was tried and fell back. */
  fellBack: boolean;
  warmupMs: number | null;
  files: EngineFileRow[];
  filesSavedOnDevice: boolean;
  stages: StageTiming[];
  lastError: EngineErrorFact;
  storage: { usage: number; quota: number } | null;
  memory: { used: number | null; limit: number | null } | null;
  translatingNow: boolean;
};

/** Order rows: the canonical order first, then anything else in arrival order
 * (the sort is stable, so ties keep the order the files appeared in). */
export function fileSortCompare(a: EngineFileRow, b: EngineFileRow): number {
  const ia = CANONICAL.indexOf(a.file);
  const ib = CANONICAL.indexOf(b.file);
  return (ia === -1 ? CANONICAL.length : ia) - (ib === -1 ? CANONICAL.length : ib);
}

const CANONICAL = [
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
  "tokenizer.json",
  "config.json",
  "generation_config.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "sentencepiece.bpe.model",
];

export function fileLabel(file: string): string {
  return FILE_LABELS[file] ?? file.split("/").pop() ?? file;
}

function formatMB(bytes: number): string {
  if (bytes <= 0) return "—";
  const mb = bytes / (1000 * 1000);
  return mb >= 100 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
}

function formatStage(stage: string): string {
  switch (stage) {
    case "checking":
      return "Checking your device";
    case "downloading":
      return "Downloading the model";
    case "initializing":
      return "Reading it into memory";
    case "testing":
      return "Checking that translation works";
    case "ready":
      return "Ready";
    default:
      return stage;
  }
}

function fileStateLabel(state: FileState): string {
  switch (state) {
    case "waiting":
      return "waiting";
    case "downloading":
      return "downloading";
    case "saved":
      return "saved";
    case "from-cache":
      return "loaded from saved files";
    default:
      return state;
  }
}

/** Plain text, safe to hand to anyone: no typed text, no translations. */
export function serializeEngineFacts(f: EngineFacts): string {
  const lines: string[] = [];
  lines.push("Private Translator, setup details");
  lines.push(`App version: ${APP_VERSION} (build ${WORKER_BUILD_ID})`);
  lines.push(`Model: ${f.model}${f.debug ? " (development test model)" : ""}`);
  lines.push(
    `Device: ${f.device === "webgpu" ? "WebGPU (experimental)" : f.device === "wasm" ? "WebAssembly" : "not started"}${
      f.dtype ? `, precision ${f.dtype}` : ""
    }${f.fellBack ? "; switched to WebAssembly after the graphics mode didn't work" : ""}`,
  );
  if (f.warmupMs != null) lines.push(`Test translation: ${formatSeconds(f.warmupMs)}`);
  lines.push(`Files saved on this device: ${f.filesSavedOnDevice ? "yes" : "no"}`);
  lines.push("");
  lines.push("Files:");
  if (f.files.length === 0) {
    lines.push("  none started yet");
  } else {
    for (const row of [...f.files].sort(fileSortCompare)) {
      const size = row.total > 0 ? (row.state === "downloading" ? `${formatMB(row.loaded)} of ${formatMB(row.total)}` : formatMB(row.total)) : "—";
      lines.push(`  ${row.label} (${row.file}): ${fileStateLabel(row.state)}, ${size}`);
    }
  }
  lines.push("");
  if (f.storage) {
    lines.push(`Storage: ${formatMB(f.storage.usage)} used of ${formatMB(f.storage.quota)}`);
  } else {
    lines.push("Storage: not reported by this browser");
  }
  if (f.memory && (f.memory.used != null || f.memory.limit != null)) {
    const used = f.memory.used != null ? formatMB(f.memory.used) : "unknown";
    const limit = f.memory.limit != null ? formatMB(f.memory.limit) : "unknown";
    lines.push(`Memory reported: ${used} used of ${limit}`);
  } else {
    lines.push("Memory: not reported by this browser");
  }
  lines.push("");
  lines.push("Stages:");
  if (f.stages.length === 0) {
    lines.push("  none yet");
  } else {
    for (const s of f.stages) lines.push(`  ${formatStage(s.stage)}: ${formatSeconds(s.ms)}`);
  }
  lines.push("");
  lines.push(`Last error: ${f.lastError ? `${f.lastError.message} (${f.lastError.code})` : "none"}`);
  lines.push("");
  lines.push("These details don't include anything you typed.");
  return lines.join("\n");
}

/** Which model is in charge on this device. */
export function activeModel(): { id: string; debug: boolean } {
  return DEBUG_MODEL ? { id: DEBUG_MODEL, debug: true } : { id: "Xenova/nllb-200-distilled-600M", debug: false };
}

/** Model files that mark a complete download, for the cache check. */
export function keyModelFiles(): string[] {
  return ["onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
}

/** Roughly how much space the model needs, for the storage pre check. */
export function modelApproxBytes(): number {
  return DEBUG_MODEL ? 150 * 1024 * 1024 : 956 * 1024 * 1024;
}

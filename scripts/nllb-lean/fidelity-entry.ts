// Fidelity harness for the lean full-model engine (P12 step 1 gate).
//
// Runs the REAL engine module (src/workers/nllb-lean-engine.ts, bundled with
// the browser ORT import aliased to onnxruntime-node) on ten fixed sentences
// per direction, with the exact settings the Node harness used when it
// produced the reference runs (greedy, max_new_tokens 256, session options
// enableCpuMemArena false / graphOptimizationLevel basic / enableMemPattern
// false), and compares the outputs byte for byte against the stored outputs
// of scripts/benchmark/runs/*_nllb-200-distilled-600M.json — the current
// engine's reference outputs.
//
// Build (esbuild): see scripts/nllb-lean/run-fidelity.sh.
// Run: node --import ./fidelity-register.mjs cache/fidelity-bundle.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // scripts/nllb-lean/cache
const CACHE_DIR = here; // the downloaded, sha256-verified bundle files
const ROOT = join(here, "..", "..", "..");

// --- Harness-only memory trims (nothing here changes what the engine does
// or verifies; both are about fitting the sandbox machine's ~2.8 GB budget):
// 1. A streaming SHA-256 replaces webcrypto's whole-buffer digest, which
//    copies the entire 475 MB file (+450 MB transient). Same hash values —
//    every file still has to match its pin exactly.
const realSubtle = globalThis.crypto.subtle;
Object.defineProperty(globalThis, "crypto", {
  value: {
    subtle: {
      ...realSubtle,
      digest: async (algo: string, data: ArrayBuffer | ArrayBufferView) => {
        if (String(algo).toLowerCase().replace("-", "") !== "sha256") {
          return realSubtle.digest(algo, data);
        }
        const view =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const h = createHash("sha256");
        const CHUNK = 32 * 1024 * 1024;
        for (let i = 0; i < view.length; i += CHUNK) h.update(view.subarray(i, i + CHUNK));
        return h.digest().buffer as ArrayBuffer;
      },
    },
  },
  configurable: true,
  writable: true,
});

// --- Cache API shim over the local research cache (set BEFORE importing the
// engine, whose fetchVerifiedFile calls caches.open at load time). The
// matched "response" is a zero-copy view of the file on disk: arrayBuffer()
// returns the read buffer's own backing store, so the harness measures the
// engine's real footprint instead of Node Response copies.
class ShimCache {
  async match(url) {
    const name = new URL(url).pathname.split("/").filter(Boolean).pop();
    try {
      const bytes = readFileSync(join(CACHE_DIR, name));
      const ab =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes.buffer
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return { arrayBuffer: async () => ab };
    } catch {
      return undefined;
    }
  }
  async put() {}
  async delete() {}
}
if (!globalThis.caches) {
  globalThis.caches = { open: async () => new ShimCache() };
}

const { NllbLeanEngine } = await import("../../src/workers/nllb-lean-engine");

const DIRECTIONS = [
  { src: "eng_Latn", tgt: "fra_Latn", run: "scripts/benchmark/runs/eng_Latn-fra_Latn_nllb-200-distilled-600M.json" },
  { src: "hin_Deva", tgt: "eng_Latn", run: "scripts/benchmark/runs/hin_Deva-eng_Latn_nllb-200-distilled-600M.json" },
];

const flores = (code) =>
  readFileSync(join(ROOT, "scripts/benchmark/data/flores200_dataset/devtest", `${code}.devtest`), "utf8")
    .replace(/\n$/, "")
    .split("\n");

const t0 = performance.now();
const progressEvents = [];
const engine = new NllbLeanEngine();
const mem = () => {
  try {
    const m = readFileSync("/proc/self/status", "utf8").match(/Vm(?:RSS|HWM):\s+(\d+) kB/g) ?? [];
    // /proc/self/status lists VmHWM before VmRSS.
    return m.map((x) => Math.round(Number(x.replace(/\D/g, "")) / 1024) + "MB").join("/");
  } catch {
    return "?";
  }
};
const watch = setInterval(() => console.log(`  tick ${mem()}`), 500);
console.log(`[fidelity] loading engine… ${mem()}`);
const maybeGc = () => {
  // Harness-only: the sandbox machine has ~2.8 GB available and Node's GC is
  // lazy about large dead buffers (the browser collects under allocation
  // pressure on its own; that is measured separately in step 2). This keeps
  // the harness inside the machine's budget without changing anything the
  // engine does or verifies.
  (globalThis as { gc?: () => void }).gc?.();
};
await engine.load(
  (p) => {
    progressEvents.push(p);
    if (p.status === "done") {
      maybeGc();
      console.log(`[fidelity] file done: ${p.file} ${mem()}`);
    }
  },
  { enableCpuMemArena: false, graphOptimizationLevel: "disabled", enableMemPattern: false },
);
const loadSeconds = (performance.now() - t0) / 1000;
// Let the sweeper finish: the encoder's dead 419 MB buffer needs a moment
// after gc() before its pages return (harness-only, same reason as maybeGc).
for (let i = 0; i < 4; i++) {
  maybeGc();
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`[fidelity] engine loaded in ${loadSeconds.toFixed(1)}s; HWM/RSS ${mem()}`);
const done = progressEvents.filter((p) => p.status === "done");
console.log(`[fidelity] ${done.length} files served: ${done.map((p) => p.file).join(", ")}`);

let mismatches = 0;
let total = 0;
for (const dir of DIRECTIONS) {
  const run = JSON.parse(readFileSync(join(ROOT, dir.run), "utf8"));
  const ids = run.ids.slice(0, 10);
  const srcLines = flores(dir.src);
  console.log(`[fidelity] ${dir.src} -> ${dir.tgt}: ${ids.length} fixed sentences (ids ${ids.join(",")})`);
  for (const id of ids) {
    const text = srcLines[id];
    maybeGc();
    await new Promise((r) => setTimeout(r, 100));
    console.log(`  -> translating id ${id} (${text.length} chars) ${mem()}`);
    const t1 = performance.now();
    const out = await engine.translate(text, dir.src, dir.tgt, () => false, 256);
    const ms = Math.round(performance.now() - t1);
    const ref = run.outputs[id];
    total++;
    maybeGc();
    if (out === ref) {
      console.log(`  [ok]     ${id} (${ms} ms) ${JSON.stringify(out.slice(0, 60))}${out.length > 60 ? "…" : ""}`);
    } else {
      mismatches++;
      console.log(`  [MISMATCH] ${id} (${ms} ms)`);
      console.log(`    lean: ${JSON.stringify(out.slice(0, 160))}`);
      console.log(`    ref : ${JSON.stringify(String(ref).slice(0, 160))}`);
    }
  }
}

await engine.dispose();
clearInterval(watch);
if (mismatches > 0) {
  console.error(`[fidelity] FAILED: ${mismatches}/${total} sentences differ from the Node harness reference.`);
  process.exit(1);
}
console.log(`[fidelity] PASS: ${total}/${total} sentences byte-identical to the Node harness reference outputs.`);

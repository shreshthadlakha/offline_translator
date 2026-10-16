#!/usr/bin/env node
// Copies the Bergamot translator WebAssembly runtime files that ship with
// @mkljczk/bergamot-translator into public/bergamot, so the app never
// requests the runtime from a third party. The two files are the standard
// Mozilla bergamot-translator build (MPL-2.0); the engine verifies their
// SHA-256 against the pins in src/lib/bergamot/runtime.ts before use.
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const pkgDir = "node_modules/@mkljczk/bergamot-translator/worker";
const outDir = "public/bergamot";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const f of ["bergamot-translator-worker.js", "bergamot-translator-worker.wasm"]) {
  await cp(path.join(pkgDir, f), path.join(outDir, f));
}
console.log(`Self hosted the Bergamot runtime (2 files) in ${outDir}`);

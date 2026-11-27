#!/usr/bin/env node
// Copies the ONNX runtime WebAssembly files that ship with @huggingface/transformers
// into public/ort so the app never requests them from a public CDN.
// The technical design requires this: "Self host the ONNX runtime files."
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to the repo root, like every other script: run from any other
// working directory these paths would otherwise resolve against it.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(ROOT, "node_modules/@huggingface/transformers/dist");
const outDir = join(ROOT, "public/ort");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const files = (await readdir(pkgDir)).filter((f) => f.startsWith("ort-"));
if (files.length === 0) {
  throw new Error(`No ort-* files found in ${pkgDir}. Is @huggingface/transformers installed?`);
}
for (const f of files) {
  await cp(join(pkgDir, f), join(outDir, f));
}
console.log(`Self hosted ${files.length} ORT runtime file(s) in ${outDir}: ${files.join(", ")}`);

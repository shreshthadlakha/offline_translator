#!/usr/bin/env node
// Copies the ONNX runtime WebAssembly files that ship with @huggingface/transformers
// into public/ort so the app never requests them from a public CDN.
// The technical design requires this: "Self host the ONNX runtime files."
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const pkgDir = "node_modules/@huggingface/transformers/dist";
const outDir = "public/ort";

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const files = (await readdir(pkgDir)).filter((f) => f.startsWith("ort-"));
if (files.length === 0) {
  throw new Error(`No ort-* files found in ${pkgDir}. Is @huggingface/transformers installed?`);
}
for (const f of files) {
  await cp(path.join(pkgDir, f), path.join(outDir, f));
}
console.log(`Self hosted ${files.length} ORT runtime file(s) in ${outDir}: ${files.join(", ")}`);

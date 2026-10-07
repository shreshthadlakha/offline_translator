#!/usr/bin/env node
// Bundles the translation web worker into public/translator.worker.js.
// The worker is loaded with new Worker('/translator.worker.js', { type: 'module' })
// so the ONNX runtime and its self hosted wasm files always come from this origin.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const OUT = "public/translator.worker.js";

function tryBuild(cmd) {
  const result = spawnSync(cmd[0], [...cmd.slice(1), "src/workers/translator.worker.ts", "--target=browser", "--format=esm", `--outfile=${OUT}`], {
    stdio: "inherit",
  });
  return result.status === 0;
}

rmSync(OUT, { force: true });

if (!tryBuild(["bun", "build"])) {
  console.error("bun build failed, trying esbuild...");
  if (!tryBuild(["bunx", "esbuild"])) {
    console.error("Could not bundle the translation worker.");
    process.exit(1);
  }
}
console.log(`Worker bundled to ${OUT}`);

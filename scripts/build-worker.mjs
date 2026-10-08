#!/usr/bin/env node
// Bundles the translation web worker into public/translator.worker.js.
// The worker is loaded with new Worker('/translator.worker.js', { type: 'module' })
// so the ONNX runtime and its self hosted wasm files always come from this origin.
//
// A fresh build id is written into src/workers/build-id.ts first. Both the
// worker bundle and the app import that module, so the version handshake in
// the protocol can tell when the files on a device don't match each other.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

const OUT = "public/translator.worker.js";
const BUILD_ID_FILE = "src/workers/build-id.ts";

const buildId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 8)}`;
writeFileSync(
  BUILD_ID_FILE,
  `/**\n * The build id. scripts/build-worker.mjs rewrites this file every time the\n * worker is bundled, so the worker bundle and the app share one id. The\n * version handshake compares them; a mismatch means the files on the device\n * are out of date with each other.\n */\n\nexport const BUILD_ID = ${JSON.stringify(buildId)};\n`,
);

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
console.log(`Worker bundled to ${OUT} (build ${buildId})`);

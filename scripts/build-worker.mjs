#!/usr/bin/env node
// Builds every generated runtime file for Private Translator. Runs
// automatically on install (postinstall), on dev (predev) and on build
// (prebuild), so a fresh checkout needs nothing else.
//
// Produces, from source only:
//   1. src/workers/build-id.ts   — one build id shared by everything below.
//   2. public/translator.worker.js — the translation worker bundle (esbuild).
//   3. public/sw.js               — the service worker, rendered from
//                                   scripts/sw-template.js with the build id
//                                   as the shell cache name, so every build
//                                   starts a fresh shell cache.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceStamp } from "./stamp-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/translator.worker.js");
const SW_OUT = join(ROOT, "public/sw.js");
const SW_TEMPLATE = join(ROOT, "scripts/sw-template.js");
const BUILD_ID_FILE = join(ROOT, "src/workers/build-id.ts");

const buildId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 8)}`;

// --- 1. the shared build id --------------------------------------------------------
writeFileSync(
  BUILD_ID_FILE,
  `/**\n * The build id. scripts/build-worker.mjs rewrites this file every time the\n * worker is bundled, so the worker bundle and the app share one id. The\n * version handshake compares them; a mismatch means the files on the device\n * are out of date with each other.\n */\n\nexport const BUILD_ID = ${JSON.stringify(buildId)};\n`,
);

// --- 2. the worker bundle ------------------------------------------------------------
// Each runner takes its own flags: bun build bundles by default and
// understands "browser"; esbuild needs --bundle and a language level.
const RUNNERS = [
  { cmd: ["bun", "build"], extra: ["--target=browser"] },
  { cmd: ["npx", "esbuild"], extra: ["--bundle", "--target=es2020"] },
  { cmd: ["bunx", "esbuild"], extra: ["--bundle", "--target=es2020"] },
];

function tryBuild({ cmd, extra }) {
  const result = spawnSync(cmd[0], [...cmd.slice(1), "src/workers/translator.worker.ts", ...extra, "--format=esm", `--outfile=${OUT}`], {
    stdio: "inherit",
    cwd: ROOT,
  });
  // status 0 = success; result.error = the binary does not exist here.
  return result.status === 0 && !result.error;
}

rmSync(OUT, { force: true });

// bun build first (this repo's day to day runner), then npx esbuild for
// npm-only environments (CI, deploy builders), then bunx esbuild.
let bundled = false;
for (const runner of RUNNERS) {
  if (tryBuild(runner)) {
    bundled = true;
    break;
  }
  console.error(`${runner.cmd[0]} failed or is unavailable, trying the next runner...`);
}
if (!bundled) {
  console.error("Could not bundle the translation worker (tried: bun build, npx esbuild, bunx esbuild).");
  process.exit(1);
}

// --- 3. the service worker -----------------------------------------------------------
const template = readFileSync(SW_TEMPLATE, "utf8");
writeFileSync(SW_OUT, template.replaceAll("__BUILD_ID__", buildId));

// The source stamp (first line of the bundle): check-drift.mjs recomputes it
// and refuses a stale bundle, so editing src/workers or src/lib without
// re-running this script can never ship old code silently. NOTE for local
// development: next dev does NOT watch the worker sources — after editing
// anything under src/workers or src/lib, run `npm run build:worker` (or
// restart `npm run dev`) before reloading the page.
const { stamp, files } = sourceStamp();
const bundle = readFileSync(OUT, "utf8");
writeFileSync(OUT, `// pt-src:${stamp}\n${bundle}`);

console.log(`Worker bundled to public/translator.worker.js (build ${buildId}, source stamp over ${files} files)`);
console.log(`Service worker rendered to public/sw.js (shell cache pt-shell-${buildId})`);

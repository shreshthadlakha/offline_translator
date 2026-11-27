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
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sourceStamp } from "./stamp-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/translator.worker.js");
/** Bundling lands here first; the previous good bundle is replaced only
 *  once a new one exists. */
const OUT_TMP = `${OUT}.tmp`;
const SW_OUT = join(ROOT, "public/sw.js");
const SW_TEMPLATE = join(ROOT, "scripts/sw-template.js");
const BUILD_ID_FILE = join(ROOT, "src/workers/build-id.ts");
/** The locally installed esbuild, when node_modules is present: its bin
 * wrapper is plain JavaScript run through node, so it needs no shell. */
const LOCAL_ESBUILD = join(ROOT, "node_modules/esbuild/bin/esbuild");

const buildId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12)}-${Math.random().toString(36).slice(2, 8)}`;

// --- 1. the shared build id --------------------------------------------------------
// The id is written before bundling so the bundle bakes it in (the version
// handshake compares the app's build-id.ts with the id inside the bundle).
// The previous content is kept: if no runner can produce a bundle, the old
// id is restored, so the still-present old bundle and service worker stay
// in agreement with the app instead of the tree ending up with a fresh id
// and no worker at all.
const previousBuildIdFile = existsSync(BUILD_ID_FILE) ? readFileSync(BUILD_ID_FILE, "utf8") : null;
writeFileSync(
  BUILD_ID_FILE,
  `/**\n * The build id. scripts/build-worker.mjs rewrites this file every time the\n * worker is bundled, so the worker bundle and the app share one id. The\n * version handshake compares them; a mismatch means the files on the device\n * are out of date with each other.\n */\n\nexport const BUILD_ID = ${JSON.stringify(buildId)};\n`,
);

// --- 2. the worker bundle ------------------------------------------------------------
// Each runner has a label for the failure log, its command, and the flags
// it needs: bun build bundles by default and understands "browser"; esbuild
// needs --bundle and a language level. The local esbuild install runs
// through node itself (process.execPath), which works on every platform —
// on Windows, npx and bunx are .cmd files that spawnSync cannot launch
// without a shell, which is why the local runner exists; the npm-only
// fallbacks stay last in the list for POSIX deploy builders.
const RUNNERS = [
  { label: "bun build", cmd: ["bun", "build"], extra: ["--target=browser"] },
  ...(existsSync(LOCAL_ESBUILD)
    ? [{ label: "local esbuild", cmd: [process.execPath, LOCAL_ESBUILD], extra: ["--bundle", "--target=es2020"] }]
    : []),
  { label: "npx esbuild", cmd: ["npx", "esbuild"], extra: ["--bundle", "--target=es2020"] },
  { label: "bunx esbuild", cmd: ["bunx", "esbuild"], extra: ["--bundle", "--target=es2020"] },
];

function tryBuild({ cmd, extra }) {
  const result = spawnSync(cmd[0], [...cmd.slice(1), "src/workers/translator.worker.ts", ...extra, "--format=esm", `--outfile=${OUT_TMP}`], {
    stdio: "inherit",
    cwd: ROOT,
  });
  // status 0 = success; result.error = the binary does not exist here.
  return result.status === 0 && !result.error;
}

rmSync(OUT_TMP, { force: true });

// bun build first (this repo's day to day runner), then the local esbuild,
// then npx esbuild for environments without node_modules (deploy builders),
// then bunx esbuild.
let bundled = false;
for (const runner of RUNNERS) {
  if (tryBuild(runner)) {
    bundled = true;
    break;
  }
  console.error(`${runner.label} failed or is unavailable, trying the next runner...`);
}
if (!bundled) {
  rmSync(OUT_TMP, { force: true });
  if (previousBuildIdFile !== null) writeFileSync(BUILD_ID_FILE, previousBuildIdFile);
  else rmSync(BUILD_ID_FILE, { force: true });
  console.error(`Could not bundle the translation worker (tried: ${RUNNERS.map((r) => r.label).join(", ")}).`);
  console.error("Nothing was replaced: the previous bundle, service worker and build id still agree.");
  process.exit(1);
}
rmSync(OUT, { force: true });
renameSync(OUT_TMP, OUT);

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

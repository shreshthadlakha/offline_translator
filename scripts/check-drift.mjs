#!/usr/bin/env node
// The drift check: everything derived must match what it is derived from.
// Run locally (npm run drift) and in CI before every build.
//
// 1. THIRD_PARTY_NOTICES.md must equal a regeneration from the engine table,
//    the pinned revisions and the Hub research (generate-notices.mjs --check).
// 2. The quality table must equal a regeneration from the engine table and
//    the benchmark results (quality-table.mjs --check, stamps ignored).
// 3. MODEL_REVISIONS in src/lib/engines.ts must agree exactly with
//    scripts/release/model-revisions.json — the app pins what the notices
//    publish, and neither can drift from the other.
// 4. Every engine the app can route to must have a pinned revision.
// 5. The IndicTrans2 bundles (which download at commits pinned inside
//    src/lib/indictrans2/bundles.ts, verified by sha256) must agree with the
//    revision registry: one pin per model, never two.
// 6. The Bergamot bundles (mirror revision + per-file sha256, pinned inside
//    src/lib/bergamot/bundles.ts) must agree with the research record
//    (scripts/bergamot/bergamot-pins.json), and every routable Bergamot
//    engine must have its pins. Bergamot engines are pinned there, not in
//    MODEL_REVISIONS (they are not transformers repositories).
// 7. The lean full-model bundle (src/lib/nllb/bundles.ts) must agree with
//    its research record (scripts/nllb-lean/pins.json), and its commit must
//    be the same revision MODEL_REVISIONS pins for the repository — one pin
//    per model, never two, and the bundle must cover every file the engine
//    fetches.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_REVISIONS, allEngines } from "../src/lib/engines.ts";
import { BERGAMOT_PAIRS, BERGAMOT_REVISION, BERGAMOT_RUNTIME } from "../src/lib/bergamot/bundles.ts";
import { NLLB_BUNDLE } from "../src/lib/nllb/bundles.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let failed = false;

function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}

// 1 + 2: regenerate in memory and compare to the committed files.
run("scripts/generate-notices.mjs", ["--check"]);
run("scripts/benchmark/quality-table.mjs", ["--check"]);

// 3: engines.ts revision map vs the recorded model-revisions.json.
const recorded = JSON.parse(readFileSync(join(HERE, "release/model-revisions.json"), "utf8")).revisions;
const inCode = MODEL_REVISIONS;
const codeKeys = Object.keys(inCode).sort();
const fileKeys = Object.keys(recorded).sort();
if (codeKeys.join("\n") !== fileKeys.join("\n")) {
  const onlyInCode = codeKeys.filter((k) => !recorded[k]);
  const onlyInFile = fileKeys.filter((k) => !(k in inCode));
  console.error(`drift: MODEL_REVISIONS keys differ from model-revisions.json (only in code: ${onlyInCode.join(", ") || "none"}; only in file: ${onlyInFile.join(", ") || "none"})`);
  failed = true;
} else {
  for (const key of codeKeys) {
    if (inCode[key] !== recorded[key]) {
      console.error(`drift: revision of ${key} is ${inCode[key]} in engines.ts but ${recorded[key]} in model-revisions.json`);
      failed = true;
    }
  }
  if (!failed) console.log(`ok: MODEL_REVISIONS matches model-revisions.json (${codeKeys.length} models)`);
}

// 4: every routable engine pinned (Bergamot engines carry their own pins in
// src/lib/bergamot/bundles.ts, checked separately below).
const unpinned = allEngines().filter((engine) => engine.kind !== "bergamot" && !inCode[engine.modelId]);
if (unpinned.length > 0) {
  console.error(`drift: engines without a pinned revision: ${unpinned.map((e) => e.modelId).join(", ")}`);
  failed = true;
} else {
  const nonBergamot = allEngines().filter((engine) => engine.kind !== "bergamot").length;
  console.log(`ok: every routable non-Bergamot engine (${nonBergamot}) has a pinned revision`);
}

// 5: IndicTrans2 bundle commits vs the revision registry.
const bundles = (await import("../src/lib/indictrans2/bundles.ts")).INDICTRANS2_BUNDLES;
for (const [key, bundle] of Object.entries(bundles)) {
  const registry = recorded[bundle.repo];
  if (!registry) {
    console.error(`drift: IndicTrans2 bundle ${key} (${bundle.repo}) is not in model-revisions.json`);
    failed = true;
  } else if (registry !== bundle.commit) {
    console.error(`drift: IndicTrans2 bundle ${key} pins ${bundle.commit} but the registry says ${registry}`);
    failed = true;
  } else {
    console.log(`ok: IndicTrans2 bundle ${key} pin matches the registry (${bundle.commit.slice(0, 12)})`);
  }
}

// 6: Bergamot pins vs the research record.
const bergamotResearch = JSON.parse(readFileSync(join(HERE, "bergamot/bergamot-pins.json"), "utf8"));
if (bergamotResearch.revision !== BERGAMOT_REVISION) {
  console.error(`drift: Bergamot revision is ${BERGAMOT_REVISION} in bundles.ts but ${bergamotResearch.revision} in the research record`);
  failed = true;
}
const bergamotRouted = allEngines().filter((engine) => engine.kind === "bergamot");
for (const engine of bergamotRouted) {
  const pair = Object.values(BERGAMOT_PAIRS).find((p) => p.modelId === engine.modelId);
  if (!pair) {
    console.error(`drift: Bergamot engine ${engine.modelId} has no pinned bundle`);
    failed = true;
    continue;
  }
  const recorded = bergamotResearch.pairs[pairKeyOf(pair)];
  if (!recorded) {
    console.error(`drift: Bergamot pair ${pairKeyOf(pair)} is routed but missing from the research record`);
    failed = true;
    continue;
  }
  const same =
    pair.files.length === recorded.length &&
    pair.files.every((f, i) => f.name === recorded[i].name && f.bytes === recorded[i].bytes && f.sha256 === recorded[i].sha256);
  if (!same) {
    console.error(`drift: Bergamot pair ${pairKeyOf(pair)} pins differ from the research record`);
    failed = true;
  }
}
if (!failed) console.log(`ok: ${bergamotRouted.length} Bergamot engines pinned (revision ${BERGAMOT_REVISION.slice(0, 12)}, per-file sha256, runtime ${BERGAMOT_RUNTIME.wasm.sha256.slice(0, 12)})`);

function pairKeyOf(pair) {
  return Object.keys(BERGAMOT_PAIRS).find((k) => BERGAMOT_PAIRS[k] === pair) ?? "?";
}

// 7: the lean full-model bundle vs the research record and the revision registry.
const nllbResearch = JSON.parse(readFileSync(join(HERE, "nllb-lean/pins.json"), "utf8"));
if (nllbResearch.revision !== NLLB_BUNDLE.commit) {
  console.error(`drift: NLLB bundle pins commit ${NLLB_BUNDLE.commit} but the research record says ${nllbResearch.revision}`);
  failed = true;
}
if (inCode[NLLB_BUNDLE.repo] !== NLLB_BUNDLE.commit) {
  console.error(`drift: NLLB bundle commit ${NLLB_BUNDLE.commit} disagrees with MODEL_REVISIONS pin ${inCode[NLLB_BUNDLE.repo] ?? "(missing)"} for ${NLLB_BUNDLE.repo}`);
  failed = true;
}
const nllbSame =
  nllbResearch.files.length === NLLB_BUNDLE.files.length &&
  nllbResearch.files.every((f, i) =>
    f.name === NLLB_BUNDLE.files[i].name &&
    f.bytes === NLLB_BUNDLE.files[i].bytes &&
    f.sha256 === NLLB_BUNDLE.files[i].sha256) &&
  nllbResearch.totalBytes === NLLB_BUNDLE.totalBytes;
if (!nllbSame) {
  console.error("drift: NLLB bundle pins differ from the research record (scripts/nllb-lean/pins.json)");
  failed = true;
}
if (!failed) console.log(`ok: NLLB lean bundle pinned (revision ${NLLB_BUNDLE.commit.slice(0, 12)}, ${NLLB_BUNDLE.files.length} files, per-file sha256, ${NLLB_BUNDLE.totalBytes} B total)`);

// 8: the generated runtime files must match their sources (M-22).
// 8a. The worker bundle carries a source stamp: a sha256 over everything
// under src/workers and src/lib, written by build-worker.mjs. A stale
// public/translator.worker.js (sources edited, bundle not rebuilt) fails.
try {
  const { sourceStamp } = await import("./stamp-sources.mjs");
  const { stamp } = sourceStamp();
  const workerFirst = readFileSync(join(ROOT, "public/translator.worker.js"), "utf8").split("\n")[0] ?? "";
  const m = /^\/\/ pt-src:([0-9a-f]{64})$/.exec(workerFirst);
  if (!m) {
    console.error("drift: public/translator.worker.js has no source stamp - re-run npm run build:worker");
    failed = true;
  } else if (m[1] !== stamp) {
    console.error("drift: public/translator.worker.js is stale (worker sources changed after the last bundle) - re-run npm run build:worker");
    failed = true;
  } else {
    console.log("ok: worker bundle matches its sources (source stamp)");
  }
} catch (err) {
  console.error(`drift: worker bundle check failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
}

// 8b. public/sw.js must be the template with this build id substituted.
try {
  const template = readFileSync(join(ROOT, "scripts/sw-template.js"), "utf8");
  const buildIdSrc = readFileSync(join(ROOT, "src/workers/build-id.ts"), "utf8");
  const buildId = /export const BUILD_ID = "([^"]+)"/.exec(buildIdSrc)?.[1];
  const sw = readFileSync(join(ROOT, "public/sw.js"), "utf8");
  if (!buildId || sw !== template.replaceAll("__BUILD_ID__", buildId)) {
    console.error("drift: public/sw.js does not match scripts/sw-template.js + the current build id - re-run npm run build:worker");
    failed = true;
  } else {
    console.log("ok: service worker matches its template and build id");
  }
} catch (err) {
  console.error(`drift: service worker check failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
}

// 8c. Every PRECACHE path except "/" must exist under public/.
try {
  const template = readFileSync(join(ROOT, "scripts/sw-template.js"), "utf8");
  const precacheBlock = /const PRECACHE = \[([\s\S]*?)\];/.exec(template)?.[1] ?? "";
  const paths = [...precacheBlock.matchAll(/"([^"]+)"/g)].map((mm) => mm[1]);
  if (paths.length === 0) {
    console.error("drift: could not read the PRECACHE list from scripts/sw-template.js");
    failed = true;
  }
  for (const path of paths) {
    if (path === "/") continue;
    const file = join(ROOT, "public", path);
    try {
      statSync(file);
    } catch {
      console.error(`drift: PRECACHE path ${path} does not exist in public/ - re-run npm run assets`);
      failed = true;
    }
  }
  if (!failed) console.log(`ok: all ${paths.length} SW precache paths exist in public/`);
} catch (err) {
  console.error(`drift: SW precache check failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
}

// 8d. The self-hosted runtimes must be byte-identical to their node_modules
// sources (a truncated copy ships silently otherwise - copy-ort.mjs has no
// checksums of its own).
try {
  const mismatches = [];
  for (const [from, to] of [
    ["node_modules/@huggingface/transformers/dist", "public/ort"],
    ["node_modules/@mkljczk/bergamot-translator", "public/bergamot"],
  ]) {
    let names;
    try {
      names = readdirSync(join(ROOT, from)).filter((n) => n.startsWith("ort-") || n.startsWith("bergamot-translator-worker"));
    } catch {
      mismatches.push(`${from} is not installed`);
      continue;
    }
    for (const name of names) {
      const srcHash = createHash("sha256").update(readFileSync(join(ROOT, from, name))).digest("hex");
      let dstHash;
      try {
        dstHash = createHash("sha256").update(readFileSync(join(ROOT, to, name))).digest("hex");
      } catch {
        mismatches.push(`${to}/${name} is missing`);
        continue;
      }
      if (srcHash !== dstHash) mismatches.push(`${to}/${name} differs from ${from}/${name}`);
    }
  }
  if (mismatches.length > 0) {
    for (const m of mismatches) console.error(`drift: ${m} - re-run npm run assets`);
    failed = true;
  } else {
    console.log("ok: self-hosted ORT and Bergamot runtimes are byte-identical to their sources");
  }
} catch (err) {
  console.error(`drift: runtime file check failed: ${err instanceof Error ? err.message : String(err)}`);
  failed = true;
}

if (failed) {
  console.error("\nDrift check FAILED. Regenerate what changed (npm run notices / npm run quality:table / npm run assets) or fix the source of truth, then commit them together.");
  process.exit(1);
}
console.log("\nDrift check passed: notices, quality table, revision pins and generated runtime files all match the code.");

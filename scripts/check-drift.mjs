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
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_REVISIONS, allEngines } from "../src/lib/engines.ts";

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

// 4: every routable engine pinned.
const unpinned = allEngines().filter((engine) => !inCode[engine.modelId]);
if (unpinned.length > 0) {
  console.error(`drift: engines without a pinned revision: ${unpinned.map((e) => e.modelId).join(", ")}`);
  failed = true;
} else {
  console.log(`ok: every routable engine (${allEngines().length}) has a pinned revision`);
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

if (failed) {
  console.error("\nDrift check FAILED. Regenerate what changed (npm run notices / npm run quality:table) or fix the source of truth, then commit them together.");
  process.exit(1);
}
console.log("\nDrift check passed: notices, quality table and revision pins all match the code.");

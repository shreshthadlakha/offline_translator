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
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODEL_REVISIONS, allEngines } from "../src/lib/engines.ts";
import { BERGAMOT_PAIRS, BERGAMOT_REVISION, BERGAMOT_RUNTIME } from "../src/lib/bergamot/bundles.ts";

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

if (failed) {
  console.error("\nDrift check FAILED. Regenerate what changed (npm run notices / npm run quality:table) or fix the source of truth, then commit them together.");
  process.exit(1);
}
console.log("\nDrift check passed: notices, quality table and revision pins all match the code.");

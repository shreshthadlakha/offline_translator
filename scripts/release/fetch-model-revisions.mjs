#!/usr/bin/env node
// Fetches the pinned Hugging Face revision (commit sha) for every model in
// the engine table and writes scripts/release/model-revisions.json.
//
// The app pins these revisions at load time (MODEL_REVISIONS in
// src/lib/engines.ts, passed to the pipeline in the worker), so a model
// repository changing upstream can never silently change what this app
// downloads or how the benchmarked quality maps to the shipped files.
//
// Run this only when the engine table gains a model or a pin must move;
// review the diff of model-revisions.json (and re-run the benchmark for
// anything that moved). Nothing here runs at app runtime.
//
// Usage: node scripts/release/fetch-model-revisions.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allEngines } from "../../src/lib/engines.ts";

const HERE = join(dirname(fileURLToPath(import.meta.url)));
const OUT = join(HERE, "model-revisions.json");

const entries = {};
let failed = 0;
for (const engine of allEngines()) {
  const url = `https://huggingface.co/api/models/${engine.modelId}`;
  const response = await fetch(url, { headers: { "User-Agent": "private-translator-release-check" } });
  if (!response.ok) {
    console.error(`FAIL ${engine.modelId}: HTTP ${response.status}`);
    failed++;
    continue;
  }
  const data = await response.json();
  const sha = data.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error(`FAIL ${engine.modelId}: no sha in API response`);
    failed++;
    continue;
  }
  entries[engine.modelId] = sha;
  console.log(`${engine.modelId} -> ${sha.slice(0, 12)}`);
}

if (failed > 0) {
  console.error(`${failed} model(s) could not be pinned; nothing written.`);
  process.exit(1);
}

const file = {
  fetchedAt: new Date().toISOString(),
  source: "Hugging Face Hub API (HEAD commit sha of each model repository)",
  note: "Pinned in src/lib/engines.ts (MODEL_REVISIONS) and passed to the translation pipeline as its revision option. Every model the app can load must appear here.",
  revisions: entries,
};
writeFileSync(OUT, JSON.stringify(file, null, 2) + "\n");
console.log(`\nwrote ${OUT} (${Object.keys(entries).length} models)`);

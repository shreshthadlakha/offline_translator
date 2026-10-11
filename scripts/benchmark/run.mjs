// The benchmark runner: one command, any pair.
//
//   bun scripts/benchmark/run.mjs <srcCode> <tgtCode> [options]
//
// Resolves the pair -> engine from the app's own table (src/lib/engines.ts,
// imported read-only; the app is never changed). Small and group engines run
// through the real browser worker bundle (speed + load from the worker path);
// the full NLLB model runs in a Node harness for quality, its timing labeled
// honestly as node-harness. Every chunk is resumable through the run state;
// completed runs are scored (chrF++ + sanity flags + speed) and upserted into
// scripts/benchmark/benchmark-results.json.
//
// Options:
//   --engine auto|fast|full   auto: the app's routing; fast: force the small
//                              engine if one exists (error if not); full: NLLB
//   --budget-seconds N        chunk time budget (default 420)
//   --limit N                 only the first N sample sentences (testing)
//   --score-only              rescore an existing complete run
//   --fresh                   delete the run state and start over
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ENGINE_TABLE, NLLB_ENGINE } from '../../src/lib/engines.ts';
import { chrfppCorpus, chrfppCorpusLower, chrfppSentence } from './chrfpp.mjs';
import { sanityFlags } from './sanity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

// --- args ---------------------------------------------------------------------------
const positional = [];
let engineChoice = 'auto';
let budgetSeconds = 420;
let limit = null;
let scoreOnly = false;
let fresh = false;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--engine') engineChoice = process.argv[++i];
  else if (a === '--budget-seconds') budgetSeconds = Number(process.argv[++i]);
  else if (a === '--limit') limit = Number(process.argv[++i]);
  else if (a === '--score-only') scoreOnly = true;
  else if (a === '--fresh') fresh = true;
  else positional.push(a);
}
const [src, tgt] = positional;
if (!src || !tgt) {
  console.error('usage: bun scripts/benchmark/run.mjs <srcCode> <tgtCode> [--engine auto|fast|full] [--budget-seconds N] [--limit N] [--score-only] [--fresh]');
  console.error("example: bun scripts/benchmark/run.mjs eng_Latn fra_Latn");
  process.exit(2);
}

// --- engine resolution ---------------------------------------------------------------
const pairKey = `${src}|${tgt}`;
let engine;
if (engineChoice === 'full') {
  engine = NLLB_ENGINE;
} else {
  const fast = ENGINE_TABLE[pairKey];
  if (engineChoice === 'fast' && !fast) {
    console.error(`no fast engine for ${pairKey}; use --engine full or auto`);
    process.exit(1);
  }
  engine = fast ?? NLLB_ENGINE;
}
const mode = engine.kind === 'nllb' ? 'node' : 'browser';
const runKey = `${src}-${tgt}#${engine.id}`;

// --- run state ------------------------------------------------------------------------
mkdirSync(HERE('runs'), { recursive: true });
const statePath = HERE(`runs/${runKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const ids = limit ? sample.ids.slice(0, limit) : sample.ids;

if (fresh && existsSync(statePath)) rmSync(statePath);
let state;
if (existsSync(statePath)) {
  state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (state.ids.length !== ids.length) {
    console.error(`run state has ${state.ids.length} ids, this invocation wants ${ids.length} (was it started with --limit?): use --fresh`);
    process.exit(1);
  }
} else {
  state = {
    runKey, src, tgt,
    engine: { id: engine.id, kind: engine.kind, modelId: engine.modelId, name: engine.name, expectedBytes: engine.expectedBytes, langTag: engine.tag ?? null },
    mode,
    ids,
    outputs: {}, errors: {}, perSentenceMs: {},
    loadMsCold: null, loadMsWarm: [], filesBytes: null,
    nodeLoadSeconds: null, nodeDownloadSeconds: null,
    startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), complete: false,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

console.log(`run ${runKey} [${mode}] ${Object.keys(state.outputs).length}/${ids.length} sentences done`);

// --- scoring --------------------------------------------------------------------------
function floresLines(code) {
  return readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
}

function publishedFor(src, tgt) {
  const csv = readFileSync(HERE('data/nllb-200-distilled-600m-metrics.csv'), 'utf8').trim().split('\n').slice(1);
  for (const line of csv) {
    const [d, s] = line.split(',');
    if (d === `${src}-${tgt}`) return Number(s);
  }
  return null;
}

function score(state) {
  const refLines = floresLines(state.tgt);
  const refs = state.ids.map((id) => refLines[id]);
  const hyps = state.ids.map((id) => state.outputs[id]);

  const corpus = chrfppCorpus(hyps, refs);
  const corpusLower = chrfppCorpusLower(hyps, refs);

  const perSentence = [];
  const flagCounts = { empty: 0, wrongScript: 0, repeatLoop: 0, lenRatio: 0, endsMidWord: 0 };
  const flagged = [];
  for (let i = 0; i < state.ids.length; i++) {
    const id = state.ids[i];
    const flags = sanityFlags(hyps[i], refs[i], state.tgt);
    for (const f of flags) flagCounts[f]++;
    const s = chrfppSentence(hyps[i], refs[i]);
    if (flags.length > 0 || state.errors[id]) flagged.push({ id, flags, error: state.errors[id] ?? null, score: Number(s.toFixed(1)) });
    perSentence.push(s);
  }
  const flaggedSentences = flagged.filter((f) => f.flags.length > 0).length;

  const ms = state.ids.map((id) => state.perSentenceMs[id]).filter((v) => typeof v === 'number' && v > 0).sort((a, b) => a - b);
  const medianMs = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  const p90Ms = ms.length ? ms[Math.floor(ms.length * 0.9)] : null;
  const warmLoads = (state.loadMsWarm ?? []).slice().sort((a, b) => a - b);
  const warmMedian = warmLoads.length ? warmLoads[Math.floor(warmLoads.length / 2)] : null;

  const speed = state.mode === 'browser'
    ? {
        source: 'browser-worker (the real app worker bundle)',
        medianSecondsPerSentence: medianMs != null ? Number((medianMs / 1000).toFixed(3)) : null,
        p90SecondsPerSentence: p90Ms != null ? Number((p90Ms / 1000).toFixed(3)) : null,
        loadMsCold: state.loadMsCold,
        loadMsWarmMedian: warmMedian,
        downloadedBytes: state.filesBytes,
      }
    : {
        source: 'node-harness (the sandbox browser cannot load the full model; small-model speed numbers in this file come from the browser worker path)',
        medianSecondsPerSentence: medianMs != null ? Number((medianMs / 1000).toFixed(3)) : null,
        p90SecondsPerSentence: p90Ms != null ? Number((p90Ms / 1000).toFixed(3)) : null,
        loadSeconds: state.nodeLoadSeconds,
        downloadSeconds: state.nodeDownloadSeconds ?? null,
      };

  const published = publishedFor(state.src, state.tgt);
  return {
    runKey: state.runKey,
    pair: { src: state.src, tgt: state.tgt },
    engine: state.engine,
    mode: state.mode,
    nSentences: state.ids.length,
    chrfpp: { corpus: Number(corpus.toFixed(2)), corpusLower: Number(corpusLower.toFixed(2)) },
    published: published != null ? { chrfpp: published, delta: Number((corpus - published).toFixed(2)) } : null,
    sanity: {
      counts: flagCounts,
      flaggedSentences,
      flagRate: Number((flaggedSentences / state.ids.length).toFixed(3)),
      details: flagged,
    },
    speed,
    completedAt: new Date().toISOString(),
  };
}

function upsertResult(record) {
  const p = HERE('benchmark-results.json');
  const file = existsSync(p)
    ? JSON.parse(readFileSync(p, 'utf8'))
    : {
        sample: { file: 'scripts/benchmark/sample.json', size: sample.size, seed: sample.seed, source: sample.source },
        reference: 'FLORES-200 devtest (human professional translations)',
        results: [],
      };
  const i = file.results.findIndex((r) => r.runKey === record.runKey);
  if (i >= 0) file.results[i] = record;
  else file.results.push(record);
  writeFileSync(p, JSON.stringify(file, null, 2) + '\n');
}

// --- run a chunk -----------------------------------------------------------------------
if (!scoreOnly) {
  const childScript = mode === 'browser' ? 'browser-driver.mjs' : 'node-nllb.mjs';
  const child = spawn('node', [HERE(childScript), statePath, String(budgetSeconds * 1000)], {
    cwd: ROOT('.'),
    env: { ...process.env, MALLOC_ARENA_MAX: '2' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) console.error(`[run] child exited with code ${code} (partial state is kept; rerun to continue)`);
  state = JSON.parse(readFileSync(statePath, 'utf8'));
}

// --- score if complete ------------------------------------------------------------------
if (!state.complete) {
  const done = Object.keys(state.outputs).length;
  console.log(`\nprogress: ${done}/${state.ids.length} sentences. Rerun the same command to continue.`);
  process.exit(0);
}

const record = score(state);
upsertResult(record);

console.log(`\n=== ${record.runKey} COMPLETE ===`);
console.log(`chrF++ (corpus):   ${record.chrfpp.corpus}  (lowercase ${record.chrfpp.corpusLower})`);
if (record.published) console.log(`published chrF++:  ${record.published.chrfpp}  (local - published = ${record.published.delta > 0 ? '+' : ''}${record.published.delta})`);
console.log(`sanity flags:      ${record.sanity.flaggedSentences}/${record.nSentences} sentences flagged` +
  ` (empty ${record.sanity.counts.empty}, wrongScript ${record.sanity.counts.wrongScript}, repeatLoop ${record.sanity.counts.repeatLoop}, lenRatio ${record.sanity.counts.lenRatio}, endsMidWord ${record.sanity.counts.endsMidWord})`);
if (record.speed.medianSecondsPerSentence != null) {
  console.log(`speed [${record.mode}]:   median ${record.speed.medianSecondsPerSentence}s/sentence, p90 ${record.speed.p90SecondsPerSentence}s`);
}
if (record.mode === 'browser') {
  console.log(`load:              cold ${record.speed.loadMsCold}ms, warm median ${record.speed.loadMsWarmMedian}ms, downloaded ${(record.speed.downloadedBytes / 1e6).toFixed(1)} MB`);
} else {
  console.log(`load [node]:       ${record.speed.loadSeconds}s${record.speed.downloadSeconds ? ` (first download ${record.speed.downloadSeconds}s)` : ''}`);
}
console.log(`results appended to scripts/benchmark/benchmark-results.json`);

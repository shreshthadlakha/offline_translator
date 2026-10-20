// Quality gate driver: loops over all 21 candidates, spawning a FRESH node process
// per model per run (so memory is released between models). Two runs per model:
//   run 1 = downloads the model + translates (cold),
//   run 2 = loads from disk cache + translates (authoritative timings).
// Writes runs.json progressively.
// Usage: node scripts/quality-gate/drive.mjs [pairKey ...]   (no args = all)
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = join(__dirname, '..', '..');

const models = JSON.parse(readFileSync(HERE('models.json'), 'utf8'));
let candidates = models.candidates;
if (process.argv.length > 2) {
  const wanted = new Set(process.argv.slice(2));
  candidates = candidates.filter((c) => wanted.has(c.pair));
}

// Resume support: keep already-measured models.
const runsPath = HERE('runs.json');
const runs = existsSync(runsPath)
  ? JSON.parse(readFileSync(runsPath, 'utf8'))
  : { generatedAt: new Date().toISOString(), models: {} };

function runOnce(cand, tag) {
  const r = spawnSync(process.execPath, [HERE('run-model.mjs'), cand.pair, tag], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, MALLOC_ARENA_MAX: '2' },
  });
  if (r.error) return { error: String(r.error) };
  if (r.status !== 0) return { error: `exit ${r.status}`, stderr: (r.stderr || '').split('\n').slice(-8).join('\n') };
  const lines = (r.stdout || '').trim().split('\n');
  const jsonLine = lines[lines.length - 1];
  try {
    return JSON.parse(jsonLine);
  } catch (e) {
    return { error: `bad stdout: ${e.message}`, stdoutTail: lines.slice(-3).join('\n') };
  }
}

const tAll = Date.now();
for (const cand of candidates) {
  if (runs.models[cand.pair]?.run2 && !process.env.FORCE_RERUN) {
    console.log(`[drive] ${cand.pair} already measured, skipping`);
    continue;
  }
  console.log(`[drive] ${cand.pair} (${cand.modelId}) run 1 (cold)...`);
  const run1 = runOnce(cand, 'cold');
  console.log(`[drive] ${cand.pair} run 1 ${run1.error ? 'FAILED: ' + run1.error : 'ok'}`);
  console.log(`[drive] ${cand.pair} run 2 (cached)...`);
  const run2 = runOnce(cand, 'cached');
  console.log(`[drive] ${cand.pair} run 2 ${run2.error ? 'FAILED: ' + run2.error : 'ok'}`);

  const outputsIdentical =
    Array.isArray(run1.outputs) && Array.isArray(run2.outputs) &&
    run1.outputs.length === run2.outputs.length &&
    run1.outputs.every((o, i) => o === run2.outputs[i]);

  runs.models[cand.pair] = {
    pair: cand.pair,
    modelId: cand.modelId,
    srcLang: cand.srcLang,
    tgtLang: cand.tgtLang,
    testSet: cand.testSet,
    run1,
    run2,
    outputsIdenticalAcrossRuns: outputsIdentical,
  };
  writeFileSync(runsPath, JSON.stringify(runs, null, 2) + '\n');
  const elapsed = ((Date.now() - tAll) / 60000).toFixed(1);
  console.log(`[drive] ${cand.pair} saved (${elapsed} min elapsed)`);
}

console.log(`[drive] ALL DONE in ${((Date.now() - tAll) / 60000).toFixed(1)} min`);

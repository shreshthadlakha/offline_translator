// P2c queue: runs every (panel direction x variant) cell through the P1
// runner until a deadline. Skips cells that already have a completed, scored
// result; run.mjs resumes partial runs, so a killed chunk never restarts
// from zero. The first run of a direction in one pass downloads the model
// with a cleared cache (honest cold load); the remaining variants of that
// direction run with --keep-cache (same files from the browser cache; the
// compared metric is per-sentence time, and each variant still gets its own
// fresh worker through the settings key).
//
// One worker at a time; the driver terminates the previous worker when the
// settings change. Chrome RSS is checked between runs: if it drifts too
// high the pass stops so the browser can be restarted by hand.
//
// Usage: bun scripts/benchmark/p2c-queue.mjs [budgetSeconds]    (default 540)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_TABLE } from '../../src/lib/engines.ts';
import { PANEL } from './variants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const deadline = Date.now() + Number(process.argv[2] ?? 540) * 1000;
// Do not start a run this pass cannot carry a meaningful chunk of.
const RESERVE_MS = 250_000;
const SPAWN_TIMEOUT_MS = 330_000;
const CHILD_BUDGET_S = 300;
const MAX_ATTEMPTS = 2; // invocations per cell per pass; state resumes
const RSS_LIMIT_MB = 2300;

const resultsPath = join(__dirname, 'benchmark-results.json');
function completedKeys() {
  return new Set(JSON.parse(readFileSync(resultsPath, 'utf8')).results.map((r) => r.runKey));
}
let done = completedKeys();

const cells = [];
for (const d of PANEL) {
  const pair = `${d.src}|${d.tgt}`;
  const engine = ENGINE_TABLE[pair];
  if (!engine) throw new Error(`no engine for ${pair}`);
  for (const v of ['A', 'B', 'C', 'D', 'E']) {
    cells.push({ ...d, engine, variant: v, runKey: `${d.src}-${d.tgt}#${engine.id}@${v}` });
  }
}
const remaining = cells.filter((c) => !done.has(c.runKey));
console.log(`[p2c] ${cells.length} cells (9 directions x 5 variants), ${remaining.length} remaining`);

function chromeRssMb() {
  const r = spawnSync('sh', ['-c', "ps -eo rss,comm | grep -i chrome | awk '{s+=\$1} END {print s}'"], { encoding: 'utf8' });
  const kb = Number(String(r.stdout ?? '').trim());
  return Number.isFinite(kb) ? Math.round(kb / 1024) : 0;
}

// Directions already served in THIS pass keep their model in the cache.
const served = new Set();
let completedThisPass = 0;
for (const c of remaining) {
  if (Date.now() + RESERVE_MS > deadline) { console.log(`[p2c] deadline: stopping before ${c.runKey}`); break; }
  const rss = chromeRssMb();
  if (rss > RSS_LIMIT_MB) { console.log(`[p2c] chrome RSS ${rss} MB above ${RSS_LIMIT_MB}: stopping this pass`); break; }

  const firstOfDirection = !served.has(`${c.src}|${c.tgt}`);
  const keep = !firstOfDirection;
  console.log(`\n=== [p2c] ${c.runKey} (cache ${keep ? 'kept' : 'cleared, fresh download'}) ===`);
  let ok = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
    if (Date.now() + 45_000 > deadline && attempt > 1) { console.log(`[p2c] too late for attempt ${attempt}`); break; }
    const args = ['scripts/benchmark/run.mjs', c.src, c.tgt, '--engine', 'fast', '--variant', c.variant,
      '--budget-seconds', String(CHILD_BUDGET_S)];
    if (keep) args.push('--keep-cache');
    const r = spawnSync('bun', args, { cwd: ROOT, stdio: 'inherit', timeout: SPAWN_TIMEOUT_MS, killSignal: 'SIGTERM' });
    // run.mjs exits 0 on an incomplete-but-resumed chunk too: the ONLY
    // completion signal is a scored record in benchmark-results.json.
    ok = completedKeys().has(c.runKey);
    if (!ok) console.error(`[p2c] ${c.runKey} attempt ${attempt}: ${r.status === 0 ? 'chunk budget spent' : `exited ${r.status ?? 'signal ' + r.signal}`}; state kept, ${attempt < MAX_ATTEMPTS ? 'resuming' : 'will resume next pass'}`);
  }
  served.add(`${c.src}|${c.tgt}`);
  if (ok) completedThisPass++;
}
console.log(`\n[p2c] pass finished: ${completedThisPass} cells completed this pass`);
console.log('[p2c] rerun this queue until it prints "0 remaining"');

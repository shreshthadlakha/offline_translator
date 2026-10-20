// P2 queue runner: processes every routed single-pair small-model direction
// that does not yet have a completed result, until a deadline. Group-model
// directions and en->fr were run before this queue; run.mjs itself resumes
// partial runs, so a killed chunk never restarts from zero.
//
// Usage: bun scripts/benchmark/p2-queue.mjs [budgetSeconds]   (default 540)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_TABLE } from '../../src/lib/engines.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const deadline = Date.now() + Number(process.argv[2] ?? 540) * 1000;
// Never start a run that cannot plausibly finish: worst case seen ~300 s.
const RESERVE_MS = 320_000;

const pairs = Object.entries(ENGINE_TABLE)
  .filter(([, engine]) => !engine.group)
  .map(([pair]) => pair)
  .sort();

const results = JSON.parse(readFileSync(join(__dirname, 'benchmark-results.json'), 'utf8'));
const done = new Set(results.results.map((r) => r.runKey));

let remaining = 0;
for (const pair of pairs) {
  const [src, tgt] = pair.split('|');
  const engine = ENGINE_TABLE[pair];
  if (!done.has(`${src}-${tgt}#${engine.id}`)) remaining++;
}
console.log(`[queue] ${pairs.length} single-pair directions, ${remaining} remaining`);

for (const pair of pairs) {
  const [src, tgt] = pair.split('|');
  const engine = ENGINE_TABLE[pair];
  const runKey = `${src}-${tgt}#${engine.id}`;
  if (done.has(runKey)) continue;
  if (Date.now() + RESERVE_MS > deadline) {
    console.log(`[queue] deadline: stopping before ${runKey}`);
    break;
  }
  console.log(`\n=== [queue] ${runKey} ===`);
  const r = spawnSync('bun', ['scripts/benchmark/run.mjs', src, tgt], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 340_000,
    killSignal: 'SIGTERM',
  });
  if (r.status !== 0) console.error(`[queue] ${runKey} exited ${r.status ?? 'signal ' + r.signal}; state is kept, it will resume`);
}
console.log('\n[queue] pass finished');

// P2b: re-score every stored run with the new punctuation step + flag rules.
// Pure Node compute over the stored outputs (no model loads, resumable,
// idempotent): chrF++ on the app-visible (restored) text, sanity on raw output.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = '/home/z/my-project/scripts/benchmark/runs';
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
let ok = 0, bad = 0;
for (const f of files) {
  const state = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  if (!state.complete) { console.log(`SKIP incomplete: ${f}`); continue; }
  const engineFlag = state.engine.kind === 'nllb' ? 'full' : 'fast';
  const r = spawnSync('bun', ['scripts/benchmark/run.mjs', state.src, state.tgt, '--engine', engineFlag, '--score-only'], {
    cwd: '/home/z/my-project', encoding: 'utf8', timeout: 120_000,
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const complete = out.includes('COMPLETE');
  if (complete) ok++; else { bad++; console.log(`FAIL ${state.runKey}: ${out.split('\n').filter(Boolean).slice(-2).join(' | ')}`); }
}
console.log(`\nre-scored ${ok} runs, ${bad} failures of ${files.length} state files`);

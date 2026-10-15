// Queue for the remaining IndicTrans2 browser benchmark directions.
// Self-packs into chunks under the tool-call time limit; skips completed runs.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const langs = ['hin_Deva', 'asm_Beng', 'guj_Gujr', 'kan_Knda', 'mal_Mlym', 'mar_Deva', 'npi_Deva', 'ory_Orya', 'pan_Guru', 'tel_Telu'];
const directions = [];
for (const l of langs) { directions.push(['eng_Latn', l]); directions.push([l, 'eng_Latn']); }

const budgetMs = Number(process.argv[2] ?? 520_000);
const t0 = Date.now();
let done = 0;
for (const [src, tgt] of directions) {
  const runKey = `${src}-${tgt}#indictrans2-${src === 'eng_Latn' ? 'en-indic' : 'indic-en'}`;
  const statePath = join(HERE, 'runs', runKey.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
  if (existsSync(statePath)) {
    const st = JSON.parse(readFileSync(statePath, 'utf8'));
    if (st.complete) { done++; continue; }
  }
  if (Date.now() - t0 > budgetMs - 380_000) { console.log(`[queue] time budget nearly spent; rerun to continue (done ${done}/${directions.length})`); process.exit(0); }
  console.log(`\n[queue] === ${src}->${tgt} ===`);
  const r = spawnSync('bun', [join(HERE, 'run.mjs'), src, tgt, '--budget-seconds', String(Math.floor((budgetMs - (Date.now() - t0)) / 1000))], { stdio: 'inherit', timeout: budgetMs - (Date.now() - t0) });
  if (r.status !== 0 && r.status !== null) console.log(`[queue] run exited ${r.status} (state kept)`);
}
console.log(`\n[queue] all done: ${done + 0}/${directions.length} complete`);

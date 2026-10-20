// Queue for the P10 Bergamot benchmark: every candidate direction through the
// real app worker (CDP browser driver), 200 FLORES-200 devtest sentences each,
// fresh model download per direction so every row has its own cold load.
// Self-packs into chunks under the tool-call time limit; skips completed runs.
// Usage: node scripts/benchmark/bergamot-queue.mjs [budgetMs]
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

// Every direction whose current route is quarantined, full-model, or limited
// (no good small model), plus the languages that never had one at all.
const DIRECTIONS = [
  // Croatian and Serbian (Serbian to English shares the released hbs model)
  ['eng_Latn', 'hrv_Latn'], ['hrv_Latn', 'eng_Latn'],
  ['eng_Latn', 'srp_Cyrl'], ['srp_Cyrl', 'eng_Latn'],
  // Norwegian Bokmål
  ['eng_Latn', 'nob_Latn'], ['nob_Latn', 'eng_Latn'],
  // Bulgarian (to English currently fintutto borderline)
  ['eng_Latn', 'bul_Cyrl'], ['bul_Cyrl', 'eng_Latn'],
  // Greek (to English quarantined; English to Greek currently fintutto)
  ['eng_Latn', 'ell_Grek'], ['ell_Grek', 'eng_Latn'],
  // Romanian to English (quarantined; en->ro already passes on Opus-MT)
  ['ron_Latn', 'eng_Latn'],
  // Persian, Catalan, Malay: never had a small model
  ['eng_Latn', 'pes_Arab'], ['pes_Arab', 'eng_Latn'],
  ['eng_Latn', 'cat_Latn'], ['cat_Latn', 'eng_Latn'],
  ['eng_Latn', 'zsm_Latn'], ['zsm_Latn', 'eng_Latn'],
  // Vietnamese (en->vi quarantined; vi->en limited)
  ['eng_Latn', 'vie_Latn'], ['vie_Latn', 'eng_Latn'],
  // Ukrainian, Russian (limited routes both directions / to English)
  ['eng_Latn', 'ukr_Cyrl'], ['ukr_Cyrl', 'eng_Latn'],
  ['rus_Cyrl', 'eng_Latn'],
  // Japanese, Thai, Turkish (limited to English; from English on full model)
  ['eng_Latn', 'jpn_Jpan'], ['jpn_Jpan', 'eng_Latn'],
  ['eng_Latn', 'tha_Thai'], ['tha_Thai', 'eng_Latn'],
  ['eng_Latn', 'tur_Latn'], ['tur_Latn', 'eng_Latn'],
  // Afrikaans, Indonesian, Korean (limited to English)
  ['afr_Latn', 'eng_Latn'],
  ['ind_Latn', 'eng_Latn'],
  ['kor_Hang', 'eng_Latn'],
  // Traditional Chinese: never had a small model
  ['eng_Latn', 'zho_Hant'], ['zho_Hant', 'eng_Latn'],
];

const budgetMs = Number(process.argv[2] ?? 520_000);
const t0 = Date.now();
let done = 0;
for (const [src, tgt] of DIRECTIONS) {
  const runKey = `${src}-${tgt}#bergamot-*`;
  // The run key carries the pair-specific engine id; find any state file for
  // this direction+bergamot prefix.
  const stateDir = join(HERE, 'runs');
  const candidates = existsSync(stateDir)
    ? (await import('node:fs')).readdirSync(stateDir).filter((f) => f.startsWith(`${src}-${tgt}_bergamot-`))
    : [];
  let complete = false;
  for (const f of candidates) {
    const st = JSON.parse(readFileSync(join(stateDir, f), 'utf8'));
    if (st.complete) complete = true;
  }
  if (complete) { done++; continue; }
  if (Date.now() - t0 > budgetMs - 380_000) { console.log(`[queue] time budget nearly spent; rerun to continue (${done}/${DIRECTIONS.length} complete)`); process.exit(0); }
  console.log(`\n[queue] === ${src}->${tgt} ===`);
  const r = spawnSync('bun', [join(HERE, 'run.mjs'), src, tgt, '--engine', 'bergamot', '--budget-seconds', String(Math.floor((budgetMs - (Date.now() - t0)) / 1000))], { stdio: 'inherit', timeout: budgetMs - (Date.now() - t0) });
  if (r.status !== 0 && r.status !== null) console.log(`[queue] run exited ${r.status} (state kept)`);
  if (r.status === 0) done++;
}
console.log(`\n[queue] all done: ${done}/${DIRECTIONS.length} complete`);

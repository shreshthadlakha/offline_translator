// P2 quality table: one row per language and direction (every non-English
// registry language x {X->en, en->X}), scored against the published NLLB-200
// baseline and the P1 benchmark runs, with the verdict from quality-bar.mjs.
//
// Reads the app's own tables read-only (src/lib/engines.ts, src/lib/languages.ts)
// — the app is never changed. Every small-model number comes from a real
// browser-worker run in scripts/benchmark/benchmark-results.json; full-model
// rows carry the published baseline itself and no run.
//
// Usage: bun scripts/benchmark/quality-table.mjs
// Writes: scripts/benchmark/quality-table.md and quality-table.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_TABLE, NLLB_ENGINE, engineForPair } from '../../src/lib/engines.ts';
import { LANGUAGES } from '../../src/lib/languages.ts';
import { PASS_WITHIN_CHRF, BORDERLINE_WITHIN_CHRF, MAX_FLAG_RATE, CALIBRATION_OFFSET, verdictFor, selfTest } from './quality-bar.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

console.log('quality-bar self-test:', selfTest());

const { results } = JSON.parse(readFileSync(HERE('benchmark-results.json'), 'utf8'));
const byRunKey = new Map(results.map((r) => [r.runKey, r]));
const baseline = JSON.parse(readFileSync(HERE('published-baseline.json'), 'utf8'));

// The full model's own P1 local runs, kept as provenance for the 5 directions
// where the local-vs-published calibration was measured.
const fullModelLocalRuns = results
  .filter((r) => r.engine.kind === 'nllb')
  .map((r) => ({ pair: `${r.pair.src}->${r.pair.tgt}`, chrfpp: r.chrfpp.corpus, published: r.published?.chrfpp ?? null, delta: r.published?.delta ?? null, flagRate: r.sanity.flagRate }));

const ENG = 'eng_Latn';
const rows = [];
const languages = LANGUAGES.filter((l) => l.code !== ENG);

function buildRow(lang, src, tgt) {
  const engine = engineForPair(src, tgt, true); // the app's routing with fast models on
  const direction = src === ENG ? `en->${lang.code}` : `${lang.code}->en`;
  const published = src === ENG ? baseline.languages[lang.code].engToX : baseline.languages[lang.code].xToEn;

  if (engine.kind === 'nllb') {
    return {
      language: { code: lang.code, english: lang.english },
      direction, src, tgt,
      engine: { id: engine.id, kind: 'nllb', modelId: engine.modelId, group: false, langTag: null },
      modelSizeBytes: engine.expectedBytes,
      chrfpp: published, chrfppSource: 'published-baseline (no run; the full model is the bar)',
      baselineChrfpp: published, baselineSource: 'published',
      gap: null,
      flagRate: null, flagCounts: null, flaggedSentences: null, nSentences: null,
      loadColdSeconds: null, medianSecondsPerSentence: null, speedSource: null,
      verdict: 'baseline',
      verdictReason: 'the full model defines the bar; its published chrF++ is the reference number',
    };
  }

  const runKey = `${src}-${tgt}#${engine.id}`;
  const r = byRunKey.get(runKey);
  if (!r) {
    return {
      language: { code: lang.code, english: lang.english },
      direction, src, tgt,
      engine: { id: engine.id, kind: engine.kind, modelId: engine.modelId, group: !!engine.group, langTag: engine.tag ?? null },
      modelSizeBytes: engine.expectedBytes,
      chrfpp: null, chrfppSource: 'not run', baselineChrfpp: published, baselineSource: 'published',
      gap: null, flagRate: null, flagCounts: null, flaggedSentences: null, nSentences: null,
      loadColdSeconds: null, medianSecondsPerSentence: null, speedSource: null,
      verdict: 'error',
      verdictReason: `no completed benchmark run for ${runKey}`,
    };
  }

  const local = r.chrfpp.corpus;
  const gap = Number((local + CALIBRATION_OFFSET - published).toFixed(2));
  const flagRate = r.sanity.flagRate;
  const verdict = verdictFor(gap, flagRate);
  const flagCounts = Object.entries(r.sanity.counts).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ');
  const reasons = [];
  reasons.push(gap >= 0 ? `chrF++ ${gap >= 0 ? '+' : ''}${gap} vs published baseline` : `chrF++ ${gap} (${Math.abs(gap) > PASS_WITHIN_CHRF ? (Math.abs(gap) > BORDERLINE_WITHIN_CHRF ? 'more than' : 'within') : 'within'} ${Math.abs(gap) > PASS_WITHIN_CHRF ? BORDERLINE_WITHIN_CHRF : PASS_WITHIN_CHRF} of the bar)`);
  if (flagRate != null) reasons.push(flagRate <= MAX_FLAG_RATE ? `flags ${(flagRate * 100).toFixed(1)}% <= ${MAX_FLAG_RATE * 100}%` : `flags ${(flagRate * 100).toFixed(1)}% > ${MAX_FLAG_RATE * 100}% (${flagCounts})`);

  return {
    language: { code: lang.code, english: lang.english },
    direction, src, tgt,
    engine: { id: engine.id, kind: engine.kind, modelId: engine.modelId, group: !!engine.group, langTag: engine.tag ?? null },
    modelSizeBytes: engine.expectedBytes,
    chrfpp: local, chrfppSource: `browser-worker run, ${r.nSentences} FLORES-200 devtest sample sentences`,
    baselineChrfpp: published, baselineSource: 'published',
    gap,
    flagRate, flagCounts: r.sanity.counts, flaggedSentences: r.sanity.flaggedSentences, nSentences: r.nSentences,
    loadColdSeconds: r.mode === 'browser' && r.speed.loadMsCold != null ? Number((r.speed.loadMsCold / 1000).toFixed(1)) : null,
    medianSecondsPerSentence: r.speed.medianSecondsPerSentence,
    speedSource: r.mode === 'browser' ? 'browser-worker (the real app worker bundle)' : 'node-harness',
    verdict,
    verdictReason: reasons.join('; '),
  };
}

for (const lang of languages) {
  rows.push(buildRow(lang, lang.code, ENG)); // X -> en
  rows.push(buildRow(lang, ENG, lang.code)); // en -> X
}

// --- verdict counts (small-model directions only) ------------------------------------
const smallRows = rows.filter((r) => r.engine.kind !== 'nllb');
const counts = { pass: 0, borderline: 0, fail: 0, error: 0 };
for (const r of smallRows) counts[r.verdict]++;

// --- list 1: languages on a small model that are borderline or fail -------------------
const byLang = new Map();
for (const r of smallRows) {
  if (r.verdict === 'pass') continue;
  if (!byLang.has(r.language.code)) byLang.set(r.language.code, { english: r.language.english, directions: [] });
  byLang.get(r.language.code).directions.push({
    direction: r.direction, engine: r.engine.id, verdict: r.verdict,
    chrfpp: r.chrfpp, baseline: r.baselineChrfpp, gap: r.gap,
    flagRate: r.flagRate, flagged: r.flaggedSentences, n: r.nSentences,
  });
}
const list1 = [...byLang.entries()]
  .map(([code, v]) => ({ code, english: v.english, directions: v.directions.sort((a, b) => a.direction.localeCompare(b.direction)) }))
  .sort((a, b) => a.english.localeCompare(b.english));

// --- list 2: languages with no small model at all ------------------------------------
const list2 = languages
  .filter((lang) => engineForPair(lang.code, ENG, true).kind === 'nllb' && engineForPair(ENG, lang.code, true).kind === 'nllb')
  .map((lang) => ({ code: lang.code, english: lang.english }))
  .sort((a, b) => a.english.localeCompare(b.english));

// --- machine file --------------------------------------------------------------------
const table = {
  generatedAt: new Date().toISOString(),
  bar: {
    file: 'scripts/benchmark/quality-bar.mjs',
    constants: { PASS_WITHIN_CHRF, BORDERLINE_WITHIN_CHRF, MAX_FLAG_RATE, CALIBRATION_OFFSET },
    rule: `pass: gap >= -${PASS_WITHIN_CHRF} AND flagRate <= ${MAX_FLAG_RATE}; fail: gap < -${BORDERLINE_WITHIN_CHRF}; otherwise borderline (including a chrF-pass gap with a flag breach); gap = local chrF++ + CALIBRATION_OFFSET - published baseline; full-model rows are 'baseline' (the bar itself)`,
    calibrationNote: 'P1 measured the local harness vs published on the same full model at a stable -1.38 chrF++ (greedy q8, 200 of 1012 sentences vs Meta full-devtest eval); CALIBRATION_OFFSET=0 keeps the literal published comparison',
  },
  sample: { size: 200, seed: 42, source: 'FLORES-200 devtest (Meta, CC-BY-SA 4.0), fixed ids shared across every language and direction' },
  reference: 'FLORES-200 devtest professional human translations',
  rows,
  counts: { ...counts, baseline: rows.length - smallRows.length, totalSmallDirections: smallRows.length },
  list1BorderlineOrFailOnSmallModels: list1,
  list2NoSmallModelAtAll: list2,
  fullModelLocalRuns,
};
writeFileSync(HERE('quality-table.json'), JSON.stringify(table, null, 2) + '\n');

// --- human file ----------------------------------------------------------------------
const mb = (bytes) => `${(bytes / 1e6).toFixed(0)} MB`;
const f = (v, digits = 2) => (v == null ? '—' : v.toFixed(digits));
const lines = [];
lines.push('# Quality table — every engine the app routes, scored against professional human translation');
lines.push('');
lines.push(`Generated ${table.generatedAt.slice(0, 10)} from the P1 benchmark: 200 fixed FLORES-200 devtest sentences (seed 42, the same ids for every language and direction), chrF++ scored against the professional human references, run through the real browser worker bundle. The baseline is the full model's own published chrF++ (NLLB-200 distilled 600M, model-card metrics). Nothing typed or translated left the device.`);
lines.push('');
lines.push(`**The bar** (\`scripts/benchmark/quality-bar.mjs\`, all constants adjustable): a small model **passes** a direction when its chrF++ is within ${PASS_WITHIN_CHRF} points of the published baseline (or higher) **and** at most ${MAX_FLAG_RATE * 100}% of sentences carry a sanity flag; within ${BORDERLINE_WITHIN_CHRF} points is **borderline**; more than ${BORDERLINE_WITHIN_CHRF} below is **fail**. A chrF-pass gap with a flag breach is borderline, not fail — the flag review showed the high-flag passes (en->ar 15.5%, en->zh 17.5%) are mostly missing final punctuation rather than broken output. Full-model rows are **baseline**: the full model is the bar, so it gets no run and no verdict.`);
lines.push('');
lines.push(`**Calibration**: P1 measured this local harness against the published numbers on the same model: a stable -1.38 chrF++ offset (greedy q8, 200 of 1012 sentences, vs Meta's full-devtest eval). CALIBRATION_OFFSET is 0 here, so gaps are the literal published comparison — a small model exactly as good as the full model reads about -1.4 and still passes.`);
lines.push('');
lines.push(`**How to read the speed columns**: cold load and median seconds per sentence for small models come from the real browser worker path (one fresh model download per direction, one sentence at a time — what a user actually experiences). Full-model rows have no run: this 4 GB sandbox's browser cannot load the 600M model; five directions have P1 Node-harness local numbers at the bottom.`);
lines.push('');
lines.push('CJK directions have naturally low chrF++ (published en->zh is 19.6): the gap vs baseline is what counts, never the absolute number.');
lines.push('');
lines.push(`**Verdicts across the ${smallRows.length} routed small-model directions: ${counts.pass} pass, ${counts.borderline} borderline, ${counts.fail} fail${counts.error ? `, ${counts.error} error` : ''}.** Plus ${table.counts.baseline} full-model baseline rows (one per remaining language direction).`);
lines.push('');
lines.push('| Language | Direction | Engine | Model | chrF++ | Baseline | Gap | Flags | Cold load | Median s/sent | Verdict |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const flagCell = r.flagRate != null ? `${(r.flagRate * 100).toFixed(1)}% (${r.flaggedSentences}/${r.nSentences})` : '—';
  const engineName = r.engine.id + (r.engine.group ? ' (group)' : '');
  lines.push(`| ${r.language.english} | ${r.direction} | ${engineName} | ${mb(r.modelSizeBytes)} | ${f(r.chrfpp)} | ${f(r.baselineChrfpp)} | ${r.gap != null ? (r.gap > 0 ? '+' : '') + r.gap.toFixed(2) : '—'} | ${flagCell} | ${r.loadColdSeconds != null ? r.loadColdSeconds + ' s' : '—'} | ${f(r.medianSecondsPerSentence, 3)} | **${r.verdict}** |`);
}
lines.push('');
lines.push(`## List 1 — languages on a small model that are borderline or fail (${list1.length})`);
lines.push('');
lines.push('A quality problem today: the app routes these directions to a small model that does not clear the bar. Each entry shows the direction, the engine, the verdict, the chrF++ vs the published baseline, and the flag rate.');
lines.push('');
for (const l of list1) {
  const dir = l.directions.map((d) => `\`${d.direction}\` (${d.engine}): **${d.verdict}**, chrF++ ${d.chrfpp} vs ${d.baseline} (gap ${d.gap > 0 ? '+' : ''}${d.gap})${d.flagRate != null ? `, flags ${(d.flagRate * 100).toFixed(1)}%` : ''}`).join('  \n');
  lines.push(`- **${l.english}** (${l.code}):  \n${dir}`);
}
lines.push('');
lines.push(`## List 2 — languages with no small model at all (${list2.length})`);
lines.push('');
lines.push('Every direction routes to the full model (the honest heavy path, ~912 MB download). These are coverage gaps, not quality failures: the full model is the bar itself.');
lines.push('');
lines.push(list2.map((l) => `${l.english} (${l.code})`).join(', '));
lines.push('');
if (fullModelLocalRuns.length) {
  lines.push('## Full model — P1 local runs (provenance only)');
  lines.push('');
  lines.push('The five directions where the full model itself was run locally in the P1 Node harness, showing the local-vs-published calibration:');
  lines.push('');
  for (const r of fullModelLocalRuns) {
    lines.push(`- ${r.pair}: local ${r.chrfpp} vs published ${r.published} (delta ${r.delta > 0 ? '+' : ''}${r.delta}, flags ${(r.flagRate * 100).toFixed(1)}%)`);
  }
  lines.push('');
}
lines.push('## Notes on the borderline-by-flags directions');
lines.push('');
lines.push('- **en->ar (opus-en-ar)** and **en->zh (opus-en-zh)** clear the chrF bar (en->zh is +2.7 *above* the published baseline) but flag on 15.5% / 17.5% of sentences. Reviewed by hand: most of those flags are a missing final period or a missing final 。, not lost content; en->zh also has 3 wrong-script sentences and 7 length-ratio flags. For context, the full model\'s own local en->zho_Hans run in P1 flagged 36.5% (greedy early stops are endemic to this direction) and scored 17.72 vs the small model\'s 22.32 — on this pair the fast route is the *better* option on both signals.');
lines.push('- **Hindi (both directions)** is the clearest quality failure among the single-pair models: clause dropping, hallucinated content ("escaped marriage in Nepal" became India), repeat loops and mass truncation on news-domain sentences; -22.9 (en->hi) and -18.2 (hi->en) against the baseline.');
lines.push('- **The two mul group models** fail every direction they serve (gaps -9.3 to -19.0): half the sentences truncate mid-word into Croatian/Bulgarian/Serbian/Norwegian. The language audit kept them on ten conversational sentences against the full model\'s output; the professional human references overturn that. The Romance group model is materially better (en->por -2.5, por->en -4.8, both borderline; ron->en -7.8 fails).');
lines.push('');
writeFileSync(HERE('quality-table.md'), lines.join('\n') + '\n');

console.log(`rows: ${rows.length} (${smallRows.length} small + ${rows.length - smallRows.length} baseline)`);
console.log(`verdicts: ${counts.pass} pass, ${counts.borderline} borderline, ${counts.fail} fail${counts.error ? `, ${counts.error} error` : ''}`);
console.log(`list 1 (small-model borderline/fail): ${list1.length} languages`);
console.log(`list 2 (no small model at all): ${list2.length} languages`);
console.log('wrote scripts/benchmark/quality-table.md and quality-table.json');

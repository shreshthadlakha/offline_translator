// Store the published NLLB-200-distilled-600M per-direction chrF++ scores on
// FLORES-200 devtest, for every language in the app's registry, both
// directions. Source: the file the model card itself links to
// (https://huggingface.co/facebook/nllb-200-distilled-600M ->
// tinyurl.com/nllb200densedst600mmetrics ->
// dl.fbaipublicfiles.com/large_objects/nllb/models/nllb_200_dense_distill_600m/metrics.csv),
// already downloaded to scripts/benchmark/data/.
//
// Usage: bun scripts/benchmark/published-baseline.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { LANGUAGES } from '../../src/lib/languages.ts';

const CSV = 'scripts/benchmark/data/nllb-200-distilled-600m-metrics.csv';
const OUT = 'scripts/benchmark/published-baseline.json';

const rows = readFileSync(CSV, 'utf8').trim().split('\n').slice(1);
const dirMap = new Map();
for (const line of rows) {
  const [direction, score] = line.split(',');
  dirMap.set(direction, Number(score));
}

const languages = {};
const missing = [];
for (const { code, english } of LANGUAGES) {
  if (code === 'eng_Latn') continue;
  const engToX = dirMap.get(`eng_Latn-${code}`);
  const xToEn = dirMap.get(`${code}-eng_Latn`);
  if (engToX == null || xToEn == null) missing.push(code);
  languages[code] = { english, engToX, xToEn };
}

if (missing.length) {
  console.error(`MISSING published scores for: ${missing.join(', ')}`);
  process.exit(1);
}

const out = {
  model: 'facebook/nllb-200-distilled-600M',
  metric: 'chrF++ on FLORES-200 devtest (published, corpus level)',
  source: {
    url: 'https://dl.fbaipublicfiles.com/large_objects/nllb/models/nllb_200_dense_distill_600m/metrics.csv',
    via: 'linked from the model card as https://tinyurl.com/nllb200densedst600mmetrics',
    fetchedAt: new Date().toISOString(),
    rows: rows.length,
  },
  languages,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

const n = Object.keys(languages).length;
const engToXVals = Object.values(languages).map((v) => v.engToX).sort((a, b) => a - b);
const xToEnVals = Object.values(languages).map((v) => v.xToEn).sort((a, b) => a - b);
const q = (arr, p) => arr[Math.floor(arr.length * p)];
console.log(`published-baseline.json: ${n} languages x 2 directions (csv rows: ${rows.length})`);
console.log(`eng->X: min ${engToXVals[0]} / median ${q(engToXVals, 0.5)} / max ${engToXVals[engToXVals.length - 1]}`);
console.log(`X->eng: min ${xToEnVals[0]} / median ${q(xToEnVals, 0.5)} / max ${xToEnVals[xToEnVals.length - 1]}`);

// Benchmark report: every completed run in benchmark-results.json against the
// published NLLB-200 baseline where one exists, with sanity flags always in
// view. Usage: bun scripts/benchmark/report.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

const resultsPath = HERE('benchmark-results.json');
if (!existsSync(resultsPath)) {
  console.error('no benchmark-results.json yet; run: bun scripts/benchmark/run.mjs <src> <tgt>');
  process.exit(1);
}
const { results } = JSON.parse(readFileSync(resultsPath, 'utf8'));
const baseline = JSON.parse(readFileSync(HERE('published-baseline.json'), 'utf8'));

console.log(`benchmark runs: ${results.length}\n`);
const fmt = (v) => (v == null ? '    -' : v.toFixed(1).padStart(5));
console.log('run                                   chrF++  publc  delta  flags       median s  load');
console.log('--------------------------------------------------------------------------------------------------------');
for (const r of results) {
  const flags = `${r.sanity.flaggedSentences}/${r.nSentences}`;
  const med = r.speed.medianSecondsPerSentence != null ? r.speed.medianSecondsPerSentence.toFixed(2) + 's' : '-';
  const load = r.mode === 'browser'
    ? `cold ${(r.speed.loadMsCold / 1000).toFixed(0)}s / warm ${(r.speed.loadMsWarmMedian / 1000).toFixed(0)}s`
    : `node ${r.speed.loadSeconds}s`;
  console.log(
    `${r.runKey.padEnd(38)}${fmt(r.chrfpp.corpus)}  ${fmt(r.published?.chrfpp ?? null)}  ${fmt(r.published?.delta ?? null)}  ${flags.padEnd(11)} ${med.padEnd(9)}  ${load}`,
  );
}

const nllbRuns = results.filter((r) => r.engine.kind === 'nllb' && r.published);
if (nllbRuns.length) {
  console.log(`\nfull-model check vs published (NLLB-200 distilled 600M, chrF++ on FLORES-200 devtest):`);
  let sumDelta = 0;
  for (const r of nllbRuns) {
    sumDelta += r.published.delta;
    console.log(`  ${r.pair.src}->${r.pair.tgt}: local ${r.chrfpp.corpus} vs published ${r.published.chrfpp} (delta ${r.published.delta > 0 ? '+' : ''}${r.published.delta}, flags ${r.sanity.flaggedSentences}/${r.nSentences})`);
  }
  console.log(`  mean delta: ${(sumDelta / nllbRuns.length).toFixed(2)} chrF++ points across ${nllbRuns.length} directions`);
}

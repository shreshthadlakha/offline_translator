// Quality gate step 2: run ONE small opus-mt model over its 10 sentences.
// Usage: node scripts/quality-gate/run-model.mjs <pairKey> [tag]
// Prints one JSON line on stdout; all logs go to stderr.
// The process exits after the run so memory is fully released.
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

const pairKey = process.argv[2];
const tag = process.argv[3] || 'run';
if (!pairKey) { console.error('usage: run-model.mjs <pairKey> [tag]'); process.exit(2); }

env.cacheDir = HERE('.cache');
try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

const models = JSON.parse(readFileSync(HERE('models.json'), 'utf8'));
const testSets = JSON.parse(readFileSync(HERE('test-sets.json'), 'utf8'));
const cand = models.candidates.find((c) => c.pair === pairKey);
if (!cand) { console.error(`unknown pair ${pairKey}`); process.exit(2); }

const progress = (p) => {
  if (p.status === 'progress' && p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    if (pct % 25 === 0) console.error(`[${pairKey}] download ${p.file} ${pct}%`);
  } else if (p.status === 'done') {
    console.error(`[${pairKey}] cached ${p.file}`);
  }
};

console.error(`[${pairKey}] loading ${cand.modelId} (q8)...`);
const t0 = performance.now();
const translator = await pipeline('translation', cand.modelId, {
  dtype: 'q8',
  progress_callback: progress,
});
const loadTimeSeconds = (performance.now() - t0) / 1000;
console.error(`[${pairKey}] loaded in ${loadTimeSeconds.toFixed(2)}s`);

const texts = testSets[cand.testSet];
const perSentenceSeconds = [];
const outputs = [];
for (let i = 0; i < texts.length; i++) {
  const s = performance.now();
  // Marian (opus-mt) takes NO language options.
  const result = await translator(texts[i], { max_new_tokens: 256 });
  const dt = (performance.now() - s) / 1000;
  perSentenceSeconds.push(Number(dt.toFixed(3)));
  outputs.push(result[0].translation_text);
  console.error(`[${pairKey}] #${i + 1} (${dt.toFixed(2)}s) -> ${JSON.stringify(result[0].translation_text)}`);
}

const sorted = [...perSentenceSeconds].sort((a, b) => a - b);
const median = (sorted[4] + sorted[5]) / 2;

const result = {
  tag,
  pair: cand.pair,
  modelId: cand.modelId,
  srcLang: cand.srcLang,
  tgtLang: cand.tgtLang,
  testSet: cand.testSet,
  loadTimeSeconds: Number(loadTimeSeconds.toFixed(3)),
  perSentenceSeconds,
  medianSecondsPerSentence: Number(median.toFixed(3)),
  outputs,
};
console.log(JSON.stringify(result));
process.exit(0);

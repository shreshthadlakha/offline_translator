// Quality gate step 1: generate NLLB reference translations for all 21 directions.
// MUST run alone (no other heavy process): loads Xenova/nllb-200-distilled-600M q8
// (steady RSS ~1.8GB, peak during load ~2.8GB in this sandbox).
// Run: MALLOC_ARENA_MAX=2 node scripts/quality-gate/generate-nllb-references.mjs
// Resumable: completed directions are kept in nllb-references.json and skipped.
import { writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

// Keep all model files under scripts/quality-gate/.cache
env.cacheDir = HERE('.cache');
// Prefer being the OOM victim over the dev server if memory runs out.
try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

const models = JSON.parse(readFileSync(HERE('models.json'), 'utf8'));
const testSets = JSON.parse(readFileSync(HERE('test-sets.json'), 'utf8'));
const directions = models.candidates.map((c) => ({
  pair: c.pair,
  srcLang: c.srcLang,
  tgtLang: c.tgtLang,
  testSet: c.testSet,
}));

// Guard against partial downloads left by a killed run (they poison the cache
// because the file cache treats any existing file as complete).
const MIN_BYTES = {
  'onnx/encoder_model_quantized.onnx': 400_000_000,
  'onnx/decoder_model_merged_quantized.onnx': 450_000_000,
};
for (const [rel, min] of Object.entries(MIN_BYTES)) {
  const p = join(env.cacheDir, 'Xenova', 'nllb-200-distilled-600M', rel);
  if (existsSync(p)) {
    const size = statSync(p).size;
    if (size < min) {
      console.error(`[nllb] deleting partial ${rel} (${size} bytes < ${min})`);
      unlinkSync(p);
    }
  }
}

// Resume: keep already completed directions.
const out = existsSync(HERE('nllb-references.json'))
  ? JSON.parse(readFileSync(HERE('nllb-references.json'), 'utf8'))
  : {
      modelId: models.fullModel.modelId,
      dtype: models.fullModel.dtype,
      generatedAt: new Date().toISOString(),
      maxNewTokens: 256,
      directions: [],
    };
if (out.directions?.length) {
  console.error(`[nllb] resuming with ${out.directions.length} directions already done`);
}
const remaining = directions.filter((d) => !out.directions.some((x) => x.pair === d.pair));

const progress = (p) => {
  if (p.status === 'progress' && p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    if (pct % 10 === 0) console.error(`[nllb] download ${p.file} ${pct}%`);
  } else if (p.status === 'done') {
    console.error(`[nllb] cached ${p.file}`);
  }
};

if (remaining.length === 0) {
  console.error('[nllb] nothing to do, all directions already present');
  process.exit(0);
}

// Chunked mode: exit after MAX_DIRECTIONS directions so the process memory
// is fully released (the sandbox OOM-kills long-lived runs otherwise).
const maxDirections = Number(process.env.MAX_DIRECTIONS || 0);
const todo = maxDirections > 0 ? remaining.slice(0, maxDirections) : remaining;

console.error(`[nllb] loading ${models.fullModel.modelId} (${models.fullModel.dtype})...`);
const t0 = performance.now();
const translator = await pipeline('translation', models.fullModel.modelId, {
  dtype: models.fullModel.dtype,
  progress_callback: progress,
});
const loadTime = (performance.now() - t0) / 1000;
console.error(`[nllb] loaded in ${loadTime.toFixed(1)}s`);
out.loadTimeSeconds = Number(loadTime.toFixed(3));
out.generatedAt = new Date().toISOString();

const tStart = Date.now();
const memLine = (label) => {
  try {
    const rss = process.memoryUsage().rss;
    const avail = Number(readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+) kB/)[1]);
    console.error(`[nllb][mem] ${label} rss=${(rss / 1e6).toFixed(0)}MB available=${(avail / 1024).toFixed(0)}MB`);
  } catch {}
};
memLine('after-load');
for (const d of todo) {
  const texts = testSets[d.testSet];
  if (!texts || texts.length !== 10) throw new Error(`bad test set ${d.testSet}`);
  const outputs = [];
  for (let i = 0; i < texts.length; i++) {
    const result = await translator(texts[i], {
      src_lang: d.srcLang,
      tgt_lang: d.tgtLang,
      max_new_tokens: 256,
    });
    outputs.push(result[0].translation_text);
    if (i === 4) memLine(`${d.pair} mid`);
    console.error(`[nllb] ${d.pair} #${i + 1} -> ${JSON.stringify(result[0].translation_text)}`);
  }
  out.directions.push({ ...d, outputs });
  // Persist after every direction so a crash keeps completed work.
  writeFileSync(HERE('nllb-references.json'), JSON.stringify(out, null, 2) + '\n');
  const done = out.directions.length;
  const mins = ((Date.now() - tStart) / 60000).toFixed(1);
  console.error(`[nllb] direction ${d.pair} DONE (${done}/${directions.length}) after ${mins} min`);
}

console.error(`[nllb] ALL ${directions.length} DIRECTIONS DONE in ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(0);

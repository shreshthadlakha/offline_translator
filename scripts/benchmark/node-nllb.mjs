// Node harness that runs the FULL NLLB-200 distilled 600M model on the
// benchmark sample for one direction. The sandbox's browser cannot load this
// model (documented in the worklog: the page freezes during session creation
// at 4 GB RAM), so the full model's QUALITY runs here in Node. Its timing is
// recorded too, but honestly labeled "node-harness" — the app's speed numbers
// for small models come from the browser worker path instead.
//
// Resumable: reads the run state, translates only pending sentences, writes
// the state after EVERY sentence, stops when the time budget is spent.
// MUST run alone: peak memory ~2.8 GB. MALLOC_ARENA_MAX=2 is set by the parent.
//
// Usage: node scripts/benchmark/node-nllb.mjs <statePath> [budgetMs]
import { writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

const statePath = process.argv[2];
const budgetMs = Number(process.argv[3] ?? 480_000);
if (!statePath) { console.error('usage: node-nllb.mjs <statePath> [budgetMs]'); process.exit(2); }

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const { src, tgt, ids } = state;
const modelId = state.engine.modelId;

// Reuse the same cache location as the earlier Node reference runs.
env.cacheDir = ROOT('scripts/quality-gate/.cache');
try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

// Guard against partial downloads left by a killed run.
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

// FLORES source sentences for this direction.
const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) => readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
const srcLines = flores(src);
const sources = new Map(ids.map((id) => [id, srcLines[id]]));

const pending = ids.filter((id) => state.outputs[id] === undefined && state.errors?.[id] === undefined);
console.error(`[nllb] ${src}->${tgt}: ${pending.length} pending of ${ids.length}`);

const progress = (p) => {
  if (p.status === 'progress' && p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    if (pct % 10 === 0) console.error(`[nllb] download ${p.file} ${pct}%`);
  }
};

const hadCache = existsSync(join(env.cacheDir, 'Xenova', 'nllb-200-distilled-600M', 'onnx', 'decoder_model_merged_quantized.onnx'));
console.error(`[nllb] loading ${modelId} (q8)... cache=${hadCache}`);
const t0 = performance.now();
const translator = await pipeline('translation', modelId, {
  dtype: 'q8',
  progress_callback: progress,
  // Same session trimming the app's worker uses; does not change outputs.
  session_options: {
    enableCpuMemArena: false,
    graphOptimizationLevel: 'basic',
    enableMemPattern: false,
  },
});
const loadSeconds = (performance.now() - t0) / 1000;
console.error(`[nllb] loaded in ${loadSeconds.toFixed(1)}s`);
state.nodeLoadSeconds = Number(loadSeconds.toFixed(3));
if (!hadCache) state.nodeDownloadSeconds = Number(loadSeconds.toFixed(3));
state.updatedAt = new Date().toISOString();

const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
persist();

const tStart = Date.now();
let done = 0;
for (const id of pending) {
  if (Date.now() - tStart > budgetMs) {
    console.error(`[nllb] budget spent after ${done} sentences`);
    break;
  }
  const text = sources.get(id);
  const s0 = performance.now();
  try {
    const result = await translator(text, { src_lang: src, tgt_lang: tgt, max_new_tokens: 256 });
    state.outputs[id] = result[0].translation_text;
    state.perSentenceMs[id] = Math.round(performance.now() - s0);
  } catch (e) {
    state.outputs[id] = null;
    state.errors[id] = String(e?.message ?? e);
  }
  persist();
  done++;
  if (done % 10 === 0) console.error(`[nllb] ${done}/${pending.length} (${((Date.now() - tStart) / 60000).toFixed(1)} min)`);
}

const complete = ids.every((id) => state.outputs[id] !== undefined);
state.complete = complete;
state.updatedAt = new Date().toISOString();
persist();
console.error(`[nllb] chunk done: ${done} translated, complete=${complete}`);
process.exit(0);

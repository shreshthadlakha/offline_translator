// P3a comparison harness: Xenova/m2m100_418M (q8) on the same 6 directions,
// through the same pipeline path node-nllb.mjs uses. m2m100 is the only other
// browser-ready multilingual candidate covering Urdu/Tamil/Bengali.
//
// Usage: node scripts/benchmark/node-m2m100.mjs <state.json> [budgetMs]
import { writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

const statePath = process.argv[2];
const budgetMs = Number(process.argv[3] ?? 480_000);
if (!statePath) { console.error('usage: node-m2m100.mjs <state.json> [budgetMs]'); process.exit(2); }

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const { src, tgt, ids } = state;

// m2m100 uses short codes
const M2M = { eng_Latn: 'en', urd_Arab: 'ur', tam_Taml: 'ta', ben_Beng: 'bn' };
const srcLang = M2M[src], tgtLang = M2M[tgt];

env.cacheDir = ROOT('scripts/quality-gate/.cache');
try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

// Guard against partial downloads left by a killed run.
const MIN_BYTES = {
  'onnx/encoder_model_quantized.onnx': 250_000_000,
  'onnx/decoder_model_merged_quantized.onnx': 300_000_000,
};
for (const [rel, min] of Object.entries(MIN_BYTES)) {
  const p = join(env.cacheDir, 'Xenova', 'm2m100_418M', rel);
  if (existsSync(p)) {
    const size = statSync(p).size;
    if (size < min) {
      console.error(`[m2m] deleting partial ${rel} (${size} bytes < ${min})`);
      unlinkSync(p);
    }
  }
}

const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) => readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
const srcLines = flores(src);
const sources = new Map(ids.map((id) => [id, srcLines[id]]));

const pending = ids.filter((id) => state.outputs[id] === undefined && state.errors?.[id] === undefined);
console.error(`[m2m] ${src}->${tgt}: ${pending.length} pending of ${ids.length}`);

const hadCache = existsSync(join(env.cacheDir, 'Xenova', 'm2m100_418M', 'onnx', 'decoder_model_merged_quantized.onnx'));
console.error(`[m2m] loading Xenova/m2m100_418M (q8)... cache=${hadCache}`);
const t0 = performance.now();
const translator = await pipeline('translation', 'Xenova/m2m100_418M', {
  dtype: 'q8',
  session_options: {
    enableCpuMemArena: false,
    graphOptimizationLevel: 'basic',
    enableMemPattern: false,
  },
});
const loadSeconds = (performance.now() - t0) / 1000;
console.error(`[m2m] loaded in ${loadSeconds.toFixed(1)}s`);
state.loadSeconds = Number(loadSeconds.toFixed(3));
if (!hadCache) state.downloadSeconds = Number(loadSeconds.toFixed(3));
state.updatedAt = new Date().toISOString();
const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
persist();

const tStart = Date.now();
let done = 0;
for (const id of pending) {
  if (Date.now() - tStart > budgetMs) {
    console.error(`[m2m] budget spent after ${done} sentences`);
    break;
  }
  const text = sources.get(id);
  const s0 = performance.now();
  try {
    const result = await translator(text, { src_lang: srcLang, tgt_lang: tgtLang, max_new_tokens: 256 });
    state.outputs[id] = { raw: result[0].translation_text, final: result[0].translation_text };
    state.perSentenceMs[id] = Math.round(performance.now() - s0);
  } catch (e) {
    state.outputs[id] = null;
    state.errors[id] = String(e?.message ?? e);
  }
  persist();
  done++;
  if (done % 10 === 0) console.error(`[m2m] ${done}/${pending.length} (${((Date.now() - tStart) / 60000).toFixed(1)} min)`);
}

try {
  const status = readFileSync('/proc/self/status', 'utf8');
  const m = /VmHWM:\s+(\d+) kB/.exec(status);
  if (m) state.peakRssMB = Number((Number(m[1]) / 1024).toFixed(1));
} catch {}

const complete = ids.every((id) => state.outputs[id] !== undefined);
state.complete = complete;
state.updatedAt = new Date().toISOString();
persist();
console.error(`[m2m] chunk done: ${done} translated, complete=${complete}, peakRSS=${state.peakRssMB ?? '?'}MB`);
process.exit(0);

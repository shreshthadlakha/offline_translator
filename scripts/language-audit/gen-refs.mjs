// Language audit: generate NLLB-200 references and source test sets for the
// new directions (single-pair + group model candidates).
// MUST run alone (no other heavy process): loads NLLB q8 (peak ~2.8GB).
// Resumable: progress is kept in scripts/language-audit/nllb-refs-new.json.
// Run: MALLOC_ARENA_MAX=2 node scripts/language-audit/gen-refs.mjs
import { writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
// Reuse the already-downloaded NLLB files from the quality gate cache.
env.cacheDir = join(__dirname, '..', 'quality-gate', '.cache');
try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

const ENGLISH_SET = JSON.parse(readFileSync(HERE('../quality-gate/test-sets.json'), 'utf8')).en;

// Registry languages by NLLB code (short key = NLLB code here).
const NEW_LANGS = [
  'afr_Latn', 'amh_Ethi', 'asm_Beng', 'ben_Beng', 'bul_Cyrl', 'cat_Latn',
  'zho_Hant', 'ces_Latn', 'dan_Latn', 'ell_Grek', 'fin_Latn', 'guj_Gujr',
  'hau_Latn', 'heb_Hebr', 'hun_Latn', 'ind_Latn', 'kan_Knda', 'kor_Hang',
  'zsm_Latn', 'mal_Mlym', 'mar_Deva', 'npi_Deva', 'nob_Latn', 'ory_Orya',
  'pbt_Arab', 'pes_Arab', 'pol_Latn', 'por_Latn', 'pan_Guru', 'ron_Latn',
  'sin_Sinh', 'swh_Latn', 'swe_Latn', 'tam_Taml', 'tel_Telu', 'ukr_Cyrl',
  'vie_Latn', 'yor_Latn', 'zul_Latn', 'hrv_Latn', 'srp_Cyrl', 'tha_Thai',
  'jpn_Jpan', 'tur_Latn', 'urd_Arab',
];

const BATCH = process.argv.includes('--batch');

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

const statePath = HERE('nllb-refs-new.json');
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : {
      modelId: 'Xenova/nllb-200-distilled-600M',
      dtype: 'q8',
      generatedAt: new Date().toISOString(),
      maxNewTokens: 256,
      batch: BATCH,
      sources: {},      // NLLB code -> 10 sentences in that language
      enToX: {},        // NLLB code -> 10 reference outputs (same as sources)
      xToEn: {},        // NLLB code -> 10 reference outputs (English)
    };

const progress = (p) => {
  if (p.status === 'progress' && p.total) {
    const pct = Math.round((p.loaded / p.total) * 100);
    if (pct % 10 === 0) console.error(`[nllb] download ${p.file} ${pct}%`);
  }
};

console.error(`[nllb] loading ${state.modelId} (${state.dtype})...`);
const t0 = performance.now();
const translator = await pipeline('translation', state.modelId, {
  dtype: state.dtype,
  progress_callback: progress,
  // Same trimming the app's worker uses: smaller session creation peak.
  // These options do not change outputs.
  session_options: {
    enableCpuMemArena: false,
    graphOptimizationLevel: 'basic',
    enableMemPattern: false,
  },
});
console.error(`[nllb] loaded in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
state.loadTimeSeconds = Number(((performance.now() - t0) / 1000).toFixed(3));

const tStart = Date.now();
const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');

async function translateAll(texts, src, tgt) {
  if (BATCH) {
    const result = await translator(texts, { src_lang: src, tgt_lang: tgt, max_new_tokens: 256 });
    return result.map((r) => r.translation_text);
  }
  const outputs = [];
  for (const text of texts) {
    const result = await translator(text, { src_lang: src, tgt_lang: tgt, max_new_tokens: 256 });
    outputs.push(result[0].translation_text);
  }
  return outputs;
}

// Pass 1: en -> X for every new language (source sets AND en->X references).
for (const code of NEW_LANGS) {
  if (state.sources[code]) continue;
  const outputs = await translateAll(ENGLISH_SET, 'eng_Latn', code);
  state.sources[code] = outputs;
  state.enToX[code] = outputs;
  persist();
  console.error(`[nllb] en->${code} DONE (${outputs[0]?.slice(0, 40)}...) ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
}

// Pass 2: X -> English references from the generated sources.
for (const code of NEW_LANGS) {
  if (state.xToEn[code]) continue;
  const outputs = await translateAll(state.sources[code], code, 'eng_Latn');
  state.xToEn[code] = outputs;
  persist();
  console.error(`[nllb] ${code}->en DONE (${outputs[0]?.slice(0, 40)}...) ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
}

console.error(`[nllb] ALL DONE in ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(0);

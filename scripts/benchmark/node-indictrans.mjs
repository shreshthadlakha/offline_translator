// P3a Node harness for IndicTrans2 distilled 200M (ONNX int8, community
// export by hari31416, MIT). Follows the node-nllb.mjs pattern: resumable
// run state, per-sentence timing, honest labels. Drives the three ONNX
// sessions directly (encoder / decoder / decoder_with_past) in the greedy
// loop documented in the export's translate.py — the same seq2seq session
// pattern transformers.js uses, so the timing is representative of the
// onnxruntime-web worker path (same runtime engine, same session options as
// the app's worker).
//
// Pipeline per sentence (all in JS, all device-local):
//   raw FLORES line
//     -> IndicProcessor.preprocessWithMap  (the ported, golden-verified preprocessor)
//     -> NFC + fast tokenizer (transformers.js) + id clamping to the model dict
//     -> encoder -> greedy decoder loop (max_new_tokens 256)
//     -> Metaspace decode (exact Rust tokenizers semantics)
//     -> IndicProcessor.postprocessWithMap (golden-verified)
//
// Usage: node scripts/benchmark/node-indictrans.mjs <state.json> [budgetMs]
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ort = require('/home/z/my-project/node_modules/onnxruntime-node');
const tk = require('/home/z/my-project/node_modules/@huggingface/transformers');

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

const statePath = process.argv[2];
const budgetMs = Number(process.argv[3] ?? 480_000);
if (!statePath) { console.error('usage: node-indictrans.mjs <state.json> [budgetMs]'); process.exit(2); }

const state = JSON.parse(readFileSync(statePath, 'utf8'));
const { src, tgt, ids } = state;
const modelDir = state.modelDir; // absolute path to the int8 bundle
const meta = JSON.parse(readFileSync(join(modelDir, 'tokenizer_meta.json'), 'utf8'));
const SRC_DICT = meta.src_dict_size, TGT_DICT = meta.tgt_dict_size, UNK_ID = meta.unk_id;
const EOS_ID = 2, DEC_START = 2;

try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch {}

// --- tokenizer (transformers.js, PreTrainedTokenizer via shim dirs) -----------
const srcTok = await tk.AutoTokenizer.from_pretrained(join(modelDir, 'tok-src'));
const tgtTok = await tk.AutoTokenizer.from_pretrained(join(modelDir, 'tok-tgt'));
// tgt id -> token map restricted to the model's real dict (verified against
// dict.TGT.json: identical for all ids < TGT_DICT)
const tgtTokJson = JSON.parse(readFileSync(join(modelDir, 'tokenizer_tgt.json'), 'utf8'));
const tgtAdded = new Set(tgtTokJson.added_tokens.map((t) => t.id));
// BPE vocab is a {token: id} object — invert to id -> token (array).
const tgtVocab = [];
for (const [tok, id] of Object.entries(tgtTokJson.model.vocab)) {
  tgtVocab[id] = tok;
}

// --- decoder (exact Rust tokenizers Metaspace semantics, verified) ------------
function decodeIds(ids) {
  const pieces = [];
  for (const id of ids) {
    if (tgtAdded.has(id)) continue; // </s>, <s>, <pad>, <unk>
    if (id === UNK_ID) continue; // translate.py clamps OOV to unk, then skips it
    const tok = tgtVocab[id]; // ids < TGT_DICT always have a token
    if (tok === undefined) continue;
    pieces.push(tok);
  }
  return pieces.map((p) => p.replaceAll('\u2581', ' ')).join('').trim();
}

// --- ONNX sessions --------------------------------------------------------------
const sessionOptions = {
  enableCpuMemArena: false,
  graphOptimizationLevel: 'basic',
  enableMemPattern: false,
};
const t0 = performance.now();
const enc = await ort.InferenceSession.create(join(modelDir, 'encoder_model.onnx'), sessionOptions);
const dec = await ort.InferenceSession.create(join(modelDir, 'decoder_model.onnx'), sessionOptions);
const decPast = await ort.InferenceSession.create(join(modelDir, 'decoder_with_past_model.onnx'), sessionOptions);
const loadSeconds = (performance.now() - t0) / 1000;
console.error(`[it2] sessions loaded in ${loadSeconds.toFixed(1)}s`);
state.loadSeconds = Number(loadSeconds.toFixed(3));

// --- IndicProcessor (the golden-verified JS port) --------------------------------
const { IndicProcessor } = await import(HERE('indic-processor.mjs'));
const ip = new IndicProcessor();

// --- FLORES sources ---------------------------------------------------------------
const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) =>
  readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
const srcLines = flores(src);
const sources = new Map(ids.map((id) => [id, srcLines[id]]));

const pending = ids.filter((id) => state.outputs[id] === undefined && state.errors?.[id] === undefined);
console.error(`[it2] ${src}->${tgt}: ${pending.length} pending of ${ids.length}`);

const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
state.updatedAt = new Date().toISOString();
persist();

function argmax(arr, off, len) {
  let best = -Infinity, bestI = 0;
  for (let i = 0; i < len; i++) {
    const v = arr[off + i];
    if (v > best) { best = v; bestI = i; }
  }
  return bestI;
}

async function encode(text) {
  const encIds = await srcTok(text);
  const raw = Array.from(encIds.input_ids.data, Number);
  const clamped = raw.map((i) => (i < SRC_DICT ? i : UNK_ID));
  const idsT = new ort.Tensor('int64', BigInt64Array.from(clamped, (x) => BigInt(x)), [1, clamped.length]);
  const mask = new ort.Tensor('int64', BigInt64Array.from(new Array(clamped.length).fill(1n)), [1, clamped.length]);
  return { idsT, mask };
}

async function greedyTranslate(text, maxNewTokens = 256) {
  const { idsT, mask } = await encode(text);
  const encOut = await enc.run({ input_ids: idsT, attention_mask: mask });
  const encHidden = encOut.last_hidden_state;

  let inputIds = new ort.Tensor('int64', BigInt64Array.from([BigInt(DEC_START)]), [1, 1]);
  let past = null;
  const outIds = [];
  for (let step = 0; step < maxNewTokens; step++) {
    let res;
    if (step === 0) {
      res = await dec.run({
        input_ids: inputIds,
        encoder_attention_mask: mask,
        encoder_hidden_states: encHidden,
      });
    } else {
      const feed = { input_ids: inputIds, encoder_attention_mask: mask };
      let k = 0;
      for (let i = 0; i < 18; i++) {
        feed[`past_key_values.${i}.decoder.key`] = past[k++];
        feed[`past_key_values.${i}.decoder.value`] = past[k++];
        feed[`past_key_values.${i}.encoder.key`] = past[k++];
        feed[`past_key_values.${i}.encoder.value`] = past[k++];
      }
      res = await decPast.run(feed);
    }
    const logits = res.logits; // [1, curLen, vocab]
    const dims = logits.dims;
    const vocab = dims[dims.length - 1];
    const off = ((dims[0] * dims[1] - 1) * vocab) | 0;
    const nextId = argmax(logits.data, off, vocab);
    if (nextId === EOS_ID) break;
    outIds.push(nextId);
    past = dec.outputNames.slice(1).map((n) => res[n]);
    inputIds = new ort.Tensor('int64', BigInt64Array.from([BigInt(nextId)]), [1, 1]);
  }
  return decodeIds(outIds);
}

const tStart = Date.now();
let done = 0;
for (const id of pending) {
  if (Date.now() - tStart > budgetMs) {
    console.error(`[it2] budget spent after ${done} sentences`);
    break;
  }
  const raw = sources.get(id);
  const s0 = performance.now();
  try {
    const pre = ip.preprocessWithMap(raw, src, tgt);
    const nfc = pre.text.normalize('NFC');
    const rawDecoded = await greedyTranslate(nfc, 256);
    const final = ip.postprocessWithMap(rawDecoded, tgt, pre.map);
    state.outputs[id] = { raw: rawDecoded, final };
    state.perSentenceMs[id] = Math.round(performance.now() - s0);
  } catch (e) {
    state.outputs[id] = null;
    state.errors[id] = String(e?.message ?? e);
  }
  persist();
  done++;
  if (done % 10 === 0) console.error(`[it2] ${done}/${pending.length} (${((Date.now() - tStart) / 60000).toFixed(1)} min)`);
}

// peak RSS from /proc (VmHWM)
try {
  const status = readFileSync('/proc/self/status', 'utf8');
  const m = /VmHWM:\s+(\d+) kB/.exec(status);
  if (m) state.peakRssMB = Number((Number(m[1]) / 1024).toFixed(1));
} catch {}

const complete = ids.every((id) => state.outputs[id] !== undefined);
state.complete = complete;
state.updatedAt = new Date().toISOString();
persist();
console.error(`[it2] chunk done: ${done} translated, complete=${complete}, peakRSS=${state.peakRssMB ?? '?'}MB`);
process.exit(0);

// P3a tokenizer fidelity check: transformers.js (JS) vs tokenizers (Python/Rust)
// on the benchmark's real sentences, both encode (src side) and decode (tgt side).
// Usage: node scripts/benchmark/p3a-tok-fidelity.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tk = require('/home/z/my-project/node_modules/@huggingface/transformers');

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const MDIR = join(__dirname, 'models', 'indictrans2-en-indic-int8');

const flores = (code) => readFileSync(HERE(`data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));

const srcTok = await tk.AutoTokenizer.from_pretrained(join(MDIR, 'tok-src'));
const tgtTok = await tk.AutoTokenizer.from_pretrained(join(MDIR, 'tok-tgt'));

const out = { encode: {}, decode: {} };

// --- encode: English sources with tags, and Indic sources with tags (raw, for shape) ---
for (const [key, code, pair] of [
  ['en', 'eng_Latn', 'eng_Latn urd_Arab'],
  ['ur', 'urd_Arab', 'urd_Arab eng_Latn'],
  ['ta', 'tam_Taml', 'tam_Taml eng_Latn'],
  ['bn', 'ben_Beng', 'ben_Beng eng_Latn'],
]) {
  const lines = flores(code);
  const ids = [];
  for (const i of sample.ids) {
    const enc = await srcTok(`${pair} ${lines[i]}`);
    ids.push(Array.from(enc.input_ids.data, Number));
  }
  out.encode[key] = ids;
}

// --- decode: token ids taken from real reference sentences encoded on the tgt side ---
// For en->indic: tgt = indic. For indic->en: tgt = english.
for (const [key, code] of [['indic-ur', 'urd_Arab'], ['indic-ta', 'tam_Taml'], ['indic-bn', 'ben_Beng'], ['en', 'eng_Latn']]) {
  const lines = flores(code);
  const decs = [];
  for (const i of sample.ids.slice(0, 50)) {
    // tgt side tokenizer without lang tags (like model output)
    const enc = await tgtTok(lines[i]);
    const ids = Array.from(enc.input_ids.data, Number).filter((x) => x !== 2); // drop eos template
    const dec = tgtTok.decode(ids, { skip_special_tokens: true });
    decs.push({ ids, dec });
  }
  out.decode[key] = decs;
}

writeFileSync('/tmp/p3a/js-tok.json', JSON.stringify(out));
console.log('wrote /tmp/p3a/js-tok.json');

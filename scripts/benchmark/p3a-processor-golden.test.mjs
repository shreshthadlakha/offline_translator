// P3a golden-diff: JS IndicProcessor port vs the compiled Python IndicTransToolkit
// on the 6 benchmark directions x 200 FLORES sentences.
// Usage: node scripts/benchmark/p3a-processor-golden.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndicProcessor } from './indic-processor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

const golden = JSON.parse(readFileSync(HERE('p3a-golden-pre.json'), 'utf8'));
const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) =>
  readFileSync(HERE(`data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');

const DIRECTIONS = {
  'en-ur': ['eng_Latn', 'urd_Arab'],
  'ur-en': ['urd_Arab', 'eng_Latn'],
  'en-ta': ['eng_Latn', 'tam_Taml'],
  'ta-en': ['tam_Taml', 'eng_Latn'],
  'en-bn': ['eng_Latn', 'ben_Beng'],
  'bn-en': ['ben_Beng', 'eng_Latn'],
};

const ip = new IndicProcessor();
let total = 0, identical = 0;
const failures = [];

for (const [dkey, [src, tgt]] of Object.entries(DIRECTIONS)) {
  const lines = flores(src);
  let ok = 0;
  for (const id of sample.ids) {
    const g = golden[dkey][String(id)].pre;
    const mine = ip.preprocessWithMap(lines[id], src, tgt).text;
    total += 1;
    if (mine === g) { ok += 1; identical += 1; }
    else if (failures.length < 12) failures.push({ dkey, id, g: g.slice(0, 140), mine: mine.slice(0, 140) });
  }
  console.log(`${dkey}: ${ok}/200 identical`);
}

console.log(`\nTOTAL: ${identical}/${total}`);
if (failures.length) {
  console.log('\nfirst diffs:');
  for (const f of failures) {
    console.log(`  [${f.dkey} id ${f.id}]`);
    console.log(`    golden: ${JSON.stringify(f.g)}`);
    console.log(`    mine  : ${JSON.stringify(f.mine)}`);
  }
}
process.exit(identical === total ? 0 : 1);

// Benchmark sample: 200 of the 1012 FLORES-200 devtest sentences, chosen with
// a fixed seed so every language and every direction sees exactly the same
// sentences. FLORES devtest files are line-aligned across languages, so the
// line index is the sentence id.
//
// Deterministic: mulberry32(42) drives a Fisher-Yates shuffle of the 1012
// indices; the first 200 (kept in FLORES order) are the sample.
//
// Usage: bun scripts/benchmark/sample.mjs   (writes scripts/benchmark/sample.json)
import { readFileSync, writeFileSync } from 'node:fs';

const FLORES_DEVTEST = 'scripts/benchmark/data/flores200_dataset/devtest';
const SEED = 42;
const SIZE = 200;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function floresLines(code) {
  const raw = readFileSync(`${FLORES_DEVTEST}/${code}.devtest`, 'utf8');
  const lines = raw.replace(/\n$/, '').split('\n');
  if (lines.length !== 1012) throw new Error(`${code}.devtest has ${lines.length} lines, expected 1012`);
  return lines;
}

const eng = floresLines('eng_Latn');
const rnd = mulberry32(SEED);
const idx = Array.from({ length: 1012 }, (_, i) => i);
for (let i = idx.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [idx[i], idx[j]] = [idx[j], idx[i]];
}
const ids = idx.slice(0, SIZE).sort((a, b) => a - b);

const sample = {
  source: 'FLORES-200 devtest (Meta, CC-BY-SA 4.0), line-aligned across languages',
  seed: SEED,
  size: SIZE,
  ids,
  english: ids.map((i) => eng[i]),
};

writeFileSync('scripts/benchmark/sample.json', JSON.stringify(sample, null, 2) + '\n');
console.log(`sample.json: ${SIZE} ids, seed ${SEED}, min ${ids[0]} max ${ids[ids.length - 1]}`);
console.log(`first: ${JSON.stringify(eng[ids[0]].slice(0, 80))}`);
console.log(`last:  ${JSON.stringify(eng[ids[ids.length - 1]].slice(0, 80))}`);

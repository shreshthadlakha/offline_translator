// P2c Task 1 — measure BEFORE any heavy run: for each panel direction,
// tokenize the 200 human reference translations with the model's OWN
// tokenizer (the same tokenizer.json the worker loads), and compare their
// lengths with the token limit the app would grant the matching source
// sentence. Reports the share of references that would NOT fit.
//
// "Fit" = reference tokens + 1 (the EOS slot generation needs to finish
// naturally) <= the variant's max_new_tokens limit. The group engine's
// sources carry the ">>hrv<<" tag, exactly like the worker's budget code
// (it tokenizes the tagged text).
//
// Tokenizers are downloaded from the Hugging Face hub into
// scripts/benchmark/.cache-tok (public model files; no benchmark content is
// ever uploaded — privacy applies to what people type, and FLORES references
// are public data the app never sees anyway).
//
// Usage: bun scripts/benchmark/token-fit.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoTokenizer, env } from '@huggingface/transformers';
import { ENGINE_TABLE } from '../../src/lib/engines.ts';
import { PANEL, tokenLimitFor } from './variants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

env.allowLocalModels = false;
env.cacheDir = HERE('.cache-tok');
mkdirSync(env.cacheDir, { recursive: true });

const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) => readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');

const out = { measuredAt: new Date().toISOString(), fitRule: 'refTokens + 1 (EOS) <= limit', directions: [] };

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const share = (a, f) => Number((a.filter(f).length / a.length).toFixed(3));

console.log('direction            engine             srcTok  refTok  limitA  notFitA  limitB  notFitB');
for (const d of PANEL) {
  const pair = `${d.src}|${d.tgt}`;
  const engine = ENGINE_TABLE[pair];
  if (!engine) { console.error(`no engine for ${pair}`); process.exit(1); }
  const srcLines = flores(d.src);
  const refLines = flores(d.tgt);
  const tokenizer = await AutoTokenizer.from_pretrained(engine.modelId);
  const enc = (t) => tokenizer.encode(t, { add_special_tokens: false }).length;

  const rows = [];
  for (const id of sample.ids) {
    // The worker's budget code sees the tagged text for group models.
    const srcText = engine.tag ? `>>${engine.tag}<< ${srcLines[id]}` : srcLines[id];
    const srcTokens = enc(srcText);
    const refTokens = enc(refLines[id]);
    const limitA = tokenLimitFor('A', srcTokens);
    const limitB = tokenLimitFor('B', srcTokens);
    rows.push({
      id, srcTokens, refTokens, limitA, limitB,
      notFitA: refTokens + 1 > limitA,
      notFitB: refTokens + 1 > limitB,
      refLongerThanSrc: refTokens > srcTokens,
    });
  }

  const rec = {
    pair, engine: { id: engine.id, modelId: engine.modelId, tag: engine.tag ?? null },
    n: rows.length,
    medianSrcTokens: median(rows.map((r) => r.srcTokens)),
    medianRefTokens: median(rows.map((r) => r.refTokens)),
    medianLimitA: median(rows.map((r) => r.limitA)),
    medianLimitB: median(rows.map((r) => r.limitB)),
    shareNotFitA: share(rows, (r) => r.notFitA),
    shareNotFitB: share(rows, (r) => r.notFitB),
    shareRefLongerThanSrc: share(rows, (r) => r.refLongerThanSrc),
    rows,
  };
  out.directions.push(rec);
  console.log(
    `${d.src}->${d.tgt}`.padEnd(21) + `${engine.id}`.padEnd(18) +
    String(rec.medianSrcTokens).padEnd(8) + String(rec.medianRefTokens).padEnd(8) +
    String(rec.medianLimitA).padEnd(8) + `${(rec.shareNotFitA * 100).toFixed(1)}%`.padEnd(8) +
    String(rec.medianLimitB).padEnd(8) + `${(rec.shareNotFitB * 100).toFixed(1)}%`,
  );
}

writeFileSync(HERE('p2c-token-fit.json'), JSON.stringify(out, null, 2) + '\n');
console.log('\nwritten: scripts/benchmark/p2c-token-fit.json');

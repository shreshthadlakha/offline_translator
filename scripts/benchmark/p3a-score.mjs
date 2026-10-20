// P3a scorer: scores the IndicTrans2 (and m2m100 comparison) runs with the
// SAME P1/P2 scoring machinery — chrfpp.mjs, sanity.mjs, terminal-punct.ts,
// the published NLLB-600M baselines CSV, and quality-bar.verdictFor.
//
// Scoring semantics (mirrors run.mjs score() with one documented deviation):
//   chrF++ on restoreTerminalPunctuation(src, FINAL, tgt) — the app-visible
//   text, where FINAL is the IndicProcessor-postprocessed output.
//   Sanity flags on the FINAL text too: the raw decoded output is in unified
//   Devanagari for Tamil/Bengali targets, so raw-script flags are meaningless
//   there; the IndicTrans postprocess never ADDS a terminal mark, so
//   truncation evidence (endsMidWord, loops, lenRatio) survives on FINAL.
//
// Usage: node scripts/benchmark/p3a-score.mjs   -> writes p3a-results.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chrfppCorpus, chrfppCorpusLower, chrfppSentence } from './chrfpp.mjs';
import { sanityFlags } from './sanity.mjs';
import { restoreTerminalPunctuation } from '../../src/lib/terminal-punct.ts';
import { verdictFor } from './quality-bar.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

const floresLines = (code) =>
  readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');

function publishedFor(src, tgt) {
  const csv = readFileSync(HERE('data/nllb-200-distilled-600m-metrics.csv'), 'utf8').trim().split('\n').slice(1);
  for (const line of csv) {
    const [d, s] = line.split(',');
    if (d === `${src}-${tgt}`) return Number(s);
  }
  return null;
}

const MODELS = {
  'en-indic': { modelId: 'hari31416/indictrans2-en-indic-dist-200M-ONNX-int8', license: 'MIT (upstream ai4bharat, MIT)', weightsMB: 276.9, bundleMB: 318.0 },
  'indic-en': { modelId: 'hari31416/indictrans2-indic-en-dist-200M-ONNX-int8', license: 'MIT (upstream ai4bharat, MIT)', weightsMB: 231.9, bundleMB: 270.3 },
};

function scoreOne(statePath, engineLabel) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const refLines = floresLines(state.tgt);
  const srcLines = floresLines(state.src);
  const refs = state.ids.map((id) => refLines[id]);
  const srcs = state.ids.map((id) => srcLines[id]);
  const finals = state.ids.map((id) => state.outputs[id]?.final ?? '');
  const raws = state.ids.map((id) => state.outputs[id]?.raw ?? '');

  const hyps = finals.map((fin, i) => restoreTerminalPunctuation(srcs[i], fin, state.tgt));
  const punctuationRestored = finals.reduce((n, fin, i) => (hyps[i] !== fin ? n + 1 : n), 0);

  const corpus = chrfppCorpus(hyps, refs);
  const corpusLower = chrfppCorpusLower(hyps, refs);

  const flagCounts = { empty: 0, wrongScript: 0, repeatLoop: 0, lenRatio: 0, endsMidWord: 0, missingFinalPunct: 0 };
  const flagged = [];
  const perSentence = [];
  for (let i = 0; i < state.ids.length; i++) {
    const id = state.ids[i];
    const flags = sanityFlags(finals[i], refs[i], state.tgt);
    for (const f of flags) flagCounts[f]++;
    const qualityFlags = flags.filter((f) => f !== 'missingFinalPunct');
    const s = chrfppSentence(hyps[i], refs[i]);
    if (qualityFlags.length > 0 || state.errors[id]) flagged.push({ id, flags, score: Number(s.toFixed(1)) });
    perSentence.push(s);
  }
  const flaggedSentences = flagged.filter((f) => f.flags.some((x) => x !== 'missingFinalPunct')).length;
  const flagRate = Number((flaggedSentences / state.ids.length).toFixed(3));

  const ms = state.ids.map((id) => state.perSentenceMs[id]).filter((v) => typeof v === 'number' && v > 0).sort((a, b) => a - b);
  const medianMs = ms.length ? ms[Math.floor(ms.length / 2)] : null;
  const p90Ms = ms.length ? ms[Math.floor(ms.length * 0.9)] : null;

  const published = publishedFor(state.src, state.tgt);
  const gap = published != null ? Number((corpus - published).toFixed(2)) : null;
  const verdict = verdictFor(gap, flagRate);

  return {
    direction: `${state.src}->${state.tgt}`,
    engine: engineLabel,
    mode: 'node-harness (onnxruntime-node, greedy, int8 dynamic; same engine as the browser worker path)',
    nSentences: state.ids.length,
    sentenceErrors: Object.values(state.errors ?? {}).filter(Boolean).length,
    chrfpp: { corpus: Number(corpus.toFixed(2)), corpusLower: Number(corpusLower.toFixed(2)) },
    publishedBaselineChrfpp: published,
    gap,
    verdict,
    sanity: {
      counts: flagCounts,
      flaggedSentences,
      flagRate,
      missingFinalPunct: flagCounts.missingFinalPunct,
      punctuationRestored,
      flaggedDetails: flagged.slice(0, 12),
    },
    speed: {
      source: 'node-harness (representative of onnxruntime-web worker: same runtime, same session options)',
      medianSecondsPerSentence: medianMs != null ? Number((medianMs / 1000).toFixed(3)) : null,
      p90SecondsPerSentence: p90Ms != null ? Number((p90Ms / 1000).toFixed(3)) : null,
      loadSeconds: state.loadSeconds ?? null,
      peakRssMB: state.peakRssMB ?? null,
    },
    postprocessGoldenDiff: state.goldenDiff ?? null,
    scoredAt: new Date().toISOString(),
  };
}

const results = {
  scoredAt: new Date().toISOString(),
  engine: {
    name: 'IndicTrans2 distilled 200M (AI4Bharat, MIT)',
    onnxExport: 'hari31416/indictrans2-{en-indic,indic-en}-dist-200M-ONNX-int8 (MIT, dynamic int8)',
    models: MODELS,
    pipeline: 'JS port of IndicProcessor (golden-verified 1200/1200 preprocess, 1197/1200 postprocess; 3 diffs = the toolkit set-iteration nondeterminism on one sentence)',
    decoding: 'greedy, max_new_tokens 256 (the app has no beam search; the model card uses beams 5 — the P1/P2c -1.4 greedy-vs-published calibration applies)',
  },
  directions: [],
};

const ALL_KEYS = ['en-ur', 'ur-en', 'en-ta', 'ta-en', 'en-bn', 'bn-en', 'en-hi', 'hi-en', 'en-gu', 'gu-en', 'en-kn', 'kn-en', 'en-ml', 'ml-en', 'en-mr', 'mr-en', 'en-ne', 'ne-en', 'en-or', 'or-en', 'en-pa', 'pa-en', 'en-te', 'te-en', 'en-as', 'as-en'];
for (const key of ALL_KEYS) {
  const label = key.split('-')[1] === 'en' ? 'indictrans2-indic-en-dist-200M' : 'indictrans2-en-indic-dist-200M';
  results.directions.push(scoreOne(HERE(`models/p3a-run-${key}.json`), label));
}

// The one scored comparison candidate (m2m100): scored on en->ur only; its
// 10.5 s/sentence median and 640 MB q8 size disqualified benchmarking the rest.
results.m2m100Comparison = {
  engine: 'Xenova/m2m100_418M (q8, browser-ready)',
  note: 'scored on en->ur only; ~10.5 s/sentence median and 640 MB q8 bundle made the remaining directions not worth the hours (IndicTrans2: 0.5-0.6 s, 277 MB)',
  ...scoreOne(HERE('models/p3a-m2m-en-ur.json'), 'm2m100_418M'),
};

writeFileSync(HERE('p3a-results.json'), JSON.stringify(results, null, 2) + '\n');
for (const r of results.directions) {
  console.log(
    `${r.direction.padEnd(22)} chrF++ ${String(r.chrfpp.corpus).padStart(6)}  pub ${String(r.publishedBaselineChrfpp).padStart(6)}  gap ${(r.gap ?? '?').toFixed(2).padStart(7)}  flags ${String(r.sanity.flagRate).padEnd(5)}  ${r.verdict.toUpperCase()}  median ${(r.speed.medianSecondsPerSentence ?? 0).toFixed(3)}s`
  );
}
console.log('wrote p3a-results.json');

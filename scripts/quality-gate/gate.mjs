// Quality gate step 3: compare each candidate's outputs against the NLLB references
// and the source, apply the gate, write results.json.
// Usage: node scripts/quality-gate/gate.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

const models = JSON.parse(readFileSync(HERE('models.json'), 'utf8'));
const testSets = JSON.parse(readFileSync(HERE('test-sets.json'), 'utf8'));
const runs = JSON.parse(readFileSync(HERE('runs.json'), 'utf8'));
const refs = JSON.parse(readFileSync(HERE('nllb-references.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Script detection
// ---------------------------------------------------------------------------
const SCRIPT_RANGES = [
  ['latin', 0x0041, 0x005a], ['latin', 0x0061, 0x007a], ['latin', 0x00c0, 0x024f],
  ['latin', 0x1e00, 0x1eff], ['latin', 0x02c0, 0x02cf], ['latin', 0xa720, 0xa7ff],
  ['latin', 0xfb00, 0xfb06],
  ['cyrillic', 0x0400, 0x052f],
  ['han', 0x3400, 0x4dbf], ['han', 0x4e00, 0x9fff], ['han', 0xf900, 0xfaff],
  ['hiragana', 0x3041, 0x309f],
  ['katakana', 0x30a0, 0x30ff],
  ['arabic', 0x0600, 0x06ff], ['arabic', 0x0750, 0x077f], ['arabic', 0x08a0, 0x08ff],
  ['arabic', 0xfb50, 0xfdff], ['arabic', 0xfe70, 0xfeff],
  ['devanagari', 0x0900, 0x097f],
];

function classifyChar(cp) {
  for (const [name, lo, hi] of SCRIPT_RANGES) if (cp >= lo && cp <= hi) return name;
  return null;
}

function scriptProfile(text) {
  const counts = {};
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const isLetter = /\p{L}/u.test(ch);
    const isMark = /\p{M}/u.test(ch);
    if (!isLetter && !isMark) continue;
    const cls = classifyChar(cp);
    if (cls) counts[cls] = (counts[cls] || 0) + 1;
    else counts.other = (counts.other || 0) + 1;
    total++;
  }
  const fractions = {};
  for (const [k, v] of Object.entries(counts)) fractions[k] = v / total;
  return { counts, total, fractions };
}

function primaryScript(profile) {
  if (!profile.total) return null;
  let best = null, bestN = 0;
  for (const [k, v] of Object.entries(profile.counts)) {
    if (v > bestN) { best = k; bestN = v; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Terminal punctuation
// ---------------------------------------------------------------------------
const TERMINALS = new Set(['.', '!', '?', '…', '。', '！', '？', '।', '॥', '۔', '؟', '‼', '⁇', '⁈', '⁉', '!?']);
const CLOSERS = new Set(['"', "'", '”', '’', '«', '»', ')', ']', '}', '）', '」', '』', '】', '〕']);

function endsWithTerminalPunct(text) {
  let s = text.trim();
  while (s.length && CLOSERS.has(s[s.length - 1])) s = s.slice(0, -1);
  if (!s.length) return false;
  return TERMINALS.has(s[s.length - 1]);
}

// ---------------------------------------------------------------------------
// Degenerate repetition
// ---------------------------------------------------------------------------
function maxConsecutiveBlocks(units, L) {
  // max number of consecutive equal L-unit blocks, over all alignment offsets
  if (units.length < L) return 1;
  let best = 1;
  for (let off = 0; off < L; off++) {
    let cur = 1;
    for (let i = off + L; i + L <= units.length; i += L) {
      let same = true;
      for (let j = 0; j < L; j++) {
        if (units[i + j] !== units[i - L + j]) { same = false; break; }
      }
      if (same) { cur++; if (cur > best) best = cur; } else cur = 1;
    }
  }
  return best;
}

function detectRepetition(text) {
  const t = text.trim();
  // token-level (spaced scripts)
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    for (let L = 1; L <= 6; L++) {
      const reps = maxConsecutiveBlocks(tokens, L);
      if (reps >= 3) return { repeated: true, kind: `word phrase (${L} word${L > 1 ? 's' : ''}) repeated ${reps}x` };
    }
  }
  // char-level (CJK: no spaces)
  if (tokens.length === 1) {
    const chars = Array.from(t);
    for (let L = 2; L <= 4; L++) {
      const reps = maxConsecutiveBlocks(chars, L);
      if (reps >= 3) return { repeated: true, kind: `char phrase (${L} chars) repeated ${reps}x` };
    }
    let run = 1, bestRun = 1;
    for (let i = 1; i < chars.length; i++) {
      if (chars[i] === chars[i - 1]) { run++; if (run > bestRun) bestRun = run; } else run = 1;
    }
    if (bestRun >= 4) return { repeated: true, kind: `single char repeated ${bestRun}x` };
  }
  return { repeated: false };
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------
const TARGET_RULES = {
  rus_Cyrl: { script: 'cyrillic', minFrac: 0.5 },
  zho_Hans: { script: 'han', minFrac: 0.5 },
  jpn_Jpan: { script: 'kana', minKana: 2 },
  arb_Arab: { script: 'arabic', minFrac: 0.5 },
  hin_Deva: { script: 'devanagari', minFrac: 0.5 },
  eng_Latn: { script: 'latin', minFrac: 0.5 },
};

const LATIN_TARGETS = new Set(['fra_Latn', 'spa_Latn', 'deu_Latn', 'ita_Latn', 'nld_Latn']);

function gateModel(cand, run, refOutputs, sourceTexts) {
  const failures = [];
  const outputs = run?.outputs;

  if (!Array.isArray(outputs) || outputs.length !== 10) {
    failures.push({ criterion: 'RUN_ERROR', sentenceIndex: null, detail: run?.error || 'no outputs recorded' });
    return { pass: false, failures };
  }

  // EMPTY
  outputs.forEach((o, i) => {
    if (!o || !String(o).trim()) {
      failures.push({ criterion: 'EMPTY', sentenceIndex: i + 1, detail: 'output is empty or whitespace' });
    }
  });

  // REPEATED (degenerate loops)
  outputs.forEach((o, i) => {
    const r = detectRepetition(String(o));
    if (r.repeated) {
      failures.push({ criterion: 'REPEATED', sentenceIndex: i + 1, detail: `${r.kind}: "${String(o).slice(0, 80)}"` });
    }
  });

  // REPEATED (same output for 4+ different inputs)
  const counts = {};
  outputs.forEach((o) => {
    const k = String(o).trim();
    counts[k] = (counts[k] || 0) + 1;
  });
  for (const [k, n] of Object.entries(counts)) {
    if (n >= 4) {
      failures.push({ criterion: 'REPEATED', sentenceIndex: null, detail: `same output for ${n} different inputs: "${k.slice(0, 60)}"` });
    }
  }

  // TRUNCATED
  outputs.forEach((o, i) => {
    const out = String(o).trim();
    const ref = String(refOutputs[i] ?? '').trim();
    if (!out || !ref) return;
    const outPunct = endsWithTerminalPunct(out);
    const refPunct = endsWithTerminalPunct(ref);
    if (!outPunct && refPunct) {
      const outLen = Array.from(out).length;
      const refLen = Array.from(ref).length;
      if (outLen < 0.6 * refLen) {
        failures.push({
          criterion: 'TRUNCATED', sentenceIndex: i + 1,
          detail: `ends without punctuation, ${outLen} chars vs reference ${refLen} (${Math.round((outLen / refLen) * 100)}%): "${out.slice(0, 60)}"`,
        });
      }
    }
  });

  // WRONG LANGUAGE
  const tgtRule = TARGET_RULES[cand.tgtLang];
  outputs.forEach((o, i) => {
    const out = String(o).trim();
    if (!out) return;
    const prof = scriptProfile(out);

    if (tgtRule?.script === 'kana') {
      const kana = (prof.counts.hiragana || 0) + (prof.counts.katakana || 0);
      if (kana < tgtRule.minKana) {
        failures.push({ criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1, detail: `Japanese output contains no kana (kana chars: ${kana})` });
      }
    } else if (tgtRule) {
      const frac = prof.fractions[tgtRule.script] || 0;
      if (frac < tgtRule.minFrac) {
        failures.push({
          criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1,
          detail: `target ${cand.tgtLang} needs ${tgtRule.script} >= ${Math.round(tgtRule.minFrac * 100)}% of letters, got ${Math.round(frac * 100)}%`,
        });
      }
    }

    // Latin echo check for en->X latin targets
    if (LATIN_TARGETS.has(cand.tgtLang)) {
      const src = String(sourceTexts[i]).trim().toLowerCase();
      if (out.toLowerCase() === src) {
        failures.push({ criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1, detail: 'output identical to the English source (echo)' });
      }
    }

    // Script mismatch vs the NLLB reference
    const ref = String(refOutputs[i] ?? '').trim();
    if (ref) {
      const refProf = scriptProfile(ref);
      const outPrimary = primaryScript(prof);
      if (outPrimary && refProf.total) {
        const refFracOfOutPrimary = refProf.fractions[outPrimary] || 0;
        if (refFracOfOutPrimary < 0.1) {
          failures.push({
            criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1,
            detail: `output script ${outPrimary} is <10% of the NLLB reference's letters`,
          });
        }
      }
    }
  });

  return { pass: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
const results = {
  generatedAt: new Date().toISOString(),
  reference: { modelId: refs.modelId, dtype: refs.dtype, generatedAt: refs.generatedAt },
  gate: {
    drop: 'any of EMPTY / REPEATED / TRUNCATED / WRONG_LANGUAGE',
    truncated: 'no terminal punctuation while reference has it AND output < 60% of reference length (code points)',
    wrongLanguage: 'script fractions over letters (Latin/Cyrillic/Han/Arabic/Devanagari >= 50%, Japanese >= 2 kana), Latin echo check for en->X, and primary output script < 10% of reference letters',
  },
  models: [],
};

for (const cand of models.candidates) {
  const run = runs.models[cand.pair];
  const refDir = refs.directions.find((d) => d.pair === cand.pair);
  const refOutputs = refDir?.outputs;
  const sourceTexts = testSets[cand.testSet];
  const gated = gateModel(cand, run?.run2, refOutputs, sourceTexts);

  results.models.push({
    pair: cand.pair,
    modelId: cand.modelId,
    srcLang: cand.srcLang,
    tgtLang: cand.tgtLang,
    testSet: cand.testSet,
    pass: gated.pass,
    failures: gated.failures,
    outputs: Array.isArray(run?.run2?.outputs) ? run.run2.outputs : null,
    loadTimeSeconds: run?.run2?.loadTimeSeconds ?? null,           // from disk cache
    coldLoadTimeSeconds: run?.run1?.loadTimeSeconds ?? null,       // includes download
    perSentenceSeconds: run?.run2?.perSentenceSeconds ?? null,
    medianSecondsPerSentence: run?.run2?.medianSecondsPerSentence ?? null,
    outputsIdenticalAcrossRuns: run?.outputsIdenticalAcrossRuns ?? null,
  });
}

writeFileSync(HERE('results.json'), JSON.stringify(results, null, 2) + '\n');

const passed = results.models.filter((m) => m.pass).length;
console.log(`gate: ${passed}/${results.models.length} models pass`);
for (const m of results.models) {
  if (!m.pass) {
    console.log(`FAIL ${m.pair} (${m.modelId}):`);
    for (const f of m.failures) console.log(`   ${f.criterion} ${f.sentenceIndex ? 'sentence ' + f.sentenceIndex : ''} ${f.detail}`);
  } else {
    console.log(`pass ${m.pair} (${m.modelId}) load ${m.loadTimeSeconds}s median ${m.medianSecondsPerSentence}s/sentence`);
  }
}

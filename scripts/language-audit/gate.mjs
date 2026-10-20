// Language audit quality gate: compare every browser-run pair output against
// the NLLB-200 references and the source, using the same criteria as the
// shipped fast-pair gate (EMPTY / REPEATED / TRUNCATED / WRONG_LANGUAGE),
// with script rules for every language family in the registry.
// Usage: node scripts/language-audit/gate.mjs
import { writeFileSync, readFileSync } from 'node:fs';

const runs = JSON.parse(readFileSync('scripts/language-audit/browser-runs.json', 'utf8'));
const refs = JSON.parse(readFileSync('scripts/language-audit/nllb-refs-new.json', 'utf8'));

// --- script detection ------------------------------------------------------------
const SCRIPT_RANGES = [
  ['latin', 0x0041, 0x005a], ['latin', 0x0061, 0x007a], ['latin', 0x00c0, 0x024f],
  ['latin', 0x1e00, 0x1eff], ['latin', 0x02c0, 0x02cf], ['latin', 0xa720, 0xa7ff],
  ['latin', 0xfb00, 0xfb06], ['latin', 0x0591, 0x05c7],
  ['cyrillic', 0x0400, 0x052f],
  ['han', 0x3400, 0x4dbf], ['han', 0x4e00, 0x9fff], ['han', 0xf900, 0xfaff],
  ['hiragana', 0x3041, 0x309f],
  ['katakana', 0x30a0, 0x30ff],
  ['hangul', 0xac00, 0xd7af], ['hangul', 0x1100, 0x11ff],
  ['arabic', 0x0600, 0x06ff], ['arabic', 0x0750, 0x077f], ['arabic', 0x08a0, 0x08ff],
  ['arabic', 0xfb50, 0xfdff], ['arabic', 0xfe70, 0xfeff],
  ['hebrew', 0x05d0, 0x05ea], ['hebrew', 0x05b0, 0x05c9],
  ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff],
  ['gurmukhi', 0x0a00, 0x0a7f],
  ['gujarati', 0x0a80, 0x0aff],
  ['oriya', 0x0b00, 0x0b7f],
  ['tamil', 0x0b80, 0x0bff],
  ['telugu', 0x0c00, 0x0c7f],
  ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f],
  ['sinhala', 0x0d80, 0x0dff],
  ['thai', 0x0e00, 0x0e7f],
  ['lao', 0x0e80, 0x0eff],
  ['tibetan', 0x0f00, 0x0fff],
  ['myanmar', 0x1000, 0x109f],
  ['georgian', 0x10a0, 0x10ff],
  ['ethiopic', 0x1200, 0x139f],
  ['cherokee', 0x13a0, 0x13ff],
  ['khmer', 0x1780, 0x17ff],
  ['mongolian', 0x1800, 0x18af],
  ['latin-ext', 0x1e00, 0x1eff],
  ['greek', 0x0370, 0x03ff], ['greek', 0x1f00, 0x1fff],
  ['armenian', 0x0530, 0x058f],
  ['thaana', 0x0780, 0x07bf],
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

// --- repetition -------------------------------------------------------------------
function maxConsecutiveBlocks(units, L) {
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
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    for (let L = 1; L <= 6; L++) {
      const reps = maxConsecutiveBlocks(tokens, L);
      if (reps >= 3) return { repeated: true, kind: `word phrase (${L}) repeated ${reps}x` };
    }
  }
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

// --- terminal punctuation -----------------------------------------------------------
const TERMINALS = new Set(['.', '!', '?', '…', '。', '！', '？', '।', '॥', '۔', '؟', '‼', '⁇', '⁈', '⁉', '!?']);
const CLOSERS = new Set(['"', "'", '”', '’', '«', '»', ')', ']', '}', '）', '」', '』', '】', '〕']);

function endsWithTerminalPunct(text) {
  let s = text.trim();
  while (s.length && CLOSERS.has(s[s.length - 1])) s = s.slice(0, -1);
  if (!s.length) return false;
  return TERMINALS.has(s[s.length - 1]);
}

// --- per-language rules ---------------------------------------------------------------
// The script each registry language is written in (for script fraction checks).
const LANG_SCRIPT = {
  amh_Ethi: 'ethiopic', asm_Beng: 'bengali', ben_Beng: 'bengali', bul_Cyrl: 'cyrillic',
  cat_Latn: 'latin', zho_Hant: 'han', zho_Hans: 'han', hrv_Latn: 'latin',
  ces_Latn: 'latin', dan_Latn: 'latin', ell_Grek: 'greek', fin_Latn: 'latin',
  guj_Gujr: 'gujarati', hau_Latn: 'latin', heb_Hebr: 'hebrew', hun_Latn: 'latin',
  ind_Latn: 'latin', kan_Knda: 'kannada', kor_Hang: 'hangul', zsm_Latn: 'latin',
  mal_Mlym: 'malayalam', mar_Deva: 'devanagari', npi_Deva: 'devanagari',
  nob_Latn: 'latin', ory_Orya: 'oriya', pbt_Arab: 'arabic', pes_Arab: 'arabic',
  por_Latn: 'latin', pan_Guru: 'gurmukhi', ron_Latn: 'latin', rus_Cyrl: 'cyrillic',
  srp_Cyrl: 'cyrillic', sin_Sinh: 'sinhala', swh_Latn: 'latin', swe_Latn: 'latin',
  tam_Taml: 'tamil', tel_Telu: 'telugu', tha_Thai: 'thai', tur_Latn: 'latin',
  ukr_Cyrl: 'cyrillic', urd_Arab: 'arabic', vie_Latn: 'latin', yor_Latn: 'latin',
  zul_Latn: 'latin', afr_Latn: 'latin', eng_Latn: 'latin', jpn_Jpan: 'kana',
  fra_Latn: 'latin', spa_Latn: 'latin', deu_Latn: 'latin', ita_Latn: 'latin',
  nld_Latn: 'latin', ara: 'arabic', hin: 'devanagari',
};

function targetRule(lang) {
  if (lang === 'jpn_Jpan') return { script: 'kana', minKana: 2 };
  const script = LANG_SCRIPT[lang];
  if (!script) return null;
  return { script, minFrac: 0.5 };
}

function gatePair(key, srcLang, tgtLang, outputs, refOutputs, sourceTexts) {
  const failures = [];
  if (!Array.isArray(outputs) || outputs.length !== 10) {
    return { pass: false, failures: [{ criterion: 'RUN_ERROR', sentenceIndex: null, detail: 'no outputs' }] };
  }
  outputs.forEach((o, i) => {
    if (!o || !String(o).trim()) failures.push({ criterion: 'EMPTY', sentenceIndex: i + 1, detail: 'empty output' });
  });
  outputs.forEach((o, i) => {
    const r = detectRepetition(String(o));
    if (r.repeated) failures.push({ criterion: 'REPEATED', sentenceIndex: i + 1, detail: r.kind });
  });
  const counts = {};
  outputs.forEach((o) => { const k = String(o).trim(); counts[k] = (counts[k] || 0) + 1; });
  for (const [k, n] of Object.entries(counts)) {
    if (n >= 4) failures.push({ criterion: 'REPEATED', sentenceIndex: null, detail: `same output ${n}x` });
  }
  outputs.forEach((o, i) => {
    const out = String(o ?? '').trim();
    const ref = String(refOutputs?.[i] ?? '').trim();
    if (!out || !ref) return;
    if (!endsWithTerminalPunct(out) && endsWithTerminalPunct(ref)) {
      const outLen = Array.from(out).length;
      const refLen = Array.from(ref).length;
      if (outLen < 0.6 * refLen) failures.push({ criterion: 'TRUNCATED', sentenceIndex: i + 1, detail: `${outLen}/${refLen} chars, no terminal punct` });
    }
  });
  const rule = targetRule(tgtLang);
  outputs.forEach((o, i) => {
    const out = String(o ?? '').trim();
    if (!out) return;
    const prof = scriptProfile(out);
    if (rule?.script === 'kana') {
      const kana = (prof.counts.hiragana || 0) + (prof.counts.katakana || 0);
      if (kana < rule.minKana) failures.push({ criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1, detail: `no kana (${kana})` });
    } else if (rule) {
      const frac = prof.fractions[rule.script] || 0;
      if (frac < rule.minFrac) failures.push({ criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1, detail: `${rule.script} ${Math.round(frac * 100)}% < 50%` });
    }
    // Echo: output identical to the source sentence.
    const src = String(sourceTexts?.[i] ?? '').trim();
    if (src && out.toLowerCase() === src.toLowerCase()) {
      failures.push({ criterion: 'WRONG_LANGUAGE', sentenceIndex: i + 1, detail: 'echo of the source' });
    }
  });
  return { pass: failures.length === 0, failures };
}

// --- run the gate over every recorded pair ---------------------------------------------
const EN = JSON.parse(readFileSync('scripts/quality-gate/test-sets.json', 'utf8')).en;
const results = { generatedAt: new Date().toISOString(), models: [] };

for (const [modelKey, model] of Object.entries(runs.models)) {
  const entry = { id: model.id, modelId: model.modelId, pairs: [] };
  for (const pair of model.pairs ?? []) {
    if (pair.error) {
      entry.pairs.push({ key: pair.key, pass: false, failures: [{ criterion: 'RUN_ERROR', detail: pair.error }] });
      continue;
    }
    const [srcStr, tgtStr] = pair.key.split('->');
    // Plan keys use the short "en" for English (round 1) and the full registry
    // code for everything else.
    const isEnSource = srcStr === 'en' || srcStr === 'eng_Latn';
    // References: en->X lives in sources (same outputs), X->en in xToEn.
    const refOutputs = isEnSource ? refs.sources[tgtStr] : refs.xToEn[tgtStr] ?? refs.xToEn[srcStr];
    const sourceTexts = isEnSource ? EN : refs.sources[srcStr];
    const gated = gatePair(pair.key, srcStr, tgtStr, pair.outputs, refOutputs, sourceTexts);
    entry.pairs.push({
      key: pair.key,
      tag: pair.tag ?? null,
      pass: gated.pass,
      failures: gated.failures,
      hasReference: Array.isArray(refOutputs),
      loadMs: pair.loadMs,
      medianMs: pair.perSentenceMs?.filter(Boolean).length
        ? pair.perSentenceMs.filter(Boolean).slice().sort((a, b) => a - b)[Math.floor(pair.perSentenceMs.filter(Boolean).length / 2)]
        : null,
    });
  }
  results.models.push(entry);
}

writeFileSync('scripts/language-audit/gate-results.json', JSON.stringify(results, null, 2));
const totalPairs = results.models.flatMap((m) => m.pairs);
const passed = totalPairs.filter((p) => p.pass).length;
console.log(`gate: ${passed}/${totalPairs.length} pairs pass`);
for (const m of results.models) {
  for (const p of m.pairs) {
    if (!p.pass) {
      console.log(`FAIL ${m.modelId} ${p.key}: ${p.failures.map((f) => f.criterion + (f.sentenceIndex ? '#' + f.sentenceIndex : '')).join(', ')}`);
    }
  }
}

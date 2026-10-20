// IndicTrans2 IndicProcessor — JavaScript port for the P3a benchmark.
//
// Faithful port of IndicTransToolkit (processor.pyx, MIT) including its
// dependencies: sacremoses MosesPunctNormalizer/MosesTokenizer/MosesDetokenizer
// (English path), indic-nlp-library IndicNormalizers (Bengali/Tamil/Urdu incl.
// the bundled urduhack pipeline), trivial tokenize/detokenize, and the
// UnicodeIndicTransliterator offset map with Tamil corrections.
//
// Fidelity is enforced by p3a-processor-golden.test.mjs: the port must produce
// byte-identical preprocess output to the compiled Python IndicProcessor on the
// 6 benchmark directions x 200 FLORES sentences, and identical postprocess on
// the model outputs.
//
// Porting notes (verified against the Python sources):
// - Python `re`/`regex` \d/\w are Unicode-aware; JS equivalents are pinned to
//   [0-9] / [\p{L}\p{N}_] where the Python semantics matter.
// - The pyx literal-escape quirks in the Bengali/Tamil visarga patterns
//   (double-backslash "unicode" escapes inside raw strings, which can never
//   match real text) are replicated as-is via regex literals with \\\\.
// - The pyx source has one missing comma in _INDIC_FAILURE_CASES (adjacent
//   string literals concatenate); the merged string is carried over exactly
//   (extracted programmatically, not re-typed).
// - The placeholder map iteration order is the Python dict insertion order
//   (pattern order EMAIL->URL->NUMERAL->OTHER); set() iteration order inside a
//   pattern is arbitrary in Python and only matters when one match is a
//   substring of another (not reachable on FLORES data; noted in the worklog).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(__dirname, 'models', 'p3a-processor-data.json'), 'utf8'));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Escape a literal string for insertion into a regex character class. */
const escClass = (s) => s.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\^/g, '\\^').replace(/-/g, '\\-');

const FLORES_CODES = {
  asm_Beng: 'as', awa_Deva: 'hi', ben_Beng: 'bn', bho_Deva: 'hi', brx_Deva: 'hi',
  doi_Deva: 'hi', eng_Latn: 'en', gom_Deva: 'kK', gon_Deva: 'hi', guj_Gujr: 'gu',
  hin_Deva: 'hi', hne_Deva: 'hi', kan_Knda: 'kn', kas_Arab: 'ur', kas_Deva: 'hi',
  kha_Latn: 'en', lus_Latn: 'en', mag_Deva: 'hi', mai_Deva: 'hi', mal_Mlym: 'ml',
  mar_Deva: 'mr', mni_Beng: 'bn', mni_Mtei: 'hi', npi_Deva: 'ne', ory_Orya: 'or',
  pan_Guru: 'pa', san_Deva: 'hi', sat_Olck: 'or', snd_Arab: 'ur', snd_Deva: 'hi',
  tam_Taml: 'ta', tel_Telu: 'te', urd_Arab: 'ur', unr_Deva: 'hi',
};

// ---------------------------------------------------------------------------
// punctuation normalization (IndicProcessor._punc_norm)
// ---------------------------------------------------------------------------

const PUNC_REPLACEMENTS = [
  [/\r/g, ''],
  [/\(\s*/g, '('],
  [/\s*\)/g, ')'],
  [/\s:\s?/g, ':'],
  [/\s;\s?/g, ';'],
  [/[`´‘‚’]/g, "'"],
  [/["„“”«»]/g, '"'], // Python: [„“”«»] -> " (plus " which is identity-safe)
  [/[–—]/g, '-'],
  [/\.\.\./g, '...'],
  [/ %/g, '%'],
  [/nº /g, 'nº '],
  [/ ºC/g, ' ºC'],
  [/ [?!;]/g, (m) => m.trim()],
  [/, /g, ', '],
];

function puncNorm(text) {
  let t = text;
  for (const [re, repl] of PUNC_REPLACEMENTS) t = t.replace(re, repl);
  t = t.replace(/[ ]{2,}/g, ' ');
  t = t.replace(/\) ([.!?:?;,])/g, ')$1');
  t = t.replace(/(\d) %/g, '$1%');
  t = t.replace(/"([,.]+)/g, '$1"');
  t = t.replace(/(\d)\u00A0(\d)/g, '$1.$2');
  return t.trim();
}

// ---------------------------------------------------------------------------
// digit unification (IndicProcessor._normalize) + entity placeholders
// ---------------------------------------------------------------------------

const DIGIT_MAP = new Map();
for (const [k, v] of Object.entries(D.digits)) DIGIT_MAP.set(k, v);
for (let c = 0x30; c <= 0x39; c++) DIGIT_MAP.set(String.fromCharCode(c), String.fromCharCode(c));

const translateDigits = (text) => Array.from(text).map((c) => DIGIT_MAP.get(c) ?? c).join('');

const URL_PATTERN =
  /\b(?<![\w/.])(?:(?:https?|ftp):\/\/)?(?:(?:[\w-]+\.)+(?!\.))(?:[\w/\-?#&=%.]+)+(?!\.\w+)\b/g;
// Python: r"(~?\d+\.?\d*\s?%?\s?-?\s?~?\d+\.?\d*\s?%|~?\d+%|\d+[-\/.,:']\d+[-\/.,:'+]\d+(?:\.\d+)?|\d+[-\/.:'+]\d+(?:\.\d+)?)"
const NUMERAL_PATTERN =
  /(~?\d+\.?\d*\s?%?\s?-?\s?~?\d+\.?\d*\s?%|~?\d+%|\d+[-\/.,:']\d+[-\/.,:'+]\d+(?:\.\d+)?|\d+[-\/.:'+]\d+(?:\.\d+)?)/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g;
const OTHER_PATTERN = /[A-Za-z0-9]*[#|@][\p{L}\p{N}_]+/gu;

function wrapWithPlaceholders(text) {
  let serialNo = 1;
  const map = {};
  const patterns = [
    [EMAIL_PATTERN, 'email'],
    [URL_PATTERN, 'url'],
    [NUMERAL_PATTERN, 'numeral'],
    [OTHER_PATTERN, 'other'],
  ];
  for (const [pattern, kind] of patterns) {
    const matches = new Set(Array.from(text.matchAll(pattern)).map((m) => m[0]));
    for (const match of matches) {
      if (kind === 'url' && match.replaceAll('.', '').length < 4) continue;
      if (kind === 'numeral' && match.replaceAll(' ', '').replaceAll('.', '').replaceAll(':', '').length < 4) continue;
      const n = serialNo;
      const variants = [
        `<ID${n}>`, `< ID${n} >`, `[ID${n}]`, `[ ID${n} ]`, `[ID ${n}]`, `<ID${n}]`, `< ID${n}]`, `<ID${n} ]`,
        `<id${n}>`, `< id${n} >`, `[id${n}]`, `[ id${n} ]`, `[id ${n}]`, `<id${n}]`, `< id${n}]`, `<id${n} ]`,
      ];
      for (const v of variants) map[v] = match;
      for (const c of D.failureCases) {
        for (const v of [
          `<${c}${n}>`, `< ${c}${n} >`, `< ${c} ${n} >`, `<${c} ${n}]`, `< ${c} ${n} ]`,
          `[${c}${n}]`, `[${c} ${n}]`, `[ ${c}${n} ]`, `[ ${c} ${n} ]`, `${c} ${n}`, `${c}${n}`,
        ]) {
          map[v] = match;
        }
      }
      text = text.split(match).join(`<ID${n}>`);
      serialNo += 1;
    }
  }
  text = text.replace(/\s+/g, ' ').replaceAll('>/', '>').replaceAll(']/', ']');
  return { text, map };
}

function normalize(text) {
  const t = translateDigits(text);
  return wrapWithPlaceholders(t);
}

// ---------------------------------------------------------------------------
// Moses punctuation normalizer (sacremoses, lang=en, defaults as used by
// IndicProcessor: penn=True, norm_quote_commas=True, norm_numbers=True)
// ---------------------------------------------------------------------------

const MOSES_SUBS = [
  [/\r/g, ''],
  [/\(/g, ' ('],
  [/\)/g, ') '],
  [/ +/g, ' '],
  [/\) ([.!?:?;,])/g, ')$1'],
  [/\( /g, '('],
  [/ \)/g, ')'],
  [/(\d) %/g, '$1%'],
  [/ :/g, ':'],
  [/ ;/g, ';'],
  [/`/g, "'"],
  [/''/g, ' " '],
  [/„/g, '"'],
  [/“/g, '"'],
  [/”/g, '"'],
  [/–/g, '-'],
  [/—/g, ' - '],
  [/ +/g, ' '],
  [/´/g, "'"],
  [/([a-zA-Z])‘([a-zA-Z])/g, "$1'$2"],
  [/([a-zA-Z])’([a-zA-Z])/g, "$1'$2"],
  [/‘/g, "'"],
  [/‚/g, "'"],
  [/’/g, "'"],
  [/''/g, '"'],
  [/´´/g, '"'],
  [/…/g, '...'],
  [/\u00A0«\u00A0/g, '"'],
  [/«\u00A0/g, '"'],
  [/«/g, '"'],
  [/\u00A0»\u00A0/g, '"'],
  [/\u00A0»/g, '"'],
  [/»/g, '"'],
  [/\u00A0%/g, '%'],
  [/nº\u00A0/g, 'nº '],
  [/\u00A0:/g, ':'],
  [/\u00A0ºC/g, ' ºC'],
  [/\u00A0cm/g, ' cm'],
  [/\u00A0\?/g, '?'],
  [/\u00A0!/g, '!'],
  [/\u00A0;/g, ';'],
  [/,\u00A0/g, ', '],
  [/ +/g, ' '],
  [/"([,.]+)/g, '$1"'],
  [/(\d)\u00A0(\d)/g, '$1.$2'],
];

function mosesPunctNormalize(text) {
  let t = String(text);
  for (const [re, repl] of MOSES_SUBS) t = t.replace(re, repl);
  return t.trim();
}

// ---------------------------------------------------------------------------
// Moses tokenizer (sacremoses, lang=en, escape=False, no protected patterns)
// NOTE: the PLAIN tokenize() path only — the Penn-style regexes (directional
// quotes, FINAL_PERIOD, PAD_PARENTHESIS, SYMBOLS, ...) belong to
// penn_tokenize(), which IndicProcessor does not call.
// ---------------------------------------------------------------------------

const IsN = D.IsN, IsAlnum = D.IsAlnum, IsAlpha = D.IsAlpha, IsLower = D.IsLower;

const TRAILING_DOT_APOSTROPHE = /\.' ?$/;

const EN_APOSTROPHE_STEPS = [
  [`([^${escClass(IsAlpha)}])[']([^${escClass(IsAlpha)}])`, '$1 \' $2'],
  [`([^${escClass(IsAlpha)}${escClass(IsN)}])[']([${escClass(IsAlpha)}])`, '$1 \' $2'],
  [`([${escClass(IsAlpha)}])[']([^${escClass(IsAlpha)}])`, '$1 \' $2'],
  [`([${escClass(IsAlpha)}])[']([${escClass(IsAlpha)}])`, '$1 \'$2'],
  [`([${escClass(IsN)}])[']([s])`, '$1 \'$2'],
].map(([p, r]) => [new RegExp(p, 'g'), r]);

function isanyalpha(text) {
  const alpha = new Set(Array.from(IsAlpha));
  return Array.from(text).some((c) => alpha.has(c));
}
function islowerText(text) {
  const lower = new Set(Array.from(IsLower));
  return Array.from(text).every((c) => lower.has(c));
}

function replaceMultidots(text) {
  return text.replace(/\.{2,}/g, (m, off, s) => {
    const marker = ' ' + 'DOT'.repeat(m.length) + 'MULTI';
    return off + m.length < s.length ? marker + ' ' : marker;
  });
}
function restoreMultidots(text) {
  return text.replace(/(?:DOT)+MULTI/g, (m) => '.'.repeat(Math.max(1, (m.length - 5) / 3 | 0)));
}

const NONBREAKING_PREFIXES = new Set(D.enNonbreakingPrefixes);
const NUMERIC_ONLY_PREFIXES = new Set(D.enNumericOnlyPrefixes);

function handlesNonbreakingPrefixes(text) {
  const tokens = text.split(' ');
  const n = tokens.length;
  for (let i = 0; i < n; i++) {
    const token = tokens[i];
    const m = /^(\S+)\.$/.exec(token);
    if (m) {
      const prefix = m[1];
      const cond1 = prefix.includes('.') && isanyalpha(prefix);
      const cond2 = NONBREAKING_PREFIXES.has(prefix) && !NUMERIC_ONLY_PREFIXES.has(prefix);
      const cond3 = i !== n - 1 && tokens[i + 1] && islowerText(tokens[i + 1][0]);
      const condNum = NUMERIC_ONLY_PREFIXES.has(prefix) && i + 1 < n && /^[0-9]+/.test(tokens[i + 1]);
      if (cond1 || cond2 || cond3 || condNum) {
        // no change
      } else {
        tokens[i] = prefix + ' .';
      }
    }
  }
  return tokens.join(' ');
}

function mosesTokenize(text) {
  let t = String(text);
  t = t.replace(/\s+/g, ' ').replace(/[\x00-\x1f]/g, '');
  t = t.trim();
  // PAD_NOT_ISALNUM: pad "other" special characters not in IsAlnum
  t = t.replace(new RegExp(`([^${escClass(IsAlnum)}\\s.'\`,\\-])`, 'g'), ' $1 ');
  // multidots
  t = replaceMultidots(t);
  // COMMA_SEPARATE 1-3
  t = t.replace(new RegExp(`([^${escClass(IsN)}])[,]`, 'g'), '$1 , ');
  t = t.replace(new RegExp(`[,]([^${escClass(IsN)}])`, 'g'), ' , $1');
  t = t.replace(new RegExp(`([${escClass(IsN)}])[,]$`, 'g'), '$1 , ');
  // English apostrophes
  for (const [re, repl] of EN_APOSTROPHE_STEPS) t = t.replace(re, repl);
  // nonbreaking prefixes
  t = handlesNonbreakingPrefixes(t);
  // clean spaces
  t = t.replace(/\s+/g, ' ').trim();
  // trailing ".'"
  t = t.replace(TRAILING_DOT_APOSTROPHE, ' . \' ');
  // restore multidots
  t = restoreMultidots(t);
  return t;
}

// ---------------------------------------------------------------------------
// Moses detokenizer (sacremoses, lang=en)
// ---------------------------------------------------------------------------

const IS_CURRENCY_SYMBOL = new RegExp(`^[${escClass(D.IsSc)}\\(\\[\\{\\¿\\¡]+$`);
const IS_ENGLISH_CONTRACTION = new RegExp(`^['][${escClass(IsAlpha)}]`);
const IS_PUNCT = /^[\,\.\?\!\:\;\\\%\}\]\)]+$/;
const IS_OPEN_QUOTE = /^[\'\"„“`]+$/;

function isCJK(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xff00 && cp <= 0xffef) || (cp >= 0xac00 && cp <= 0xd7af)
  );
}

const MOSES_UNESCAPES = [
  [/&bar;/g, '|'], [/&#124;/g, '|'], [/&lt;/g, '<'], [/&gt;/g, '>'],
  [/&bra;/g, '['], [/&ket;/g, ']'], [/&quot;/g, '"'], [/&apos;/g, "'"],
  [/&#91;/g, '['], [/&#93;/g, ']'], [/&amp;/g, '&'],
];

function mosesDetokenize(tokens) {
  let text = ` ${tokens.join(' ')} `;
  text = text.replace(/ @-@ /g, '-');
  for (const [re, repl] of MOSES_UNESCAPES) text = text.replace(re, repl);
  const quoteCounts = { "'": 0, '"': 0, '``': 0, '`': 0, "''": 0 };
  let prependSpace = ' ';
  let detok = '';
  const toks = text.split(' ').filter((t) => t !== '');
  for (let i = 0; i < toks.length; i++) {
    const token = toks[i];
    if (isCJK(token[0])) {
      if (i > 0 && isCJK(toks[i - 1].slice(-1))) {
        detok += token;
      } else {
        detok += prependSpace + token;
      }
      prependSpace = ' ';
    } else if (IS_CURRENCY_SYMBOL.test(token)) {
      detok += prependSpace + token;
      prependSpace = '';
    } else if (IS_PUNCT.test(token)) {
      detok += token;
      prependSpace = ' ';
    } else if (i > 0 && IS_ENGLISH_CONTRACTION.test(token)) {
      detok += token;
      prependSpace = ' ';
    } else if (IS_OPEN_QUOTE.test(token)) {
      let normalizedQuo = token;
      if (/^[„“”]+$/.test(token)) normalizedQuo = '"';
      quoteCounts[normalizedQuo] = quoteCounts[normalizedQuo] ?? 0;
      if (quoteCounts[normalizedQuo] % 2 === 0) {
        if (token === "'" && i > 0 && /[s]$/.test(toks[i - 1])) {
          detok += token;
          prependSpace = ' ';
        } else {
          detok += prependSpace + token;
          prependSpace = '';
          quoteCounts[normalizedQuo] += 1;
        }
      } else {
        detok += token;
        prependSpace = ' ';
        quoteCounts[normalizedQuo] += 1;
      }
    } else {
      detok += prependSpace + token;
      prependSpace = ' ';
    }
  }
  detok = detok.replace(/ {2,}/g, ' ').trim();
  return detok;
}

// ---------------------------------------------------------------------------
// Indic normalizers (indic-nlp-library)
// ---------------------------------------------------------------------------

function baseNormalize(text) {
  let t = text;
  t = t.replaceAll('\ufeff', '').replaceAll('\ufffe', '').replaceAll('\u2060', '').replaceAll('\u00ad', '');
  t = t.replaceAll('\u200b', ' ').replaceAll('\u00a0', ' ');
  t = t.replaceAll('\u200c', '').replaceAll('\u200d', '');
  t = t.replaceAll('\ufeff', '');
  t = t.replaceAll('„', '"').replaceAll('“', '"').replaceAll('”', '"');
  t = t.replaceAll('–', '-').replaceAll('—', ' - ').replaceAll('´', "'");
  t = t.replaceAll('‘', "'").replaceAll('‚', "'").replaceAll('’', "'");
  t = t.replaceAll("''", '"').replaceAll('´´', '"').replaceAll('…', '...');
  return t;
}

function bengaliNormalize(text) {
  let t = baseNormalize(text);
  // NOTE: the upstream BengaliNormalizer defines NUKTA as "\\u09BC" — an
  // escaped-backslash literal, NOT the U+09BC character. Decomposing composed
  // nukta letters therefore inserts the literal ASCII text "\\u09BC". The
  // models were trained on this pipeline, so the bug is replicated exactly.
  const LIT_NUKTA = '\\u09BC';
  t = t.replaceAll('\u09dc', '\u09a1' + LIT_NUKTA).replaceAll('\u09dd', '\u09a2' + LIT_NUKTA).replaceAll('\u09df', '\u09af' + LIT_NUKTA);
  t = t.replaceAll('\u09e4', '\u0964').replaceAll('\u09e5', '\u0965');
  t = t.replaceAll('\u007c', '\u0964');
  t = t.replaceAll('\u09f7', '\u0964');
  t = t.replaceAll('\u09c7\u09be', '\u09cb').replaceAll('\u09c7\u09d7', '\u09cc');
  // visarga pattern as written in the source (literal-escaped, effectively a no-op on real text)
  t = t.replace(/([\\u0980-\\u09ff]):/g, '$1\u0983');
  return t;
}

function tamilNormalize(text) {
  let t = baseNormalize(text);
  t = t.replaceAll('\u0be4', '\u0964').replaceAll('\u0be5', '\u0965');
  t = t.replaceAll('\u0b92\u0bd7', '\u0b94').replaceAll('\u0bc6\u0bbe', '\u0bca');
  t = t.replaceAll('\u0bc7\u0bbe', '\u0bcb').replaceAll('\u0bc6\u0bd7', '\u0bcc');
  t = t.replace(/([\\u0b80-\\u0bff]):/g, '$1\u0b83');
  return t;
}

// UrduHack pipeline (bundled in indicnlp)
const URDU_TRANSLATOR = new Map();
for (const [key, values] of Object.entries(D.correctUrduCharacters)) {
  for (const v of values) URDU_TRANSLATOR.set(v, key);
}
const COMBINE_URDU = Object.entries(D.combineUrduCharacters);
const URDU_ALL = D.urduAllCharacters;
const URDU_PUNCT = D.urduPunctuations;
const URDU_EXCEPT_HAMZA = Array.from(URDU_ALL).filter((c) => c !== '\u0621').join('');

const ASCII_PUNCT = String.raw`!"#$%&'()*+,-./:;<=>?@[\]^_` + '`' + String.raw`{|}~`;
// Python inserts string.punctuation RAW into char classes; its backslash
// escapes the following ']' so the class actually contains every
// punctuation char EXCEPT the backslash itself. Replicated exactly.
const NO_BS_ASCII_PUNCT = ASCII_PUNCT.replace('\\', '');
const ALL_PUNCTS = URDU_PUNCT + NO_BS_ASCII_PUNCT; // backslash excluded (Python raw-insertion quirk)

const RE_SPACE_BEFORE_DIGITS = new RegExp(`(?<=[${escClass(URDU_ALL)}])(?=[0-9])`, 'gu');
const RE_SPACE_AFTER_DIGITS = new RegExp(`(?<=[0-9])(?=[${escClass(URDU_EXCEPT_HAMZA)}])`, 'gu');
const RE_SPACE_BEFORE_ENG = new RegExp(`(?<=[${escClass(URDU_ALL)}])(?=[a-zA-Z])`, 'gu');
const RE_SPACE_AFTER_ENG = new RegExp(`(?<=[a-zA-Z])(?=[${escClass(URDU_ALL)}])`, 'gu');
const RE_SPACE_BEFORE_ALLPUNCT = new RegExp(`(?<=[${escClass(URDU_ALL)}])(?=[${escClass(ALL_PUNCTS)}])`, 'gu');
const RE_SPACE_AFTER_ALLPUNCT = new RegExp(`(?<=[${escClass(ALL_PUNCTS)}])(?=[^${escClass(ALL_PUNCTS)}0-9 \n])`, 'gu');

function urduNormalize(text) {
  // NormalizerI._normalize_punctuations
  let t = text.replaceAll('\ufeff', '');
  t = t.replaceAll('„', '"').replaceAll('“', '"').replaceAll('”', '"');
  t = t.replaceAll('–', '-').replaceAll('—', ' - ').replaceAll('´', "'");
  t = t.replaceAll('‘', "'").replaceAll('‚', "'").replaceAll('’', "'");
  t = t.replaceAll("''", '"').replaceAll('´´', '"').replaceAll('…', '...');
  // normalize_whitespace
  t = t.replace(/((\r\n)|[\n\v])+/g, '\n').replace(/(?!\n)\s+/g, ' ').trim();
  // remove_diacritics (remove_nuktas=True)
  t = t.replace(new RegExp(`[${escClass(D.urduDiacritics)}]`, 'gu'), '');
  // normalize_characters
  t = Array.from(t).map((c) => URDU_TRANSLATOR.get(c) ?? c).join('');
  // normalize_combine_characters
  for (const [k, v] of COMBINE_URDU) t = t.split(k).join(v);
  // digits_space
  t = t.replace(RE_SPACE_BEFORE_DIGITS, ' ').replace(RE_SPACE_AFTER_DIGITS, ' ');
  // all_punctuations_space
  t = t.replace(RE_SPACE_BEFORE_ALLPUNCT, ' ').replace(RE_SPACE_AFTER_ALLPUNCT, ' ');
  // english_characters_space
  t = t.replace(RE_SPACE_BEFORE_ENG, ' ').replace(RE_SPACE_AFTER_ENG, ' ');
  return t;
}

function getIndicNormalizer(isoLang) {
  if (isoLang === 'ur') return urduNormalize;
  if (isoLang === 'bn' || isoLang === 'as') return bengaliNormalize;
  if (isoLang === 'ta') return tamilNormalize;
  return baseNormalize; // BaseNormalizer default (nasals/chandras/vowel_ending all off)
}

// ---------------------------------------------------------------------------
// trivial tokenize / detokenize (indic-nlp-library)
// ---------------------------------------------------------------------------

const TRIV_INDIC_PUNCT = NO_BS_ASCII_PUNCT + '\u0964\u0965\uAAF1\uAAF0\uABEB\uABEC\uABED\uABEE\uABEF\u1C7E\u1C7F';
const TRIV_URDU_PUNCT = NO_BS_ASCII_PUNCT + '\u0609\u060A\u060C\u061E\u066A\u066B\u066C\u066D\u06D4';
const PAT_NUM_SEQ = /([0-9]+ [,.:/] )+[0-9]+/g;

function trivialTokenizeIndic(text) {
  let s = text.replace(/\t/g, ' ');
  const re = new RegExp(`([${escClass(TRIV_INDIC_PUNCT)}])`, 'g');
  s = s.replace(re, ' $1 ');
  s = s.replace(/[ ]+/g, ' ').replace(/^ | $/g, '');
  // do not tokenize numbers and dates
  let out = '';
  let prev = 0;
  for (const m of s.matchAll(PAT_NUM_SEQ)) {
    const start = m.index;
    if (start > prev) out += s.slice(prev, start);
    out += m[0].replaceAll(' ', '');
    prev = start + m[0].length;
  }
  out += s.slice(prev);
  return out.split(' ');
}

function trivialTokenizeUrdu(text) {
  let s = text.replace(/\t/g, ' ');
  const re = new RegExp(`([${escClass(TRIV_URDU_PUNCT)}])`, 'g');
  s = s.replace(re, ' $1 ');
  s = s.replace(/[ ]+/g, ' ').replace(/^ | $/g, '');
  return s.split(' ');
}

function trivialTokenize(text, isoLang) {
  return isoLang === 'ur' ? trivialTokenizeUrdu(text) : trivialTokenizeIndic(text);
}

function trivialDetokenize(text) {
  let s = text;
  // numbers and dates
  let out = '';
  let prev = 0;
  for (const m of s.matchAll(PAT_NUM_SEQ)) {
    const start = m.index;
    if (start > prev) {
      out += s.slice(prev, start);
      out += m[0].replaceAll(' ', '');
      prev = start + m[0].length;
    } else {
      out += s.slice(prev, start);
      out += m[0].replaceAll(' ', '');
      prev = start + m[0].length;
    }
  }
  out += s.slice(prev);
  s = out;
  s = s.replace(/ ([-/\\]) /g, '$1');
  s = s.replace(/ ([!%)\]},.:;>?\u0964\u0965])/g, '$1');
  s = s.replace(/([#$(\[{<@]) /g, '$1');
  // quotes: alternate left/right attach
  for (const punc of ["'", '"', '`']) {
    let cnt = 0;
    const chars = Array.from(s).map((c) => {
      if (c === punc) {
        const marker = cnt % 2 === 0 ? '@RA' : '@LA';
        cnt += 1;
        return marker;
      }
      return c;
    });
    s = chars
      .join('')
      .replaceAll('@RA ', punc)
      .replaceAll(' @LA', punc)
      .replaceAll('@RA', punc)
      .replaceAll('@LA', punc);
  }
  return s;
}

// ---------------------------------------------------------------------------
// UnicodeIndicTransliterator (offset map, Tamil corrections, danda excluded)
// ---------------------------------------------------------------------------

const SCRIPT_RANGES = D.scriptRanges; // { iso: [start, end] }
const COORD_START = 0x00;
const COORD_END = 0x6f;

function correctTamilMapping(offset) {
  if (offset >= 0x15 && offset <= 0x28 && offset !== 0x1c && !(((offset - 0x15) % 5 === 0) || ((offset - 0x15) % 5 === 4))) {
    const substChar = Math.floor((offset - 0x15) / 5);
    offset = 0x15 + 5 * substChar;
  }
  if (offset === 0x2b || offset === 0x2c || offset === 0x2d) offset = 0x2a;
  if (offset === 0x36) offset = 0x37;
  return offset;
}

function transliterate(text, lang1, lang2) {
  const r1 = SCRIPT_RANGES[lang1];
  const r2 = SCRIPT_RANGES[lang2];
  if (!r1 || !r2) return text;
  let out = '';
  for (const c of text) {
    let newc = c;
    const offset = c.codePointAt(0) - r1[0];
    if (
      offset >= COORD_START && offset <= COORD_END &&
      c !== '\u0964' && c !== '\u0965'
    ) {
      let o = offset;
      if (lang2 === 'ta') o = correctTamilMapping(offset);
      newc = String.fromCodePoint(r2[0] + o);
    }
    out += newc;
  }
  return out;
}

// ---------------------------------------------------------------------------
// IndicProcessor (preprocess / postprocess)
// ---------------------------------------------------------------------------

export class IndicProcessor {
  constructor({ inference = true } = {}) {
    this.inference = inference;
  }

  preprocessBatch(batch, srcLang, tgtLang, isTarget = false) {
    const isoLang = FLORES_CODES[srcLang] ?? 'hi';
    const scriptPart = srcLang.split('_')[1];
    const normalizer = srcLang !== 'eng_Latn' ? getIndicNormalizer(isoLang) : null;
    return batch.map((sent) => this.#preprocess(sent, srcLang, tgtLang, normalizer, isTarget, isoLang, scriptPart));
  }

  #preprocess(sent, srcLang, tgtLang, normalizer, isTarget, isoLang, scriptPart) {
    let s = puncNorm(sent);
    const norm = normalize(s); // digits + placeholders
    s = norm.text;
    this.#lastMap = norm.map;

    let processed;
    if (isoLang === 'en') {
      const eNorm = mosesPunctNormalize(s.trim());
      processed = mosesTokenize(eNorm);
    } else {
      const normed = normalizer(s.trim());
      const tokens = trivialTokenize(normed, isoLang);
      let joined = tokens.join(' ');
      const doTransliterate = !['Arab', 'Aran', 'Olck', 'Mtei', 'Latn'].includes(scriptPart);
      if (doTransliterate) {
        joined = transliterate(joined, isoLang, 'hi');
        joined = joined.split(' ् ').join('्');
      }
      processed = joined;
    }
    processed = processed.trim();
    return isTarget ? processed : `${srcLang} ${tgtLang} ${processed}`;
  }

  postprocessBatch(sents, lang) {
    // benchmark calls are paired 1:1 with preprocess; #lastMap is the
    // placeholder map of the most recent preprocess call.
    return sents.map((sent) => this.#postprocess(sent, lang, this.#lastMap ?? {}));
  }

  #lastMap = null;

  /** Explicit API for the benchmark: preprocess returns {text, map}. */
  preprocessWithMap(sent, srcLang, tgtLang) {
    const out = this.preprocessBatch([sent], srcLang, tgtLang);
    return { text: out[0], map: this.#lastMap ?? {} };
  }

  postprocessWithMap(sent, lang, map) {
    return this.#postprocess(sent, lang, map);
  }

  #postprocess(sentIn, lang, map) {
    let sent = Array.isArray(sentIn) ? sentIn[0] : sentIn;
    const [langCode, scriptCode] = lang.split('_', 2);
    const isoLang = FLORES_CODES[lang] ?? 'hi';
    if (scriptCode === 'Arab' || scriptCode === 'Aran') {
      sent = sent
        .split(' ؟').join('؟')
        .split(' ۔').join('۔')
        .split(' ،').join('،')
        .split('ٮ۪').join('ؠ');
    }
    if (langCode === 'ory') sent = sent.split('ଯ଼').join('ୟ');
    for (const [k, v] of Object.entries(map)) sent = sent.split(k).join(v);
    if (lang === 'eng_Latn') {
      return mosesDetokenize(sent.split(' ').filter((t) => t !== ''));
    }
    const xlated = transliterate(sent, 'hi', isoLang);
    return trivialDetokenize(xlated);
  }
}

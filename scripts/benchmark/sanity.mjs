// Per-sentence sanity flags for benchmark outputs. A score is never trusted
// on its own: every flagged sentence is counted and reviewable.
//
// Flags (checked against the human FLORES reference):
//   empty        - no output at all (or whitespace only, or the runner errored)
//   wrongScript  - the dominant Unicode script of the output is not the
//                  reference's (Croatian answered in Cyrillic, Hindi answered
//                  in Latin, ...) — Japanese counts Han+Kana+Katakana as one
//   repeatLoop   - a phrase of 1..6 words repeats consecutively 3+ times, one
//                  word makes up over half of a 12+ word output, or (for
//                  unspaced scripts) a 2..8 character span repeats 3+ times
//   lenRatio     - whitespace-stripped length outside 0.5..2.0 x the reference
//   endsMidWord  - the output really stops mid word: it ends with a dangling
//                  hyphen, or its final token is a proper prefix of a word in
//                  the reference (and not a word the reference itself uses).
//                  Skipped for scripts written without spaces, where word
//                  boundaries cannot be checked.
//
// Counted separately, never a flag (P2b): a missing final punctuation mark
//   missingFinalPunct - the reference ends with a terminal mark and the
//                       output does not. The app restores the mark where the
//                       model dropped it on an otherwise complete sentence, so
//                       this alone says nothing about quality.
//
// Usage: node scripts/benchmark/sanity.mjs --test    self test
// Exports: sanityFlags(hyp, ref, tgtCode) -> string[]
//          missingFinalPunct(hyp, ref) -> boolean

// Unicode script groups by code point range. Anything unrecognized is 'other'.
const RANGES = [
  ['Latn', 0x41, 0x5a], ['Latn', 0x61, 0x7a], ['Latn', 0xc0, 0x24f], ['Latn', 0x1e00, 0x1eff], ['Latn', 0x2c60, 0x2c7f],
  ['Grek', 0x370, 0x3ff], ['Grek', 0x1f00, 0x1fff],
  ['Cyrl', 0x400, 0x52f],
  ['Hebr', 0x590, 0x5ff],
  ['Arab', 0x600, 0x6ff], ['Arab', 0x750, 0x77f], ['Arab', 0xfb50, 0xfdff], ['Arab', 0xfe70, 0xfeff],
  ['Deva', 0x900, 0x97f],
  ['Beng', 0x980, 0x9ff],
  ['Guru', 0xa00, 0xa7f],
  ['Gujr', 0xa80, 0xaff],
  ['Orya', 0xb00, 0xb7f],
  ['Taml', 0xb80, 0xbff],
  ['Telu', 0xc00, 0xc7f],
  ['Knda', 0xc80, 0xcff],
  ['Mlym', 0xd00, 0xd7f],
  ['Sinh', 0xd80, 0xdff],
  ['Thai', 0xe00, 0xe7f],
  ['Laoo', 0xe80, 0xeff],
  ['Mymr', 0x1000, 0x109f],
  ['Geor', 0x10a0, 0x10ff],
  ['Ethi', 0x1200, 0x137f],
  ['Hani', 0x3400, 0x4dbf], ['Hani', 0x4e00, 0x9fff], ['Hani', 0xf900, 0xfaff], ['Hani', 0x20000, 0x2a6df],
  ['Hira', 0x3040, 0x309f],
  ['Kana', 0x30a0, 0x30ff],
  ['Hang', 0x1100, 0x11ff], ['Hang', 0x3130, 0x318f], ['Hang', 0xac00, 0xd7af],
];

// Script suffix of the NLLB code -> the group its letters belong to.
// Japanese mixes Han, Hiragana and Katakana: one group.
const CODE_GROUP = {
  Latn: 'Latn', Cyrl: 'Cyrl', Grek: 'Grek', Hebr: 'Hebr', Arab: 'Arab',
  Deva: 'Deva', Beng: 'Beng', Guru: 'Guru', Gujr: 'Gujr', Orya: 'Orya',
  Taml: 'Taml', Telu: 'Telu', Knda: 'Knda', Mlym: 'Mlym', Sinh: 'Sinh',
  Thai: 'Thai', Laoo: 'Laoo', Mymr: 'Mymr', Geor: 'Geor', Ethi: 'Ethi',
  Hang: 'Hang',
  Hans: 'Hani', Hant: 'Hani', Hani: 'Hani',
  Jpan: 'Jpan', Kore: 'Hang',
};

function scriptOf(cp) {
  for (const [g, lo, hi] of RANGES) {
    if (cp >= lo && cp <= hi) {
      if (g === 'Hani' || g === 'Hira' || g === 'Kana') return 'JpanOrHani'; // resolved below
      return g;
    }
  }
  return null;
}

function scriptCounts(text) {
  const counts = new Map();
  for (const ch of String(text ?? '')) {
    const cp = ch.codePointAt(0);
    let g = scriptOf(cp);
    if (g === 'JpanOrHani') g = 'HaniJ'; // Han + Kana + Hira counted together
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return counts;
}

/** The dominant script group of a text: null when there are fewer than 3
 *  recognized letters (too little to judge) or when no script dominates. */
function dominantGroup(text) {
  const counts = scriptCounts(text);
  let best = null, bestN = 0, total = 0;
  for (const [g, n] of counts) {
    total += n;
    if (n > bestN) { best = g; bestN = n; }
  }
  if (total < 3 || bestN < 3) return null;
  return best;
}

/** Recognized letter count, for the "is there enough to judge" question. */
function letterCount(text) {
  let total = 0;
  for (const n of scriptCounts(text).values()) total += n;
  return total;
}

/** Expected group for an NLLB language code (e.g. 'hin_Deva' -> 'Deva'). */
export function expectedGroup(code) {
  const suffix = String(code ?? '').split('_')[1];
  return CODE_GROUP[suffix] ?? null;
}

/** Consecutive span repetition, word level: any 1..6 word span that repeats
 * 3+ times in a row. */
function wordLoop(tokens) {
  const n = tokens.length;
  if (n < 6) return false;
  for (let span = 1; span <= 6; span++) {
    for (let start = 0; start + 3 * span <= n; start++) {
      const a = tokens.slice(start, start + span).join(' ');
      if (a.length === 0) continue;
      let reps = 1;
      while (
        start + (reps + 1) * span <= n &&
        tokens.slice(start + reps * span, start + (reps + 1) * span).join(' ') === a
      ) reps++;
      if (reps >= 3) return true;
    }
  }
  return false;
}

/** Same idea for unspaced scripts (Han, Thai, ...): 2..8 code point spans. */
function charLoop(text) {
  const s = Array.from(String(text ?? '').replace(/\s+/g, ''));
  const n = s.length;
  if (n < 12) return false;
  for (let span = 2; span <= 8; span++) {
    for (let start = 0; start + 3 * span <= n; start++) {
      const a = s.slice(start, start + span).join('');
      let reps = 1;
      while (start + (reps + 1) * span <= n && s.slice(start + reps * span, start + (reps + 1) * span).join('') === a) reps++;
      if (reps >= 3) return true;
    }
  }
  return false;
}

function repeatLoop(text) {
  const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (wordLoop(tokens)) return true;
  // one word over half the output (only meaningful for longer outputs)
  if (tokens.length >= 12) {
    const freq = new Map();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const n of freq.values()) if (n / tokens.length > 0.5) return true;
  }
  if (charLoop(text)) return true;
  return false;
}

const TERMINAL = /[.!?\u2026\u3002\uff01\uff1f\u061f\u06d4\u0964\u0965]$/;
const TRAILING_JUNK = /["'\u201d\u2019\u00bb\u203a)\u3001\uff0c]+$/;

/** Scripts written without spaces: word boundaries cannot be checked there. */
const UNSPACED_SCRIPTS = new Set(['Thai', 'Laoo', 'Khmr', 'Mymr', 'Hans', 'Hant', 'Jpan', 'Kana']);

function endsMidWord(hyp, ref, tgtCode) {
  const h = String(hyp ?? '').trim().replace(TRAILING_JUNK, '').trim();
  if (h.length === 0) return false;
  if (TERMINAL.test(h)) return false;
  // A dangling hyphen is always a real cut.
  if (/[-\u2010\u2011\u2013\u2014]$/.test(h)) return true;
  const script = String(tgtCode ?? '').includes('_') ? String(tgtCode).split('_')[1] : '';
  if (UNSPACED_SCRIPTS.has(script)) return false;
  const tokens = h.split(/\s+/);
  if (tokens.length < 2) return false; // a lone token carries no boundary evidence
  const last = tokens[tokens.length - 1].replace(/[^\p{L}\p{N}\u0600-\u06ff]/gu, '');
  if (last.length < 2) return false;
  // The reference's own words (punctuation stripped, case folded).
  const refWords = new Set(
    String(ref ?? '')
      .replace(TRAILING_JUNK, '')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}\u0600-\u06ff]/gu, '').toLowerCase())
      .filter(Boolean),
  );
  if (refWords.has(last.toLowerCase())) return false; // a complete word the reference uses
  // A proper prefix of a reference word (2+ chars beyond it) = stopped mid word.
  for (const w of refWords) {
    if (w.length > last.length + 1 && w.startsWith(last.toLowerCase())) return true;
  }
  return false;
}

/** Counted separately, never a flag: the reference ends with a terminal
 * mark and the hypothesis does not. The app's punctuation restoration adds
 * the mark back on complete sentences, so this alone is not a defect. */
export function missingFinalPunct(hyp, ref) {
  const h = String(hyp ?? '').trim().replace(TRAILING_JUNK, '').trim();
  const r = String(ref ?? '').trim().replace(TRAILING_JUNK, '').trim();
  return TERMINAL.test(r) && !TERMINAL.test(h);
}

function strippedLen(text) {
  return Array.from(String(text ?? '').replace(/\s+/g, '')).length;
}

/** All sanity flags for one sentence. tgtCode is the NLLB target code. */
export function sanityFlags(hyp, ref, tgtCode) {
  const flags = [];
  const h = hyp == null ? '' : String(hyp);
  if (h.trim().length === 0) {
    flags.push('empty');
    return flags; // nothing else is meaningful for an empty output
  }
  const hypGroup = dominantGroup(h);
  const refGroup = dominantGroup(ref);
  if (hypGroup && refGroup && hypGroup !== refGroup) flags.push('wrongScript');
  // enough letters to judge, but none in a recognized script, while the
  // reference matches the expected group: the output is in some other script
  else if (!hypGroup && refGroup && letterCount(h) >= 3 && expectedGroup(tgtCode) === refGroup) flags.push('wrongScript');
  if (repeatLoop(h)) flags.push('repeatLoop');
  const refLen = strippedLen(ref);
  if (refLen > 0) {
    const ratio = strippedLen(h) / refLen;
    if (ratio < 0.5 || ratio > 2.0) flags.push('lenRatio');
  }
  if (endsMidWord(h, ref, tgtCode)) flags.push('endsMidWord');
  return flags;
}

// --- self test ---------------------------------------------------------------------
if (process.argv.includes('--test')) {
  const cases = [
    ['empty output', sanityFlags('', 'Bonjour, comment allez-vous?', 'fra_Latn'), ['empty']],
    ['null output', sanityFlags(null, 'Hello there.', 'eng_Latn'), ['empty']],
    ['clean match', sanityFlags('Bonjour, comment allez-vous ?', 'Bonjour, comment allez-vous ?', 'fra_Latn'), []],
    ['wrong script latin->cyrillic', sanityFlags('Добро утро, как сте?', 'Dobro jutro, kako ste?', 'hrv_Latn'), ['wrongScript']],
    ['wrong script latin->devanagari', sanityFlags('Hello world', 'नमस्ते दुनिया', 'hin_Deva'), ['wrongScript']],
    ['japanese kana vs han ok', sanityFlags('こんにちは世界です。', '今日は良い天気ですね。', 'jpn_Jpan'), []],
    ['repeat loop words', sanityFlags('the cat sat the cat sat the cat sat on the mat.', 'The cat sat on the mat.', 'eng_Latn'), ['repeatLoop']],
    ['repeat loop chars (han)', sanityFlags('今天天气很好很好很好很好。', '今天天气很好。', 'zho_Hans'), ['repeatLoop']],
    ['one word dominates', sanityFlags('yes yes yes yes yes yes yes yes yes yes yes yes yes yes.', 'Yes, I would like a coffee please.', 'eng_Latn'), ['repeatLoop']],
    ['too short', sanityFlags('Hi', 'The committee approved the budget proposal unanimously yesterday.', 'eng_Latn'), ['lenRatio']],
    ['too long', sanityFlags('The sentence is one that goes on and on and has many more words than anyone would ever need in a single sentence, really.', 'The sentence goes on.', 'eng_Latn'), ['lenRatio']],
    ['ends mid word', sanityFlags('The committee approved the budg', 'The committee approved the budget proposal.', 'eng_Latn'), ['endsMidWord']],
    ['dangling hyphen', sanityFlags('This is incom-', 'This is incomplete.', 'eng_Latn'), ['endsMidWord']],
    ['missing period only is not a flag', sanityFlags('The committee approved the budget proposal', 'The committee approved the budget proposal unanimously yesterday.', 'eng_Latn'), []],
    ['complete sentence missing period', sanityFlags('Le temps est beau', "Le temps est beau.", 'fra_Latn'), []],
    ['missing punct counted separately', missingFinalPunct('Le temps est beau', 'Le temps est beau.', 'fra_Latn'), true],
    ['kept punct not counted', missingFinalPunct('Le temps est beau.', 'Le temps est beau.', 'fra_Latn'), false],
    ['word prefix of another word ok', sanityFlags('I saw them', 'I saw the theme.', 'eng_Latn'), []],
    ['thai no punct ok', sanityFlags('สวัสดีครับ วันนี้อากาศดีมาก', 'สวัสดีครับ วันนี้อากาศดีมากครับ', 'tha_Thai'), []],
    ['period before closing quote ok', sanityFlags('Il a dit : « Mike parle beaucoup. »', 'Il a déclaré : « Mike parle beaucoup. ».', 'fra_Latn'), []],
  ];
  let failed = 0;
  for (const [name, got, want] of cases) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got [${got}], want [${want}]`);
  }
  console.log(failed === 0 ? '\nsanity self-test: all passed' : `\nsanity self-test: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

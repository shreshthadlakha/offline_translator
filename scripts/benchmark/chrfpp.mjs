// chrF++ metric (Popovic 2017), following sacrebleu's implementation so the
// scores are comparable with the published NLLB-200 numbers:
//   - character n-grams, n = 1..6, over the text with ALL whitespace removed
//     (code points, so surrogate pairs never split)
//   - word n-grams, n = 1..2, over whitespace tokens
//   - per-order precision and recall, each averaged over the orders, then
//     F-score with beta = 2 (recall weighted double), scaled to 0..100
//   - corpus level: n-gram match/total counts are summed over all sentences
//     BEFORE precision/recall, which is how the published numbers were
//     computed; a per-sentence variant is provided for flagging and review
//   - case-sensitive headline (sacrebleu's default), with a lowercase variant
//     recorded too, because some chrF reporting lowercases
//
// Usage:
//   node scripts/benchmark/chrfpp.mjs --test            self test
//   node scripts/benchmark/chrfpp.mjs hyp.txt ref.txt   corpus score of two line-aligned files

const CHAR_ORDERS = [1, 2, 3, 4, 5, 6];
const WORD_ORDERS = [1, 2];
const BETA2 = 4; // beta = 2, squared
// ASCII punctuation, exactly sacrebleu's set for separating word tokens.
const PUNCTS = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));

function codePoints(text) {
  return Array.from(String(text ?? ''));
}

function charGrams(text, n) {
  // sacrebleu: all whitespace removed, code points, punctuation kept.
  const s = codePoints(String(text ?? '').replace(/\s+/g, ''));
  const m = new Map();
  for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n).join('');
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** sacrebleu's primitive tokenization: split ONE leading or trailing ASCII
 * punctuation mark off each whitespace token (chrF's own convention). */
function wordTokens(text) {
  const out = [];
  for (const w of String(text ?? '').split(/\s+/)) {
    if (!w) continue;
    if (w.length === 1) { out.push(w); continue; }
    const last = w[w.length - 1];
    const first = w[0];
    if (PUNCTS.has(last)) out.push(w.slice(0, -1), last);
    else if (PUNCTS.has(first)) out.push(first, w.slice(1));
    else out.push(w);
  }
  return out;
}

function wordGrams(text, n) {
  const t = wordTokens(text);
  const m = new Map();
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n).join(' ');
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function overlapOf(hypGrams, refGrams) {
  let overlap = 0;
  let hypTotal = 0;
  let refTotal = 0;
  for (const [g, c] of hypGrams) {
    hypTotal += c;
    const rc = refGrams.get(g);
    if (rc) overlap += Math.min(c, rc);
  }
  for (const [, c] of refGrams) refTotal += c;
  // sacrebleu's guard: don't count hypothesis n-grams when the reference has
  // none at this order (a short reference must not punish precision).
  if (refGrams.size === 0) hypTotal = 0;
  return { overlap, hypTotal, refTotal };
}

/** Aggregate n-gram statistics for one order list (char or word). */
function orderStats(hyp, ref, orders, gramFn) {
  const perOrder = [];
  for (const n of orders) {
    const s = overlapOf(gramFn(hyp, n), gramFn(ref, n));
    perOrder.push(s);
  }
  return perOrder;
}

function fFromStats(allOrderStats) {
  // allOrderStats: array of {overlap, hypTotal, refTotal}, summed over segments
  // sacrebleu's "effective order": an order joins the average only when both
  // sides actually have n-grams of that order.
  let pSum = 0, rSum = 0, used = 0;
  for (const { overlap, hypTotal, refTotal } of allOrderStats) {
    if (hypTotal > 0 && refTotal > 0) {
      used++;
      pSum += overlap / hypTotal;
      rSum += overlap / refTotal;
    }
  }
  if (used === 0 || pSum + rSum === 0) return 0;
  const p = pSum / used;
  const r = rSum / used;
  return (100 * (1 + BETA2) * p * r) / (BETA2 * p + r);
}

function mergeStats(target, add) {
  for (let i = 0; i < add.length; i++) {
    target[i].overlap += add[i].overlap;
    target[i].hypTotal += add[i].hypTotal;
    target[i].refTotal += add[i].refTotal;
  }
}

function stats(hyp, ref) {
  return [
    ...orderStats(hyp, ref, CHAR_ORDERS, charGrams),
    ...orderStats(hyp, ref, WORD_ORDERS, wordGrams),
  ];
}

/** chrF++ for one sentence pair, 0..100. */
export function chrfppSentence(hyp, ref) {
  return fFromStats(stats(hyp, ref));
}

/**
 * Corpus-level chrF++: sums the match/total counts per n-gram order over all
 * sentence pairs first, then computes one F. This is the number comparable to
 * published per-direction scores.
 */
export function chrfppCorpus(hyps, refs) {
  const acc = stats('', '');
  let counted = 0;
  for (let i = 0; i < hyps.length; i++) {
    if (hyps[i] == null || refs[i] == null) continue;
    counted++;
    mergeStats(acc, stats(hyps[i], refs[i]));
  }
  if (counted === 0) return null;
  return fFromStats(acc);
}

/** Same metric, lowercased first (the variant some chrF reporting uses). */
export function chrfppCorpusLower(hyps, refs) {
  return chrfppCorpus(hyps.map((h) => (h == null ? h : String(h).toLowerCase())), refs.map((r) => (r == null ? r : String(r).toLowerCase())));
}

// --- self test (main module only) ---------------------------------------------------
import { pathToFileURL } from 'node:url';
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
const tests = [];

function approx(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  tests.push([ok, `${name}: got ${got.toFixed(2)}, want ${want} +/- ${tol}`]);
}

const identical = [
  'The quick brown fox jumps over the lazy dog.',
  'On 22 October 2009, the European Parliament decided to revise the directive.',
];
approx('identical corpus = 100', chrfppCorpus(identical, identical), 100, 0);
approx('identical sentence = 100', chrfppSentence(identical[0], identical[0]), 100, 0);

// Unrelated, different scripts: almost nothing can match.
approx(
  'unrelated cross-script near 0',
  chrfppCorpus(['Hello, how are you today?'], ['こんにちは、お元気ですか。']),
  0,
  5,
);
// Unrelated, same script: chrF has an inherent floor (shared letters); still low.
const sameScript = chrfppCorpus(['The committee approved the proposal unanimously.'], ['Suomen kieli on vaikea mutta kaunis.']);
approx('unrelated same-script low', sameScript, 0, 15);
tests.push([sameScript < 15, `unrelated same-script well under 15: got ${sameScript.toFixed(2)}`]);

// Partial overlap sits between: half the reference kept.
const halfRef = identical[1].split(' ').slice(0, 8).join(' ');
const halfScore = chrfppSentence(halfRef, identical[1]);
tests.push([halfScore > 30 && halfScore < 95, `half-reference in between: got ${halfScore.toFixed(2)}`]);

// Beta=2 favours recall: for a perfectly mirrored pair (hyp = half of ref vs
// ref = half of hyp), the recall-complete side scores higher than the
// precision-complete side. Under beta=1 they would be equal.
const eightWords = 'one two three four five six seven eight';
const fourWords = 'one two three four';
const recallComplete = chrfppSentence(eightWords, fourWords); // hyp superset: recall = 1
const precisionComplete = chrfppSentence(fourWords, eightWords); // hyp subset: precision = 1
tests.push([recallComplete > precisionComplete, `beta=2 recall weighting: recall-complete ${recallComplete.toFixed(1)} > precision-complete ${precisionComplete.toFixed(1)}`]);

// An empty hypothesis against a real reference scores 0.
approx('empty hypothesis = 0', chrfppSentence('', identical[0]), 0, 0.01);

// A hallucination (fluent, unrelated) scores low.
const hallucScore = chrfppSentence('Good daughter.', 'The children were playing in the garden while their grandfather watched from the window.');
tests.push([hallucScore < 25, `hallucination low: got ${hallucScore.toFixed(2)}`]);

if (isMain && process.argv.includes('--test')) {
  let failed = 0;
  for (const [ok, name] of tests) {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  console.log(failed === 0 ? '\nchrfpp self-test: all passed' : `\nchrfpp self-test: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

// --- file mode (main module only) --------------------------------------------------
if (isMain) {
  const [hypFile, refFile] = process.argv.slice(2);
  if (hypFile && refFile) {
    const { readFileSync } = await import('node:fs');
    const hyps = readFileSync(hypFile, 'utf8').replace(/\n$/, '').split('\n');
    const refs = readFileSync(refFile, 'utf8').replace(/\n$/, '').split('\n');
    if (hyps.length !== refs.length) {
      console.error(`line count mismatch: hyp ${hyps.length} vs ref ${refs.length}`);
      process.exit(1);
    }
    console.log(`corpus chrF++:       ${chrfppCorpus(hyps, refs).toFixed(2)}`);
    console.log(`corpus chrF++ (lc): ${chrfppCorpusLower(hyps, refs).toFixed(2)}`);
  } else {
    console.log('nothing to do: use --test, or pass hyp.txt ref.txt');
  }
}

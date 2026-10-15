// The P2c variant table: ONE definition of every decoding variant, shared by
// the token-fit check (token-fit.mjs), the runner (run.mjs -> browser-driver
// -> worker `init` message) and the report (p2c-report.mjs), so all three
// always agree on what A..E mean.
//
// Only decoding settings vary. Nothing here changes the app: the worker
// receives `decodeOverrides` ONLY when a variant is set, and falls back to
// SPEED_CONFIG.decoding otherwise. App defaults and routing are untouched.
//
// Variants (per the P2c brief):
//   A: current settings — max_new_tokens = min(200, max(12, round(1.6·src + 8)))
//   B: a generous limit — min(256, max(32, ceil(3·src) + 16))
//   C: B plus no_repeat_ngram_size 3
//   D: B plus beam search with 2 beams
//   E: B plus beam search with 4 beams

/** The token-limit part of a variant, mirroring the worker's formula
 *  min(cap, max(min, round|ceil(factor·srcTokens + plus))). */
export const VARIANT_LIMITS = {
  A: { factor: 1.6, plus: 8, cap: 200, min: 12, round: 'round' },
  B: { factor: 3, plus: 16, cap: 256, min: 32, round: 'ceil' },
};
VARIANT_LIMITS.C = VARIANT_LIMITS.B;
VARIANT_LIMITS.D = VARIANT_LIMITS.B;
VARIANT_LIMITS.E = VARIANT_LIMITS.B;

/** The generation part of a variant (undefined = the app's current setting). */
export const VARIANT_GENERATION = {
  A: {},
  B: {},
  C: { noRepeatNgramSize: 3 },
  D: { numBeams: 2 },
  E: { numBeams: 4 },
};

export const VARIANT_LABELS = {
  A: 'current settings',
  B: 'generous limit',
  C: 'B + no_repeat_ngram_size 3',
  D: 'B + beam search (2 beams)',
  E: 'B + beam search (4 beams)',
};

export const VARIANT_KEYS = ['A', 'B', 'C', 'D', 'E'];

/** The full override object the worker receives for a variant. Every variant
 *  carries rawOutput: true — a BENCHMARK-ONLY flag that returns the model's
 *  raw text without the terminal-punctuation restoration, so the scorer's
 *  truncation flags see what the model actually emitted (a restored mark
 *  glued onto a cut word like "ADT Corpor." would hide the cut). The scorer
 *  applies the same shared punct function itself for the app-visible chrF++,
 *  and the app never sends rawOutput, so the app always restores. Variant A
 *  with rawOutput is still the app's decoding exactly — nothing about
 *  generation changes. */
export function decodeOverridesFor(variant) {
  if (variant == null) return null;
  if (!VARIANT_LIMITS[variant]) throw new Error(`unknown variant ${variant}`);
  return { ...VARIANT_LIMITS[variant], ...VARIANT_GENERATION[variant], rawOutput: true };
}

/** The token limit a variant gives a source with this many tokens.
 *  Used by the fit check and the report; the worker computes the same thing
 *  through SPEED_CONFIG + overrides. */
export function tokenLimitFor(variant, srcTokens) {
  const l = VARIANT_LIMITS[variant] ?? VARIANT_LIMITS.A;
  const raw = l.factor * srcTokens + l.plus;
  const rounded = l.round === 'ceil' ? Math.ceil(raw) : Math.round(raw);
  return Math.min(l.cap, Math.max(l.min, rounded));
}

// The panel: seven failing directions (P2/P2b) plus two controls that pass.
export const PANEL = [
  { src: 'eng_Latn', tgt: 'hrv_Latn', note: 'group model (opus-mt-en-mul), quarantined' },
  { src: 'eng_Latn', tgt: 'hin_Deva', note: 'quarantined, worst chrF gap' },
  { src: 'eng_Latn', tgt: 'vie_Latn', note: 'quarantined' },
  { src: 'kor_Hang', tgt: 'eng_Latn', note: 'quarantined' },
  { src: 'tha_Thai', tgt: 'eng_Latn', note: 'quarantined' },
  { src: 'rus_Cyrl', tgt: 'eng_Latn', note: 'quarantined (borderline-fail edge)' },
  { src: 'eng_Latn', tgt: 'zho_Hans', note: 'quarantined (flag-rate driven)' },
  { src: 'eng_Latn', tgt: 'fra_Latn', note: 'control: passes today' },
  { src: 'eng_Latn', tgt: 'deu_Latn', note: 'control: passes today' },
];

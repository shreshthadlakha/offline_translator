// The quality bar (P2). Named, adjustable constants — nothing else in the
// pipeline hardcodes a threshold; every verdict in quality-table.md/json is
// computed from these numbers.
//
// A small model PASSES a language direction when BOTH are true:
//   1. its chrF++ (200-sentence FLORES-200 devtest sample, real browser worker
//      path) is within PASS_WITHIN_CHRF points of the full model's PUBLISHED
//      baseline chrF++ for that direction (or higher), and
//   2. at most MAX_FLAG_RATE of its sentences carry a sanity flag
//      (empty output, wrong script, repeat loop, length ratio, mid-word end).
// Within BORDERLINE_WITHIN_CHRF points (but more than PASS_WITHIN_CHRF below)
// is BORDERLINE. More than BORDERLINE_WITHIN_CHRF below is FAIL.
//
// CALIBRATION_OFFSET: P1 measured the local harness against the published
// numbers on the same model (node, greedy, q8, 200 of 1012 sentences vs
// Meta's full-devtest eval) and found a stable -1.38 chrF++ offset. The small
// models are measured with the same local methodology, so their gap vs the
// published baseline carries the same handicap. 0.0 keeps the literal
// published comparison (a small model exactly as good as the full model still
// passes: -1.38 is within 2.0). Set it to 1.38 to compensate instead.

export const PASS_WITHIN_CHRF = 2.0;
export const BORDERLINE_WITHIN_CHRF = 5.0;
/** Pass requires at most this fraction of sentences with a sanity flag. */
export const MAX_FLAG_RATE = 0.02;
/** Local-harness vs published-baseline offset; see the note above. */
export const CALIBRATION_OFFSET = 0.0;

/**
 * The verdict rule, in one place. gap = local chrF++ + CALIBRATION_OFFSET -
 * published baseline chrF++. flagRate = flagged sentences / n.
 *
 * Verdicts, exactly as the bar reads: PASS when the gap is within
 * PASS_WITHIN_CHRF (or higher) AND the flag rate is at most MAX_FLAG_RATE.
 * FAIL when the gap is more than BORDERLINE_WITHIN_CHRF below the baseline.
 * Everything else — including a chrF-pass level gap with a flag breach — is
 * BORDERLINE: the spec ties fail to the chrF gap alone, and the flag-rate
 * review showed most such breaches (en->ar 15.5%, en->zh 17.5%) are
 * missing-final-punctuation style, not broken output; the table keeps both
 * signals and the flag composition visible for every row.
 */
export function verdictFor(gap, flagRate) {
  if (gap == null) return 'error';
  if (gap < -BORDERLINE_WITHIN_CHRF) return 'fail';
  if (gap >= -PASS_WITHIN_CHRF && (flagRate == null || flagRate <= MAX_FLAG_RATE)) return 'pass';
  return 'borderline';
}

/** Self-test: the rule must behave exactly as the constants read. */
export function selfTest() {
  const cases = [
    [0, 0, 'pass'], [-2.0, 0, 'pass'], [-2.01, 0, 'borderline'], [-5.0, 0, 'borderline'],
    [-5.01, 0, 'fail'], [1.5, 0.02, 'pass'], [1.5, 0.021, 'borderline'], [1.5, 0.11, 'borderline'],
    [-4.0, 0.05, 'borderline'], [null, 0, 'error'],
  ];
  const fails = cases.filter(([g, f, want]) => verdictFor(g, f) !== want);
  if (fails.length) throw new Error(`quality-bar self-test failed: ${JSON.stringify(fails)}`);
  return `${cases.length}/${cases.length} ok`;
}

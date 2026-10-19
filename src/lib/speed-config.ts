/**
 * Timing and decoding knobs for the translation engine, in one place so the
 * behaviour can be reviewed and measured in a single pass.
 *
 * The fragment debounce adapts to how fast the engine actually translates,
 * using the rolling median of translating time (last 10 sentences):
 * - under 0.7 s per sentence: the engine is quick, a short 250 ms wait after
 *   the last keystroke is enough;
 * - 0.7 to 2 s: wait 700 ms, the middle setting, also used before any
 *   measurement exists;
 * - over 2 s: the unfinished sentence only translates after a real pause of
 *   1.5 s, so a slow engine never wastes work on every keystroke burst.
 * Enter and the Translate button always translate immediately, whatever the
 * setting.
 */

export const SPEED_CONFIG = {
  /** Adaptive debounce for the sentence still being typed. */
  fragmentDebounce: {
    /** Median translating time under which the short wait is used. */
    fastMedianMs: 700,
    /** Median translating time above which a real pause is required. */
    slowMedianMs: 2000,
    /** Wait after the last keystroke when the engine is fast. */
    fastWaitMs: 250,
    /** Wait after the last keystroke at medium speed. Also the default
     * before any measurement exists (the middle setting). */
    mediumWaitMs: 700,
    /** Pause required before the unfinished sentence translates on a slow
     * engine. */
    slowWaitMs: 1500,
  },

  /** Decoding: greedy, with a token budget tied to the source length. */
  decoding: {
    /** Greedy decoding: one beam, no sampling. */
    numBeams: 1,
    doSample: false,
    /** max_new_tokens = factor * source tokens + plus, capped. */
    factor: 1.6,
    plus: 8,
    cap: 200,
    /** Fallback token estimate when the tokenizer cannot be asked: about
     * four characters per token for Latin scripts. */
    charsPerToken: 4,
  },

  /** Sentences longer than this are split at commas or semicolons before
   * translation, so a long clause can't hit the model's limit. */
  sentenceSplitLimit: 200,

  /** Progress UI: at most this many aggregate updates per second. */
  progressThrottleMs: 250,

  /** Download stall watchdog: warn when no bytes arrive for this long. */
  downloadStallMs: 15000,

  /** Worker heartbeat: ping interval and how long without a pong means the
   * worker is presumed dead. */
  heartbeat: {
    intervalMs: 5000,
    timeoutMs: 15000,
    /** Posting a translate grants this much silence without a pong: wasm
     * inference blocks the worker's message loop, so pings posted while it
     * translates are answered only after the job finishes. Long enough for
     * the slowest single call (a full model batch of eight sentences). */
    busyGraceMs: 90_000,
  },

  /** Batch mode: sentences grouped into one inference call. */
  batch: {
    /**
     * Group size for batch mode jobs. Grouped calls measured 2.6x faster in
     * Node and about 4x faster in the browser (0.3 s per sentence one at a
     * time vs 0.6 s for a group of 8), but grouped generation in
     * transformers.js 3.8.1 leaves trailing artifacts on sequences that
     * finish early: doubled periods and stray fragments like "o.".
     * Correctness wins over throughput, so batch mode sends one sentence
     * per call. The worker keeps the grouped capability, so this is a
     * one line change if a library upgrade fixes the artifacts.
     */
    groupSize: 1,
    /** Only send grouped jobs when batching measured at least this much
     * faster than one sentence per call. */
    minSpeedup: 0.2,
  },

  /** Crash flag: a setup older than this is considered stale history, not a
   * crash from the last visit. */
  crashFlagMaxAgeMs: 10 * 60 * 1000,

  /** The large full model's memory: it holds about 2.5 GB while it runs, so
   * it is returned by ending the worker after these rules. */
  largeModel: {
    /** Unload it after the tab has been hidden this long, whatever the idle
     * setting says: a hidden tab is not translating. */
    hiddenUnloadMs: 3 * 60 * 1000,
    /** How often the unload watcher checks the two rules. */
    unloadCheckMs: 15_000,
  },

  /** How many translations the Details log keeps. */
  timingLogSize: 10,
} as const;

/** The adaptive wait for the unfinished sentence, from the rolling median. */
export function fragmentWaitMs(medianTranslateMs: number | null): number {
  const { fastMedianMs, slowMedianMs, fastWaitMs, mediumWaitMs, slowWaitMs } = SPEED_CONFIG.fragmentDebounce;
  if (medianTranslateMs == null) return mediumWaitMs;
  if (medianTranslateMs < fastMedianMs) return fastWaitMs;
  if (medianTranslateMs <= slowMedianMs) return mediumWaitMs;
  return slowWaitMs;
}

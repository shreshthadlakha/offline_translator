/**
 * Terminal punctuation restoration, shared by the app and the benchmark.
 *
 * Small translation models often drop the final punctuation mark of an
 * otherwise complete sentence. If the source sentence ended with a terminal
 * mark and the translation has none, this adds the matching mark for the
 * target language: the ideographic full stop for Chinese and Japanese, the
 * danda for Devanagari and Bengali, the Arabic question mark, the Urdu full
 * stop, and the plain mark the source used for Latin, Cyrillic, Greek and the
 * rest. It never rewrites a mark the model did produce, and never adds
 * anything for scripts whose languages do not use sentence terminal marks
 * (Thai and neighbours).
 *
 * One function, no dependencies, so the translation worker (the app's output
 * path) and the benchmark scorer import the exact same code and cannot drift.
 */

/** The three terminal mark kinds a source sentence can end with. */
type MarkKind = "period" | "exclaim" | "question";

/** Trailing closing quotes and brackets, looked through on both sides. */
const CLOSERS = /["'\u201d\u2019\u00bb\u203a)\]\u3009\u300b\u3011\u3015\u232a\u27e9]+$/;

/** Every character that counts as terminal here (superset per script). */
const TERMINAL_CHARS = new Set(
  [
    ".", "!", "?", // Latin, Cyrillic, Greek, Hebrew, ...
    "\u2026", // ellipsis — recognized so an output ending in one is left alone
    "\u3002", "\uff01", "\uff1f", "\uff0e", // 。 ！ ？ ．
    "\u061f", "\u06d4", // ؟ ۔
    "\u0964", "\u0965", // । ॥
    "\u1362", // ። Ethiopic full stop
    "\u2e2e", // ⸮ reversed question mark
  ],
);

/** Source terminal characters -> the kind of mark. */
const SOURCE_TERMINAL: Record<string, MarkKind> = {
  ".": "period", "\u3002": "period", "\uff0e": "period", "\u0964": "period", "\u0965": "period", "\u06d4": "period", "\u1362": "period",
  "!": "exclaim", "\uff01": "exclaim",
  "?": "question", "\uff1f": "question", "\u061f": "question", "\u2e2e": "question",
};

const PERIOD = ".", EXCLAIM = "!", QUESTION = "?";

/** Marks the target language writes, by the script part of its NLLB code. */
const SCRIPT_MARKS: Record<string, Record<MarkKind, string>> = {
  Hans: { period: "\u3002", exclaim: "\uff01", question: "\uff1f" },
  Hant: { period: "\u3002", exclaim: "\uff01", question: "\uff1f" },
  Jpan: { period: "\u3002", exclaim: "\uff01", question: "\uff1f" },
  Deva: { period: "\u0964", exclaim: EXCLAIM, question: QUESTION },
  Beng: { period: "\u0964", exclaim: EXCLAIM, question: QUESTION },
  Arab: { period: PERIOD, exclaim: EXCLAIM, question: "\u061f" },
  Ethi: { period: "\u1362", exclaim: EXCLAIM, question: QUESTION },
};

/** Languages that write no sentence terminal marks: never add one. */
const NO_TERMINAL_SCRIPTS = new Set(["Thai", "Laoo", "Khmr", "Mymr"]);

/** Whole-code overrides, for languages whose script is shared but mark is not. */
const CODE_MARKS: Record<string, Record<MarkKind, string>> = {
  // Urdu writes the full stop as the Arabic period is not: U+06D4.
  urd_Arab: { period: "\u06d4", exclaim: EXCLAIM, question: "\u061f" },
};

const DEFAULT_MARKS: Record<MarkKind, string> = { period: PERIOD, exclaim: EXCLAIM, question: QUESTION };

function marksForCode(code: string): Record<MarkKind, string> | null {
  const byCode = CODE_MARKS[code];
  if (byCode) return byCode;
  const script = code.includes("_") ? code.split("_")[1] : code;
  if (NO_TERMINAL_SCRIPTS.has(script)) return null;
  return SCRIPT_MARKS[script] ?? DEFAULT_MARKS;
}

/** The kind of terminal mark a source sentence ends with, or null.
 * A run of dots ("..." or "…") is an ellipsis, not a sentence mark: it
 * never triggers restoration. */
function sourceMarkKind(source: string): MarkKind | null {
  const s = String(source ?? "").trim().replace(CLOSERS, "").trimEnd();
  if (s.length === 0) return null;
  const last = s[s.length - 1]!;
  if (last === "\u2026") return null;
  if (last === "." && s[s.length - 2] === ".") return null;
  return SOURCE_TERMINAL[last] ?? null;
}

/**
 * Restore the final terminal mark. Adds the target language's matching mark
 * when the source sentence ended with one and the translation ended without
 * any — inserted before trailing closing quotes, so `قال "كلام"` becomes
 * `قال "كلام."`. Everything else is returned unchanged.
 */
export function restoreTerminalPunctuation(source: string, output: string, tgtCode: string): string {
  const out = String(output ?? "");
  const trimmed = out.trim();
  if (trimmed.length === 0) return out;

  const kind = sourceMarkKind(source);
  if (!kind) return out; // the source sentence carries no terminal mark

  const marks = marksForCode(String(tgtCode ?? ""));
  if (!marks) return out; // this language writes no sentence terminal marks

  // Look through trailing closing quotes/brackets: the mark belongs inside,
  // before them and before any spacing the model put there (« Pars. »).
  const closers = trimmed.match(CLOSERS);
  const head = closers ? trimmed.slice(0, trimmed.length - closers[0].length) : trimmed;
  const ws = head.match(/\s+$/);
  const core = ws ? head.slice(0, head.length - ws[0].length) : head;
  if (core.length === 0) return out;
  if (TERMINAL_CHARS.has(core[core.length - 1]!)) return out; // already terminal
  // An output that stops at a comma or colon is cut mid clause: adding a
  // period behind it would hide that, so it is left exactly as it is.
  if (/[,;:\u3001\uff0c\uff1b\uff1a\u060c\u061b]$/.test(core)) return out;

  return core + marks[kind] + (ws ? ws[0] : "") + (closers ? closers[0] : "");
}

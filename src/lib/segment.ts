/**
 * Sentence splitting, from the technical design.
 * Split on line breaks first, then split each line into sentences with
 * Intl.Segmenter. The fallback regular expression covers common terminators
 * across scripts: . ! ? … । ॥ ۔ ؟ 。 ！ ？
 * Line breaks are kept so the output has the same paragraph shape as the input.
 * A sentence longer than about 200 characters is split further at commas or
 * semicolons, so it isn't cut off by the model's length limit and long
 * clauses translate on their own.
 */

import { SPEED_CONFIG } from "./speed-config.ts";

export type SegmentedText = {
  /** Each line of the input, split into sentences. Empty lines are []. */
  lines: string[][];
};

const TERMINATORS = ".!?…।॥۔؟。！？";

// Commas and semicolons across the scripts this app supports.
const SOFT_BREAKS = ",;،؛，、；";

const segmenters = new Map<string, Intl.Segmenter | null>();

function getSegmenter(bcp47: string): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return null;
  if (!segmenters.has(bcp47)) {
    try {
      segmenters.set(bcp47, new Intl.Segmenter(bcp47, { granularity: "sentence" }));
    } catch {
      // Some engines throw on unknown tags. Retry with the base language.
      try {
        const base = bcp47.split("-")[0] ?? "en";
        segmenters.set(bcp47, new Intl.Segmenter(base, { granularity: "sentence" }));
      } catch {
        segmenters.set(bcp47, null);
      }
    }
  }
  return segmenters.get(bcp47) ?? null;
}

function endsWithTerminator(text: string): boolean {
  const trimmed = text.trimEnd();
  if (trimmed.length === 0) return false;
  return TERMINATORS.includes(trimmed[trimmed.length - 1] ?? "");
}

/** Common abbreviations that end in a period but do not end a sentence.
 * Kept deliberately small: only the ones that appear in everyday typing. */
const ABBREVIATIONS = ["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "no", "vs", "etc", "eg", "ie", "p", "fig"];

function isAbbreviation(before: string): boolean {
  // The word immediately before the period, letters only.
  const match = /[A-Za-z]+$/.exec(before);
  if (!match) return false;
  return ABBREVIATIONS.includes(match[0].toLowerCase());
}

/** True when the character after a terminator plausibly starts a new
 * sentence: whitespace or a quote, then an uppercase letter, a digit-free
 * start that is not a lowercase continuation. CJK terminators split
 * unconditionally (those scripts use no spaces between sentences). */
function startsNewSentence(next: string): boolean {
  if (next.length === 0) return true;
  const first = next[0] ?? "";
  if (/[0-9,.]/.test(first)) return false; // "3.14", "example.com."
  if (/[a-z]/.test(first)) return false; // "Mr. smith" style continuations
  return true;
}

/** The fallback splitter for browsers without Intl.Segmenter: split after a
 * terminator only when the terminator ends a run (end of line) or is
 * followed by a plausible sentence start, so decimals, abbreviations and
 * URLs are not cut mid token. Exported for tests. */
export function splitByRegex(line: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (!TERMINATORS.includes(ch)) continue;
    // Only the ASCII terminators participate in the look-ahead rules; the
    // script-specific ones (। ۔ ؟ 。 ！ ？ ॥) behave the same as before.
    const rest = line.slice(i + 1);
    if (ch === "." && isAbbreviation(line.slice(0, i))) continue;
    if (rest.length > 0 && !startsNewSentence(rest)) continue;
    // Consume a run of terminators (e.g. "!!!", "?!").
    let end = i + 1;
    while (end < line.length && TERMINATORS.includes(line[end] ?? "")) end++;
    const part = line.slice(start, end).trim();
    if (part.length > 0) parts.push(part);
    start = end;
    i = end - 1;
  }
  const tail = line.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

function splitLongSentence(sentence: string, limit = SPEED_CONFIG.sentenceSplitLimit): string[] {
  if (sentence.length <= limit) return [sentence];
  const pieces: string[] = [];
  let current = "";
  let cursor = 0;
  while (cursor < sentence.length) {
    // Find the next soft break after which the chunk would exceed the limit.
    let end = Math.min(cursor + limit, sentence.length);
    if (end < sentence.length) {
      let cut = -1;
      for (let i = end; i > cursor; i--) {
        const ch = sentence[i - 1] ?? "";
        if (SOFT_BREAKS.includes(ch)) {
          cut = i;
          break;
        }
      }
      if (cut > cursor) end = cut;
    }
    const chunk = sentence.slice(cursor, end).trim();
    if (chunk.length > 0) pieces.push(chunk);
    current = "";
    cursor = end;
  }
  void current;
  return pieces.length > 0 ? pieces : [sentence.trim()];
}

/** Split text into lines of sentences using the given language's conventions. */
export function segmentText(text: string, bcp47: string): SegmentedText {
  if (text.length === 0) return { lines: [] };
  const rawLines = text.split("\n");
  const segmenter = getSegmenter(bcp47);
  const lines: string[][] = [];
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      lines.push([]);
      continue;
    }
    let sentences: string[];
    if (segmenter) {
      sentences = Array.from(segmenter.segment(line))
        .map((s) => s.segment.trim())
        .filter((s) => s.length > 0);
    } else {
      sentences = splitByRegex(line);
    }
    // Guard against a segmenter that returns the whole line as one segment.
    if (sentences.length === 0) sentences = [line];
    const expanded: string[] = [];
    for (const s of sentences) {
      for (const piece of splitLongSentence(s)) expanded.push(piece);
    }
    lines.push(expanded);
  }
  return { lines };
}

/**
 * The trailing fragment: the final sentence of the final non empty line, when
 * it doesn't yet end with a terminator. That's the sentence still being typed.
 * Returns null when everything is complete.
 */
export function trailingFragment(segments: SegmentedText): { line: number; index: number; text: string } | null {
  for (let l = segments.lines.length - 1; l >= 0; l--) {
    const line = segments.lines[l];
    if (!line || line.length === 0) continue;
    const index = line.length - 1;
    const text = line[index] ?? "";
    if (!endsWithTerminator(text)) return { line: l, index, text };
    return null;
  }
  return null;
}

/** All sentences in order, with their position. */
export function flatSentences(segments: SegmentedText): { line: number; index: number; text: string }[] {
  const out: { line: number; index: number; text: string }[] = [];
  segments.lines.forEach((line, l) => {
    line.forEach((text, i) => out.push({ line: l, index: i, text }));
  });
  return out;
}

function isCJKBoundary(left: string, right: string): boolean {
  const cjkPunct = "。！？，、；：";
  const leftChar = left[left.length - 1] ?? "";
  const rightChar = right[0] ?? "";
  if (cjkPunct.includes(leftChar)) return true;
  const cjkRanges = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  return cjkRanges.test(rightChar);
}

export { isCJKBoundary };

/**
 * Join translated sentences back into one line, using a plain space unless the
 * boundary is between CJK characters, which take no space.
 */
export function joinSentences(parts: string[]): string {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (part.length === 0) continue;
    if (out.length === 0) {
      out = part;
      continue;
    }
    out += isCJKBoundary(out, part) ? part : ` ${part}`;
  }
  return out;
}

/** Rebuild paragraph text from per line sentence lists. */
export function joinLines(perLine: string[][]): string {
  return perLine.map((line) => joinSentences(line)).join("\n");
}

"use client";

/**
 * Real time translation. Scheduling and output assembly follow sections 6.5
 * and 6.6 of the technical design:
 * - every sentence except the trailing fragment queues straight away
 * - the trailing fragment is debounced about 200ms and replaces older ones
 * - Enter or the Translate button queues everything at manual priority
 * - the output is derived from the current sentences and the cache, never from
 *   the order results arrive in, so a late result can't overwrite a newer one
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEngineContext } from "@/hooks/use-engine";
import { translationCache } from "@/lib/cache";
import { languageByCode } from "@/lib/languages";
import { flatSentences, isCJKBoundary, joinLines, segmentText, trailingFragment } from "@/lib/segment";

export type OutputSpan = {
  text: string;
  state: "done" | "pending" | "failed";
  changed: boolean;
  /** Whether a space belongs before this span when rendered inline. */
  spaceBefore: boolean;
};

export type OutputModel = {
  /** Per line, per sentence render model. Empty lines are empty arrays. */
  lines: OutputSpan[][];
  plainText: string;
  pendingCount: number;
  failedCount: number;
  totalSentences: number;
  hasAnyOutput: boolean;
};

const FRAGMENT_DEBOUNCE_MS = 200;

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `t-${Date.now().toString(36)}-${idCounter}`;
}

export function useTranslator(srcCode: string, tgtCode: string) {
  const engine = useEngineContext();
  const [input, setInput] = useState("");
  const [cacheVersion, setCacheVersion] = useState(0);
  const [manualTick, setManualTick] = useState(0);

  const srcLang = languageByCode(srcCode);
  const tgtLang = languageByCode(tgtCode);

  const segments = useMemo(
    () => segmentText(input, srcLang?.bcp47 ?? "en"),
    [input, srcLang?.bcp47],
  );
  const sentences = useMemo(() => flatSentences(segments), [segments]);

  const pendingRef = useRef(new Map<string, { sentence: string; src: string; tgt: string }>());
  const pendingBySentenceRef = useRef(new Map<string, string>());
  const failuresRef = useRef(new Map<string, true>());
  const fragmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fragmentIdRef = useRef<string | null>(null);
  const lastShownRef = useRef<string[]>([]);

  const pairKey = useCallback(
    (src: string, tgt: string, sentence: string) => `${src}|${tgt}|${sentence}`,
    [],
  );

  // ---- results and errors from the worker -------------------------------------

  useEffect(() => {
    return engine.subscribe((message) => {
      if (message.type === "result") {
        const pending = pendingRef.current.get(message.id);
        if (pending) {
          translationCache.set(pending.src, pending.tgt, pending.sentence, message.text);
          pendingRef.current.delete(message.id);
          pendingBySentenceRef.current.delete(pairKey(pending.src, pending.tgt, pending.sentence));
          failuresRef.current.delete(pairKey(pending.src, pending.tgt, pending.sentence));
          setCacheVersion((v) => v + 1);
        }
      } else if (message.type === "error" && message.id !== undefined) {
        const pending = pendingRef.current.get(message.id);
        if (pending) {
          pendingRef.current.delete(message.id);
          pendingBySentenceRef.current.delete(pairKey(pending.src, pending.tgt, pending.sentence));
          failuresRef.current.set(pairKey(pending.src, pending.tgt, pending.sentence), true);
          setCacheVersion((v) => v + 1);
        }
      }
    });
  }, [engine, pairKey]);

  // ---- queueing ----------------------------------------------------------------

  const clearFragmentTimer = useCallback(() => {
    if (fragmentTimerRef.current !== null) {
      clearTimeout(fragmentTimerRef.current);
      fragmentTimerRef.current = null;
    }
  }, []);

  const dropFragmentRequest = useCallback(() => {
    const id = fragmentIdRef.current;
    if (id) {
      engine.cancel(id);
      const pending = pendingRef.current.get(id);
      if (pending) {
        pendingRef.current.delete(id);
        pendingBySentenceRef.current.delete(pairKey(pending.src, pending.tgt, pending.sentence));
      }
      fragmentIdRef.current = null;
    }
  }, [engine, pairKey]);

  const queueSentence = useCallback(
    (sentence: string, priority: "manual" | "sentence" | "fragment") => {
      const key = pairKey(srcCode, tgtCode, sentence);
      if (translationCache.get(srcCode, tgtCode, sentence) !== undefined) return;
      if (pendingBySentenceRef.current.has(key)) return;
      const id = nextId();
      pendingRef.current.set(id, { sentence, src: srcCode, tgt: tgtCode });
      pendingBySentenceRef.current.set(key, id);
      engine.translate(id, sentence, srcCode, tgtCode, priority);
    },
    [engine, pairKey, srcCode, tgtCode],
  );

  // Reschedule whenever the input, the pair, or engine readiness changes.
  useEffect(() => {
    if (engine.status !== "ready") return;

    // Drop requests for sentences that no longer exist, and anything left over
    // from a previous language pair.
    const needed = new Set(sentences.map((s) => s.text));
    for (const [id, pending] of Array.from(pendingRef.current)) {
      const stillNeeded =
        pending.src === srcCode && pending.tgt === tgtCode && needed.has(pending.sentence);
      if (!stillNeeded && id !== fragmentIdRef.current) {
        engine.cancel(id);
        pendingRef.current.delete(id);
        pendingBySentenceRef.current.delete(pairKey(pending.src, pending.tgt, pending.sentence));
      }
    }

    // The trailing fragment is debounced, and a newer fragment replaces any
    // older one still waiting.
    clearFragmentTimer();
    dropFragmentRequest();
    const fragment = trailingFragment(segments);
    if (fragment) {
      const text = fragment.text;
      fragmentTimerRef.current = setTimeout(() => {
        fragmentTimerRef.current = null;
        const id = nextId();
        const key = pairKey(srcCode, tgtCode, text);
        if (translationCache.get(srcCode, tgtCode, text) !== undefined) return;
        if (pendingBySentenceRef.current.has(key)) return;
        pendingRef.current.set(id, { sentence: text, src: srcCode, tgt: tgtCode });
        pendingBySentenceRef.current.set(key, id);
        fragmentIdRef.current = id;
        engine.translate(id, text, srcCode, tgtCode, "fragment");
      }, FRAGMENT_DEBOUNCE_MS);
    }

    // Complete sentences queue straight away, unless they already failed.
    for (const s of sentences) {
      if (fragment && s.line === fragment.line && s.index === fragment.index) continue;
      if (failuresRef.current.has(pairKey(srcCode, tgtCode, s.text))) continue;
      queueSentence(s.text, "sentence");
    }
  }, [
    sentences,
    segments,
    srcCode,
    tgtCode,
    engine.status,
    engine.readyTick,
    engine,
    clearFragmentTimer,
    dropFragmentRequest,
    queueSentence,
    pairKey,
  ]);

  // ---- output assembly -----------------------------------------------------------

  const output: OutputModel = useMemo(() => {
    const prev = lastShownRef.current;
    const lines: OutputSpan[][] = [];
    const flatValues: string[] = [];
    let pendingCount = 0;
    let failedCount = 0;
    let hasAnyOutput = false;

    segments.lines.forEach((line, lineIndex) => {
      const spans: OutputSpan[] = [];
      let previousText = "";
      line.forEach((sentence) => {
        const flatIndex = flatValues.length;
        const cached = translationCache.get(srcCode, tgtCode, sentence);
        if (cached !== undefined) {
          const changed = cached !== prev[flatIndex];
          if (cached.length > 0) hasAnyOutput = true;
          flatValues.push(cached);
          spans.push({
            text: cached,
            state: "done",
            changed,
            spaceBefore: previousText.length > 0 && !isCJKBoundary(previousText, cached),
          });
          previousText = cached;
        } else {
          // Keep showing the last known translation for this position instead
          // of blanking it, so the output doesn't flash.
          const last = prev[flatIndex] ?? "";
          const failed = failuresRef.current.has(pairKey(srcCode, tgtCode, sentence));
          flatValues.push(last);
          if (failed) {
            failedCount += 1;
            spans.push({ text: last, state: "failed", changed: false, spaceBefore: previousText.length > 0 && !isCJKBoundary(previousText, last) });
          } else {
            pendingCount += 1;
            spans.push({ text: last, state: "pending", changed: false, spaceBefore: previousText.length > 0 && !isCJKBoundary(previousText, last) });
          }
          previousText = last;
        }
      });
      lines.push(spans);
    });

    const plainText = joinLines(
      segments.lines.map((line, lineIndex) => (lines[lineIndex] ?? []).map((span) => span.text)),
    );

    return {
      lines,
      plainText,
      pendingCount,
      failedCount,
      totalSentences: flatValues.length,
      hasAnyOutput,
    };
    // cacheVersion and the pair drive recomputation when results arrive.
  }, [segments, srcCode, tgtCode, cacheVersion]);

  // Remember what was shown so pending lines can keep their last known text.
  useEffect(() => {
    const values: string[] = [];
    for (const line of output.lines) {
      for (const span of line) values.push(span.text);
    }
    lastShownRef.current = values;
  }, [output]);

  // ---- manual trigger -------------------------------------------------------------

  const translateNow = useCallback(() => {
    clearFragmentTimer();
    dropFragmentRequest();
    for (const s of sentences) {
      queueSentence(s.text, "manual");
    }
    setManualTick((t) => t + 1);
  }, [sentences, clearFragmentTimer, dropFragmentRequest, queueSentence]);

  const clearInput = useCallback(() => {
    clearFragmentTimer();
    dropFragmentRequest();
    for (const id of Array.from(pendingRef.current.keys())) {
      engine.cancel(id);
    }
    pendingRef.current.clear();
    pendingBySentenceRef.current.clear();
    failuresRef.current.clear();
    lastShownRef.current = [];
    setInput("");
    setCacheVersion((v) => v + 1);
  }, [engine, clearFragmentTimer, dropFragmentRequest]);

  // Tear down pending work when the hook goes away.
  useEffect(() => {
    return () => {
      if (fragmentTimerRef.current !== null) clearTimeout(fragmentTimerRef.current);
    };
  }, []);

  return {
    input,
    setInput,
    segments,
    output,
    translateNow,
    clearInput,
    manualTick,
    srcLang,
    tgtLang,
  };
}

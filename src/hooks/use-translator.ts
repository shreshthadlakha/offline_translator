"use client";

/**
 * Real time translation. Scheduling and output assembly follow the technical
 * design:
 * - every sentence except the trailing fragment queues straight away
 * - the trailing fragment waits, and the wait adapts to the engine's measured
 *   speed (see lib/speed-config.ts), so a slow engine never wastes work on
 *   every keystroke burst
 * - Enter or the Translate button queues everything at manual priority, the
 *   fragment included, immediately
 * - the output is derived from the current sentences and the cache, never from
 *   the order results arrive in, so a late result can't overwrite a newer one
 * - requests sent before the engine is ready are held by the engine and run
 *   the moment setup finishes, so nothing typed during setup is lost
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEngineContext } from "@/hooks/use-engine";
import { translationCache } from "@/lib/cache";
import { languageByCode } from "@/lib/languages";
import { flatSentences, isCJKBoundary, joinLines, segmentText, trailingFragment } from "@/lib/segment";
import { fragmentWaitMs } from "@/lib/speed-config";
import { medianTranslateMs } from "@/lib/speed-metrics";

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
  doneCount: number;
  totalSentences: number;
  hasAnyOutput: boolean;
  /** Wall time of the most recent translation burst, once it finished. */
  lastTranslatedMs: number | null;
};

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
  const [lastTranslatedMs, setLastTranslatedMs] = useState<number | null>(null);

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
  const burstStartRef = useRef<number | null>(null);
  const settledRef = useRef(false);
  const engineIdRef = useRef<string | null>(null);

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
          translationCache.set(pending.src, pending.tgt, pending.sentence, message.texts[0] ?? "");
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

  // When the engine fails or is switched, in flight requests are gone with
  // it. Clear them so everything still needed re-queues once it's back.
  useEffect(() => {
    if (engine.status === "error") {
      clearFragmentTimer();
      fragmentIdRef.current = null;
      for (const id of Array.from(pendingRef.current.keys())) {
        engine.cancel(id);
      }
      pendingRef.current.clear();
      pendingBySentenceRef.current.clear();
      setCacheVersion((v) => v + 1);
    }
  }, [engine, clearFragmentTimer]);

  const engineId = engine.engineInfo?.id ?? null;
  useEffect(() => {
    if (engineIdRef.current !== null && engineIdRef.current !== engineId) {
      // A different engine took over: the old one's jobs were disposed with
      // it and will never land. Cancel them so nothing is left pending.
      clearFragmentTimer();
      dropFragmentRequest();
      for (const id of Array.from(pendingRef.current.keys())) {
        engine.cancel(id);
      }
      pendingRef.current.clear();
      pendingBySentenceRef.current.clear();
      failuresRef.current.clear();
      setCacheVersion((v) => v + 1);
    }
    engineIdRef.current = engineId;
  }, [engineId, engine, clearFragmentTimer, dropFragmentRequest]);

  // Reschedule whenever the input or the pair changes. Requests sent before
  // the engine is ready are held by the engine and run when setup finishes.
  useEffect(() => {
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

    // The trailing fragment waits, for as long as the engine's measured
    // speed says it should. A newer fragment replaces any older one still
    // waiting, and cancels one already running: the result wouldn't be shown.
    clearFragmentTimer();
    dropFragmentRequest();
    const fragment = trailingFragment(segments);
    if (fragment) {
      const text = fragment.text;
      const waitMs = fragmentWaitMs(medianTranslateMs());
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
      }, waitMs);
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
    let doneCount = 0;
    let hasAnyOutput = false;

    segments.lines.forEach((line) => {
      const spans: OutputSpan[] = [];
      let previousText = "";
      line.forEach((sentence) => {
        const flatIndex = flatValues.length;
        const cached = translationCache.get(srcCode, tgtCode, sentence);
        if (cached !== undefined) {
          const changed = cached !== prev[flatIndex];
          if (cached.length > 0) hasAnyOutput = true;
          doneCount += 1;
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
      doneCount,
      totalSentences: flatValues.length,
      hasAnyOutput,
      lastTranslatedMs,
    };
    // cacheVersion and the pair drive recomputation when results arrive.
  }, [segments, srcCode, tgtCode, cacheVersion, lastTranslatedMs, pairKey]);

  // The translating burst: from the first sentence that goes pending to the
  // moment everything has landed. Measured outside the render itself.
  useEffect(() => {
    if (output.pendingCount > 0) {
      if (burstStartRef.current == null) burstStartRef.current = performance.now();
      settledRef.current = false;
    } else if (output.hasAnyOutput && burstStartRef.current != null && !settledRef.current) {
      settledRef.current = true;
      const duration = performance.now() - burstStartRef.current;
      burstStartRef.current = null;
      setLastTranslatedMs(Math.round(duration));
    }
  }, [output.pendingCount, output.hasAnyOutput]);

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
    burstStartRef.current = null;
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

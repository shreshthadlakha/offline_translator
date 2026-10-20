/**
 * Per sentence timing, kept for the last few translations only.
 *
 * Two numbers are recorded for every sentence: how long it waited in the
 * queue before the engine picked it up, and how long the engine spent
 * translating it. Keeping them apart is what tells slowness of the model
 * apart from work piling up.
 *
 * Privacy: only counts and durations are ever recorded. Never the text
 * itself, never the translation.
 */

import { SPEED_CONFIG } from "./speed-config.ts";

export type TranslationTiming = {
  /** Wall clock time the result arrived. */
  at: number;
  /** Characters of the source sentence. A count, not the text. */
  chars: number;
  /** Milliseconds waiting in the queue before translation started. */
  queueMs: number;
  /** Milliseconds the engine spent translating. */
  translateMs: number;
  /** The engine that produced the result. */
  engineId: string;
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

// The array is replaced, never mutated, so subscription snapshots see change.
let recent: TranslationTiming[] = [];

/** Record one finished translation. Text lengths only, never contents. */
export function recordTiming(timing: Omit<TranslationTiming, "at">): void {
  recent = [...recent, { ...timing, at: Date.now() }];
  if (recent.length > SPEED_CONFIG.timingLogSize) recent = recent.slice(recent.length - SPEED_CONFIG.timingLogSize);
  notify();
}

/** The most recent translations, oldest first. */
export function getTimings(): TranslationTiming[] {
  return recent;
}

export function clearTimings(): void {
  recent = [];
  notify();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The rolling median of translating time over the recent log. This is what
 * the adaptive debounce and the Details panel read.
 */
export function medianTranslateMs(): number | null {
  return median(recent.map((t) => t.translateMs));
}

/** Median queue wait, shown next to the translating median in Details. */
export function medianQueueMs(): number | null {
  return median(recent.map((t) => t.queueMs));
}

export function subscribeTimings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

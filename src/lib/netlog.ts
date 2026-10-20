/**
 * The request log behind the "Check for yourself" panel.
 *
 * Two sources feed it:
 * - a PerformanceObserver on the page, watching resource and navigation
 *   entries (everything the page itself asked for);
 * - the translation worker, which wraps fetch and reports each request back
 *   with only its origin, path and size (see src/workers/net-report.ts).
 *
 * Privacy rules for the log itself:
 * - query strings, request bodies, response bodies and typed text are never
 *   recorded; only the origin and path of each request and its size;
 * - the log lives in memory for the visit only;
 * - nothing is ever hidden: unknown or unexpected requests are grouped under
 *   "Anything else" and shown.
 *
 * The store is a plain module with subscribe/getSnapshot so only the panel
 * re-renders when a request lands, never the rest of the page.
 */

export type NetGroupName = "own" | "model" | "other";

export type NetEntry = {
  /** Origin plus path. The query string is stripped before recording. */
  path: string;
  /** Bytes transferred when known, otherwise 0. */
  size: number;
};

export type NetGroup = {
  count: number;
  bytes: number;
  entries: NetEntry[];
};

export type NetLogSnapshot = {
  own: NetGroup;
  model: NetGroup;
  other: NetGroup;
  /** Sentence translations completed this visit. */
  translations: number;
  /** Requests that started while a translation was in flight. */
  whileTranslating: number;
};

const EMPTY_GROUP: NetGroup = { count: 0, bytes: 0, entries: [] };

const EMPTY_SNAPSHOT: NetLogSnapshot = {
  own: EMPTY_GROUP,
  model: EMPTY_GROUP,
  other: EMPTY_GROUP,
  translations: 0,
  whileTranslating: 0,
};

let snapshot: NetLogSnapshot = {
  own: { count: 0, bytes: 0, entries: [] },
  model: { count: 0, bytes: 0, entries: [] },
  other: { count: 0, bytes: 0, entries: [] },
  translations: 0,
  whileTranslating: 0,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeNetLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNetLogSnapshot(): NetLogSnapshot {
  return snapshot;
}

export function getServerNetLogSnapshot(): NetLogSnapshot {
  return EMPTY_SNAPSHOT;
}

// --- grouping -----------------------------------------------------------------

const HF_HOSTS = ["huggingface.co", "hf.co"];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isSameOrigin(url: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isHuggingFaceHost(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return HF_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Group a URL seen from the page (its name is the final URL after redirects). */
function classifyPageUrl(url: string): NetGroupName {
  if (isSameOrigin(url)) return "own";
  if (isHuggingFaceHost(url)) return "model";
  return "other";
}

/**
 * Group a request the worker made. A model file can redirect off
 * huggingface.co to a delivery host, so a request that started at a Hugging
 * Face host, or ended at one, counts as a model file.
 */
function classifyWorkerUrl(requestUrl: string, finalUrl: string): NetGroupName {
  if (isHuggingFaceHost(requestUrl) || isHuggingFaceHost(finalUrl)) return "model";
  if (isSameOrigin(requestUrl) || isSameOrigin(finalUrl)) return "own";
  return "other";
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

// --- translating intervals ----------------------------------------------------

const MAX_INTERVALS = 500;
/** Entry lists are capped too: a very long visit must not grow them
 *  without bound (L-14). */
const MAX_ENTRIES = 500;

/** Intervals during which the engine was actively translating. */
const intervals = new Map<string, { start: number; end: number | null }>();
/** Translations only actually run once the engine is ready. */
let engineReady = false;

function isDuringTranslation(at: number): boolean {
  for (const interval of intervals.values()) {
    if (at >= interval.start && (interval.end === null || at <= interval.end)) return true;
  }
  return false;
}

function pruneIntervals(): void {
  if (intervals.size <= MAX_INTERVALS) return;
  const keys = Array.from(intervals.keys());
  for (const key of keys.slice(0, keys.length - MAX_INTERVALS)) intervals.delete(key);
}

// --- recording ----------------------------------------------------------------

function bump(group: NetGroupName, entry: NetEntry, whileTranslating: boolean): void {
  const groups: Record<NetGroupName, NetGroup> = {
    own: { ...snapshot.own, entries: [...snapshot.own.entries] },
    model: { ...snapshot.model, entries: [...snapshot.model.entries] },
    other: { ...snapshot.other, entries: [...snapshot.other.entries] },
  };
  const current = groups[group];
  current.count += 1;
  current.bytes += entry.size;
  current.entries.push(entry);
  // The count and the bytes stay exact; only the displayed list is capped
  // (the oldest entries fall off, like the intervals map above).
  if (current.entries.length > MAX_ENTRIES) current.entries.splice(0, current.entries.length - MAX_ENTRIES);
  snapshot = {
    ...groups,
    translations: snapshot.translations,
    whileTranslating: snapshot.whileTranslating + (whileTranslating ? 1 : 0),
  };
  notify();
}

/** Record a request seen by the page's PerformanceObserver. */
export function recordPageResource(name: string, size: number, startTime: number): void {
  if (typeof window === "undefined") return;
  const group = classifyPageUrl(name);
  const path = stripQuery(name);
  const entry: NetEntry = {
    path: group === "own" ? path.replace(window.location.origin, "") || "/" : path,
    size,
  };
  bump(group, entry, isDuringTranslation(startTime));
}

/** Record a request the worker reported. Checked at receive time. */
export function recordWorkerFetch(requestUrl: string, finalUrl: string, size: number): void {
  if (typeof window === "undefined") return;
  const group = classifyWorkerUrl(requestUrl, finalUrl);
  const source = group === "own" ? requestUrl : finalUrl;
  const entry: NetEntry = {
    path: group === "own" ? stripQuery(source).replace(window.location.origin, "") || "/" : stripQuery(source),
    size,
  };
  bump(group, entry, isDuringTranslation(performance.now()));
}

/** A sentence translation completed. */
export function countTranslation(): void {
  snapshot = { ...snapshot, translations: snapshot.translations + 1 };
  notify();
}

export function setEngineReady(ready: boolean): void {
  engineReady = ready;
  if (!ready) intervals.clear();
}

export function markTranslateSent(id: string): void {
  if (!engineReady) return;
  intervals.set(id, { start: performance.now(), end: null });
  pruneIntervals();
}

export function markTranslateSettled(id: string): void {
  const interval = intervals.get(id);
  if (!interval) return;
  if (interval.end === null) interval.end = performance.now();
}

// --- the page side observer ---------------------------------------------------

/**
 * Watch everything the page asks for, from the start of the visit. buffered
 * entries cover requests made before the observer existed.
 */
export function startNetLogObserver(): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => {};

  const record = (entries: PerformanceEntryList): void => {
    for (const entry of entries) {
      const resource = entry as PerformanceResourceTiming;
      const size = resource.transferSize || resource.encodedBodySize || resource.decodedBodySize || 0;
      recordPageResource(entry.name, size, entry.startTime);
    }
  };

  const observers: PerformanceObserver[] = [];
  // Each observer reports whether its typed form was accepted; the legacy
  // entryTypes form is only registered when a typed one is missing, and it
  // then records only the entry types the typed observers could not cover
  // (M-2: registering both unconditionally double-counts every resource on
  // Chrome, Firefox and Safari).
  const tryObserve = (init: () => void): boolean => {
    try {
      init();
      return true;
    } catch {
      // That entry type isn't supported here. The rest still work.
      return false;
    }
  };

  // Resource entries: everything the page asked for except the document.
  // Navigation entries: the document itself. Both buffered, so requests made
  // before the observer existed are included.
  const resourceTypedOk = tryObserve(() => {
    const observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
    observers.push(observer);
  });
  const navigationTypedOk = tryObserve(() => {
    const observer = new PerformanceObserver((list) => record(list.getEntries()));
    observer.observe({ type: "navigation", buffered: true });
    observers.push(observer);
  });
  if (!resourceTypedOk || !navigationTypedOk) {
    // Older browsers without the typed form: record only what the typed
    // observers are not already covering.
    tryObserve(() => {
      const observer = new PerformanceObserver((list) =>
        record(
          list.getEntries().filter(
            (entry) =>
              (entry.entryType === "resource" && !resourceTypedOk) ||
              (entry.entryType === "navigation" && !navigationTypedOk),
          ),
        ),
      );
      observer.observe({ entryTypes: ["resource", "navigation"] });
      observers.push(observer);
    });
  }

  return () => {
    for (const observer of observers) observer.disconnect();
  };
}

/** The slice of the log the engine reports to. */
export const netlog = {
  countTranslation,
  markTranslateSent,
  markTranslateSettled,
  recordWorkerFetch,
  setEngineReady,
};

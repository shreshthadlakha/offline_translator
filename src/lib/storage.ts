/**
 * Safe localStorage wrappers. Storage can be unavailable (private mode,
 * blocked) or full, so every access is caught and falls back gracefully.
 *
 * Full is not unavailable: a full localStorage still reads fine, it only
 * refuses writes. The read path therefore never probes with a write — the
 * old probe made a full quota look like "no storage at all", hiding settings
 * and history that were still on disk. Writes report failure (false) when
 * the quota refuses them, after keeping the value in the session fallback so
 * this visit still works; reads prefer a value written to the fallback this
 * session over the stale one on disk. That shadow is per tab and accepted:
 * the one-tab rule makes a second writing tab the rare case, and the disk
 * copy catches up on this tab's next successful write.
 */

const memoryFallback = new Map<string, string>();

/** Storage is readable (access itself does not throw). Reads never write. */
function readable(): boolean {
  try {
    if (typeof window === "undefined") return false;
    void window.localStorage.getItem("__pt_probe__");
    return true;
  } catch {
    return false;
  }
}

export function storageGet(key: string): string | null {
  // A value written to the fallback this session (quota full) is newer than
  // whatever the disk still holds.
  if (memoryFallback.has(key)) return memoryFallback.get(key) ?? null;
  try {
    if (readable()) return window.localStorage.getItem(key);
    return null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    memoryFallback.delete(key);
    return true;
  } catch {
    // Unavailable, or full: keep it for this session. Reads still prefer
    // this over the stale disk value; the caller is told it did not persist.
    memoryFallback.set(key, value);
    return false;
  }
}

export function storageRemove(key: string): void {
  memoryFallback.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Unavailable or blocked: nothing more to remove.
  }
}

export function storageGetJSON<T>(key: string): T | null {
  const raw = storageGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function storageSetJSON(key: string, value: unknown): boolean {
  try {
    return storageSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** localStorage keys used by the app. */
export const STORAGE_KEYS = {
  history: "pt.history.v1",
  settings: "pt.settings.v1",
  modelReady: "pt.model.ready",
  /** Written while setup runs, cleared when it finishes. A leftover means
   * the last setup stopped before it was done. */
  setupCrash: "pt.setup.crash",
  /** Whether the Details panel was left open, remembered between visits. */
  detailsOpen: "pt.details.open",
} as const;

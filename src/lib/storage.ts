/**
 * Safe localStorage wrappers. Storage can be unavailable (private mode,
 * blocked) or full, so every access is caught and falls back gracefully.
 */

const memoryFallback = new Map<string, string>();

function available(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const probe = "__pt_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function storageGet(key: string): string | null {
  try {
    if (available()) return window.localStorage.getItem(key);
    return memoryFallback.get(key) ?? null;
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    if (available()) {
      window.localStorage.setItem(key, value);
      return true;
    }
    memoryFallback.set(key, value);
    return true;
  } catch {
    memoryFallback.set(key, value);
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    if (available()) window.localStorage.removeItem(key);
    memoryFallback.delete(key);
  } catch {
    memoryFallback.delete(key);
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
} as const;

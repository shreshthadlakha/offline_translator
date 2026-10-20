/**
 * The browser caches where downloaded models live, and the service worker's
 * shell cache.
 *
 * Pipeline engines (Opus-MT, NLLB) store their files in the Cache API under
 * "transformers-cache", keyed by their Hugging Face URLs. The IndicTrans2
 * and Bergamot engines verify each file against a SHA-256 checksum and keep
 * them under their own caches ("pt-indictrans2", "pt-bergamot"), keyed by
 * the same URL shape (repo, pinned revision, file; Bergamot adds the pair
 * directory before the file name). Every helper here works across all three
 * caches, so a single saved model can be removed without touching the
 * others, and Erase everything removes them all.
 */

import { INDICTRANS2_BUNDLES } from "./indictrans2/bundles.ts";
import { BERGAMOT_PAIRS, BERGAMOT_REVISION, BERGAMOT_CACHE } from "./bergamot/bundles.ts";
import { NLLB_BUNDLE } from "./nllb/bundles.ts";
import { MODEL_REVISIONS, allEngines } from "./engines.ts";

const MODEL_CACHES = ["transformers-cache", "pt-indictrans2", BERGAMOT_CACHE] as const;
/** Shell caches carry the build id: pt-shell-<buildId>, one per build
 * (see scripts/sw-template.js). The prefix is what the app owns. */
export const SHELL_CACHE_PREFIX = "pt-shell-";

/** Quantized ONNX files a pipeline engine needs to be considered saved. */
function requiredOnnxFiles(): string[] {
  return ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"];
}

/** Every file an engine needs to be considered saved. IndicTrans2 bundles
 * and Bergamot pairs need all of their files (the engines load them from the
 * cache); the lean full-model engine needs its whole pinned bundle; the
 * remaining pipeline engines need the two quantized ONNX files. */
function requiredFilesFor(modelId: string): string[] {
  for (const bundle of Object.values(INDICTRANS2_BUNDLES)) {
    if (bundle.repo === modelId) return bundle.files.map((f) => f.name);
  }
  for (const pair of Object.values(BERGAMOT_PAIRS)) {
    if (pair.modelId === modelId) return pair.files.map((f) => f.name);
  }
  if (modelId === NLLB_BUNDLE.repo) {
    return NLLB_BUNDLE.files.map((f) => f.name.split("/").pop()!);
  }
  return requiredOnnxFiles();
}

/** The model id part of a cache entry URL. Pipeline and IndicTrans2 entries
 * are "/<owner>/<repo>/resolve/<rev>/<file>" -> "<owner>/<repo>"; Bergamot
 * entries add the pair directory (".../<rev>/<pair>/<file>"), so the pair is
 * part of the model identity — one mirror repository, many models. */
function modelIdOf(url: string): string | null {
  return modelEntryIdentity(url).modelId;
}

/** The identity of a cache entry URL: which model it belongs to, and at
 * which revision. Exported for tests (M-5). */
export function modelEntryIdentity(url: string): { modelId: string | null; revision: string | null } {
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 4 && parts[2] === "resolve") {
      const revision = parts[3] ?? null;
      if (parts[1] === "firefox-translations" && parts.length >= 6) {
        return { modelId: `${parts[0]}/${parts[1]}/${parts[4]}`, revision };
      }
      return { modelId: `${parts[0]}/${parts[1]}`, revision };
    }
    return { modelId: null, revision: null };
  } catch {
    return { modelId: null, revision: null };
  }
}

/** The pinned revisions a model's cache entries are valid at (M-5): a pin
 * bump must not read as "already saved" while the engine re-downloads
 * everything. Exported for tests. */
export function pinnedRevisionsFor(modelId: string): Set<string> {
  const revisions = new Set<string>();
  const fromTable = MODEL_REVISIONS[modelId];
  if (fromTable) revisions.add(fromTable);
  if (modelId === NLLB_BUNDLE.repo) revisions.add(NLLB_BUNDLE.commit);
  if (modelId.startsWith("midudev/firefox-translations/")) revisions.add(BERGAMOT_REVISION);
  return revisions;
}

/** True when a cache entry counts as its model: the revision in its URL is
 * one of the model's pinned revisions (unknown models and unpinned shapes
 * pass through untouched). */
function entryIsPinned(url: string, modelId: string | null): boolean {
  if (modelId == null) return true;
  const pinned = pinnedRevisionsFor(modelId);
  if (pinned.size === 0) return true;
  const { revision } = modelEntryIdentity(url);
  return revision != null && pinned.has(revision);
}

function basenameOf(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

/** File names already saved in the cache for one model, at its pinned
 * revision. Empty when none. */
export async function cachedModelFiles(modelId: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    if (typeof caches === "undefined") return names;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const id = modelIdOf(request.url);
        if (id === modelId && entryIsPinned(request.url, id)) names.add(basenameOf(request.url));
      }
    }
  } catch {
    // Storage may be unavailable. Nothing is saved then.
  }
  return names;
}

/** True when the model's required files are in the cache. */
export async function modelFilesCached(modelId: string): Promise<boolean> {
  const names = await cachedModelFiles(modelId);
  return requiredFilesFor(modelId).every((file) => names.has(file));
}

/** Bytes stored in the caches for one model at its pinned revision, from
 *  response content lengths. */
export async function cachedModelBytes(modelId: string): Promise<number> {
  let total = 0;
  try {
    if (typeof caches === "undefined") return 0;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const id = modelIdOf(request.url);
        if (id !== modelId || !entryIsPinned(request.url, id)) continue;
        const response = await cache.match(request);
        const header = response?.headers.get("content-length");
        const size = header == null ? NaN : Number(header);
        if (Number.isFinite(size)) total += size;
      }
    }
  } catch {
    // Unavailable storage reads as zero.
  }
  return total;
}

/** The pinned total size of a model's whole bundle, when the app knows it:
 *  used as the displayed size when cache headers are missing (older cache
 *  entries were written without a content-length). */
function pinnedTotalBytesFor(modelId: string): number | null {
  for (const bundle of Object.values(INDICTRANS2_BUNDLES)) {
    if (bundle.repo === modelId) return bundle.totalBytes;
  }
  for (const pair of Object.values(BERGAMOT_PAIRS)) {
    if (pair.modelId === modelId) return pair.totalBytes;
  }
  if (modelId === NLLB_BUNDLE.repo) return NLLB_BUNDLE.totalBytes;
  const engine = allEngines().find((e) => e.modelId === modelId);
  return engine?.expectedBytes ?? null;
}

/** Every saved model with its size in bytes, across both model caches.
 *  Entries at a revision that is no longer pinned do not count: a pin bump
 *  must not double-list or double-count the model (M-5). A model whose
 *  required files are not all present (a cancelled download's leftovers)
 *  is not listed: it is not saved, and a row for it would claim something
 *  untrue. */
export async function savedModels(): Promise<Map<string, number>> {
  const found = new Map<string, { bytes: number; names: Set<string> }>();
  try {
    if (typeof caches === "undefined") return new Map();
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const modelId = modelIdOf(request.url);
        if (!modelId || !entryIsPinned(request.url, modelId)) continue;
        const response = await cache.match(request);
        const header = response?.headers.get("content-length");
        const size = header == null ? 0 : Number(header);
        const entry = found.get(modelId) ?? { bytes: 0, names: new Set<string>() };
        entry.bytes += Number.isFinite(size) ? size : 0;
        entry.names.add(basenameOf(request.url));
        found.set(modelId, entry);
      }
    }
  } catch {
    // Unavailable storage reads as empty.
  }
  const sizes = new Map<string, number>();
  for (const [modelId, entry] of found) {
    // Only complete models are "on this device": a cancelled download's
    // partial files must not show up as a saved model.
    const complete = requiredFilesFor(modelId).every((file) => entry.names.has(file));
    if (!complete) continue;
    // Older cache entries carry no content-length: the pinned bundle total
    // is the honest size for a complete model.
    const pinned = pinnedTotalBytesFor(modelId);
    sizes.set(modelId, entry.bytes > 0 ? entry.bytes : (pinned ?? entry.bytes));
  }
  return sizes;
}

/** Remove cache entries whose revision is no longer pinned (M-5): after a
 *  pin bump the old revision's files are orphans on the disk. Runs quietly
 *  after a successful load; best effort. */
export async function pruneStaleModelEntries(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const id = modelIdOf(request.url);
        if (id == null) continue;
        if (pinnedRevisionsFor(id).size === 0) continue; // not one of ours
        if (!entryIsPinned(request.url, id)) await cache.delete(request);
      }
    }
  } catch {
    // Best effort.
  }
}

/** Remove one saved model's entries from the caches. */
export async function deleteModelEntries(modelId: string): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        if (modelIdOf(request.url) === modelId) await cache.delete(request);
      }
    }
  } catch {
    // Best effort.
  }
}

/** Remove every saved model (both model caches). */
export async function deleteModelCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    for (const cacheName of MODEL_CACHES) {
      await caches.delete(cacheName);
    }
  } catch {
    // The cache may already be gone.
  }
}

/** Remove the service worker's shell cache, e.g. when files on the device
 * turned out to be out of date with each other. The cache name carries the
 * build id, so every shell cache of this app goes. */
export async function clearShellCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX)).map((name) => caches.delete(name)),
    );
  } catch {
    // Best effort.
  }
}

/**
 * The browser caches where downloaded models live, and the service worker's
 * shell cache.
 *
 * Pipeline engines (Opus-MT, NLLB) store their files in the Cache API under
 * "transformers-cache", keyed by their Hugging Face URLs. The IndicTrans2
 * engine verifies each file against a SHA-256 checksum and keeps them under
 * its own "pt-indictrans2" cache, keyed by the same URL shape (repo, pinned
 * commit, file). Every helper here works across both caches, so a single
 * saved model can be removed without touching the others, and Erase
 * everything removes them all.
 */

import { INDICTRANS2_BUNDLES } from "@/lib/indictrans2/bundles";

const MODEL_CACHES = ["transformers-cache", "pt-indictrans2"] as const;
/** Shell caches carry the build id: pt-shell-<buildId>, one per build
 * (see scripts/sw-template.js). The prefix is what the app owns. */
export const SHELL_CACHE_PREFIX = "pt-shell-";
/** @deprecated Old fixed-name shell cache from before per-build names. */
export const SHELL_CACHE_NAME = "pt-shell-v2";

/** Quantized ONNX files a pipeline engine needs to be considered saved. */
function requiredOnnxFiles(): string[] {
  return ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"];
}

/** Every file an engine needs to be considered saved. IndicTrans2 bundles
 * need all of their files (the sessions load them from the cache); pipeline
 * engines need the two quantized ONNX files. */
function requiredFilesFor(modelId: string): string[] {
  for (const bundle of Object.values(INDICTRANS2_BUNDLES)) {
    if (bundle.repo === modelId) return bundle.files.map((f) => f.name);
  }
  return requiredOnnxFiles();
}

/** The model id part of a cache entry URL, e.g. "Xenova/opus-mt-en-fr". */
function modelIdOf(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 4 && parts[2] === "resolve") return `${parts[0]}/${parts[1]}`;
    return null;
  } catch {
    return null;
  }
}

function basenameOf(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  } catch {
    return url;
  }
}

/** File names already saved in the cache for one model. Empty when none. */
export async function cachedModelFiles(modelId: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    if (typeof caches === "undefined") return names;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        if (modelIdOf(request.url) === modelId) names.add(basenameOf(request.url));
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

/** Bytes stored in the caches for one model, from response content lengths. */
export async function cachedModelBytes(modelId: string): Promise<number> {
  let total = 0;
  try {
    if (typeof caches === "undefined") return 0;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        if (modelIdOf(request.url) !== modelId) continue;
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

/** Every saved model with its size in bytes, across both model caches. */
export async function savedModels(): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  try {
    if (typeof caches === "undefined") return sizes;
    for (const cacheName of MODEL_CACHES) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const request of requests) {
        const modelId = modelIdOf(request.url);
        if (!modelId) continue;
        const response = await cache.match(request);
        const header = response?.headers.get("content-length");
        const size = header == null ? 0 : Number(header);
        sizes.set(modelId, (sizes.get(modelId) ?? 0) + (Number.isFinite(size) ? size : 0));
      }
    }
  } catch {
    // Unavailable storage reads as empty.
  }
  return sizes;
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

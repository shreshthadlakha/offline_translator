/**
 * The browser cache where the translation library keeps model files, and the
 * service worker's shell cache.
 *
 * Model files are stored by the library in the Cache API under
 * "transformers-cache", keyed by their Hugging Face URLs. Every helper here
 * works per model, so a single saved model can be removed without touching
 * the others.
 */

const MODEL_CACHE_NAME = "transformers-cache";
export const SHELL_CACHE_NAME = "pt-shell-v2";

/** Quantized ONNX files every engine needs to be considered saved. */
function requiredOnnxFiles(): string[] {
  return ["encoder_model_quantized.onnx", "decoder_model_merged_quantized.onnx"];
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
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    for (const request of requests) {
      if (modelIdOf(request.url) === modelId) names.add(basenameOf(request.url));
    }
  } catch {
    // Storage may be unavailable. Nothing is saved then.
  }
  return names;
}

/** True when the model's quantized ONNX files are in the cache. */
export async function modelFilesCached(modelId: string): Promise<boolean> {
  const names = await cachedModelFiles(modelId);
  return requiredOnnxFiles().every((file) => names.has(file));
}

/** Bytes stored in the cache for one model, from response content lengths. */
export async function cachedModelBytes(modelId: string): Promise<number> {
  let total = 0;
  try {
    if (typeof caches === "undefined") return 0;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    for (const request of requests) {
      if (modelIdOf(request.url) !== modelId) continue;
      const response = await cache.match(request);
      const header = response?.headers.get("content-length");
      const size = header == null ? NaN : Number(header);
      if (Number.isFinite(size)) total += size;
    }
  } catch {
    // Unavailable storage reads as zero.
  }
  return total;
}

/** Every saved model with its size in bytes. */
export async function savedModels(): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  try {
    if (typeof caches === "undefined") return sizes;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    for (const request of requests) {
      const modelId = modelIdOf(request.url);
      if (!modelId) continue;
      const response = await cache.match(request);
      const header = response?.headers.get("content-length");
      const size = header == null ? 0 : Number(header);
      sizes.set(modelId, (sizes.get(modelId) ?? 0) + (Number.isFinite(size) ? size : 0));
    }
  } catch {
    // Unavailable storage reads as empty.
  }
  return sizes;
}

/** Remove one saved model's entries from the cache. */
export async function deleteModelEntries(modelId: string): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(MODEL_CACHE_NAME);
    const requests = await cache.keys();
    for (const request of requests) {
      if (modelIdOf(request.url) === modelId) await cache.delete(request);
    }
  } catch {
    // Best effort.
  }
}

/** Remove every saved model (the whole library cache). */
export async function deleteModelCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(MODEL_CACHE_NAME);
  } catch {
    // The cache may already be gone.
  }
}

/** Remove the service worker's shell cache, e.g. when files on the device
 * turned out to be out of date with each other. */
export async function clearShellCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(SHELL_CACHE_NAME);
  } catch {
    // Best effort.
  }
}

/**
 * The Bergamot engine for the translation worker.
 *
 * Mozilla's Bergamot translator (Marian + intgemm) compiled to WebAssembly,
 * running Mozilla's Firefox Translations release models. Everything stays on
 * this app's terms:
 *  - The runtime (glue + wasm, MPL-2.0) is self-hosted from our own origin
 *    (/bergamot/, copied at install from the @mkljczk/bergamot-translator
 *    package) and verified against a SHA-256 pin before it is used.
 *  - The model files load straight from the byte-for-byte Mozilla mirror at
 *    an exact pinned revision, and every file is verified against a SHA-256
 *    checksum BEFORE the bytes are used or cached.
 *  - Once verified, everything lives in the browser's Cache API under the
 *    app's own cache name, so later visits work offline like the other
 *    engines.
 *
 * The Emscripten glue is a classic-worker script (global `Module` merge and
 * importScripts environment detection). This worker is a module worker, so
 * the engine provides an importScripts stub for the environment check,
 * passes the verified wasm bytes as Module.wasmBinary, and evaluates the
 * fetched glue text through indirect eval so it merges into the global
 * Module — the same merge importScripts performs in a classic worker.
 *
 * The wasm imports an intgemm module namespace "wasm_gemm" that the stock
 * glue does not provide (Firefox's extension glue and the npm package's
 * wrapper patch this in). The engine supplies it through
 * Module.instantiateWasm: Firefox's native WebAssembly.mozIntGemm when
 * present, otherwise the wasm's own exported fallback implementations wired
 * under the expected names — the npm package's own linkFallbackIntGemm,
 * mirrored exactly.
 *
 * The model config is the one Firefox's extension uses with these
 * intgemm.alphas.bin models, including gemm-precision int8shiftAlphaAll.
 * Translation runs on a BlockingService in this worker thread, off the page.
 */

import {
  BERGAMOT_PAIRS,
  BERGAMOT_RUNTIME,
  bergamotFileUrl,
  bergamotPairFor,
  type BergamotPinnedFile,
} from "../lib/bergamot/bundles";

/** Structural typing for the Emscripten module's embind surface. */
type BergamotModule = {
  AlignedMemory: new (bytes: number, alignment: number) => AlignedMemoryLike;
  AlignedMemoryList: new () => AlignedMemoryListLike;
  TranslationModel: new (
    config: string,
    model: AlignedMemoryLike,
    shortlist: AlignedMemoryLike,
    vocabs: AlignedMemoryListLike,
    qualityModel: null,
  ) => TranslationModelLike;
  BlockingService: new (config: { cacheSize: number }) => BlockingServiceLike;
  VectorString: new () => VectorStringLike;
  VectorResponseOptions: new () => { delete(): void };
  HEAPU8: Uint8Array;
};

type AlignedMemoryLike = {
  getByteArrayView(): Int8Array;
  size(): number;
  delete(): void;
};

type AlignedMemoryListLike = {
  push_back(memory: AlignedMemoryLike): void;
  size(): number;
  delete(): void;
};

type TranslationModelLike = {
  delete(): void;
};

type BlockingServiceLike = {
  translate(
    model: TranslationModelLike,
    input: VectorStringLike,
    options: { delete(): void },
  ): VectorResponseLike;
};

type VectorStringLike = {
  push_back(text: string): void;
  delete(): void;
};

type VectorResponseLike = {
  size(): number;
  get(i: number): { getTranslatedText(): string };
  delete?(): void;
};

// --- Pinned file fetching -----------------------------------------------------

type ProgressFn = (data: { status: string; file?: string; loaded?: number; total?: number }) => void;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch one pinned file from the app's own cache or its pinned URL. Serves
 * from the cache when the size matches the pin; otherwise downloads with
 * progress, verifies the SHA-256 and only then caches and returns the bytes.
 * A checksum mismatch is an error that must never be swallowed: the bytes are
 * not the model we benchmarked.
 */
async function fetchVerifiedFile(url: string, file: BergamotPinnedFile, cacheName: string, onProgress: ProgressFn): Promise<ArrayBuffer> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(url);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if (bytes.byteLength === file.bytes) {
      onProgress({ status: "done", file: file.name, loaded: file.bytes, total: file.bytes });
      return bytes;
    }
    // Wrong size for this pin: the cache entry is stale or corrupt. Drop it.
    await cache.delete(url);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${file.name}`);
  const total = Number(response.headers.get("content-length") ?? file.bytes);

  if (!response.body) {
    const bytes = await response.arrayBuffer();
    return await verifyAndCache(bytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress({ status: "initiate", file: file.name });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress({ status: "progress", file: file.name, loaded, total: total || file.bytes });
  }
  const all = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await verifyAndCache(all.buffer);

  async function verifyAndCache(bytes: ArrayBuffer): Promise<ArrayBuffer> {
    if (bytes.byteLength !== file.bytes) {
      throw new Error(`Size mismatch for ${file.name}: got ${bytes.byteLength}, pinned ${file.bytes}`);
    }
    const hex = await sha256Hex(bytes);
    if (hex !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}: the downloaded bytes are not the pinned model`);
    }
    try {
      await cache.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream", "content-length": String(bytes.byteLength) } }));
    } catch {
      // Cache storage may be unavailable (private mode). The bytes are still
      // verified and usable for this session.
    }
    onProgress({ status: "done", file: file.name, loaded: file.bytes, total: file.bytes });
    return bytes;
  }
}

// --- The engine ------------------------------------------------------------------

/** The model config Firefox's extension uses with intgemm.alphas.bin models.
 * Spaces between entries are significant to the YAML parser inside the wasm. */
const MODEL_CONFIG = `beam-size: 1
normalize: 1.0
word-penalty: 0
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
skip-cost: true
cpu-threads: 0
quiet: true
quiet-translation: true
gemm-precision: int8shiftAlphaAll
alignment: soft
`;

/** Aligned memory sizes per file type (Firefox's extension uses the same). */
const ALIGNMENTS = { model: 256, lex: 64, vocab: 64 } as const;

/**
 * The intgemm import the wasm needs but the stock glue does not provide.
 * Firefox ships a native implementation as WebAssembly.mozIntGemm; everywhere
 * else the wasm exports fallback implementations under different names.
 */
const GEMM_TO_FALLBACK: Record<string, string> = {
  int8_prepare_a: "int8PrepareAFallback",
  int8_prepare_b: "int8PrepareBFallback",
  int8_prepare_b_from_transposed: "int8PrepareBFromTransposedFallback",
  int8_prepare_b_from_quantized_transposed: "int8PrepareBFromQuantizedTransposedFallback",
  int8_prepare_bias: "int8PrepareBiasFallback",
  int8_multiply_and_add_bias: "int8MultiplyAndAddBiasFallback",
  int8_select_columns_of_b: "int8SelectColumnsOfBFallback",
};

function gemmImports(info: { env: { memory: WebAssembly.Memory } }): Record<string, (...args: unknown[]) => unknown> {
  const moz = (WebAssembly as unknown as { mozIntGemm?: () => WebAssembly.Module }).mozIntGemm;
  if (typeof moz === "function") {
    try {
      const nativeExports = new WebAssembly.Instance(moz(), { "": { memory: info.env.memory } }).exports as Record<string, unknown>;
      if (Object.keys(GEMM_TO_FALLBACK).every((f) => typeof nativeExports[f] === "function")) {
        return nativeExports as Record<string, (...args: unknown[]) => unknown>;
      }
    } catch {
      // Fall through to the wasm's own implementations.
    }
  }
  const fallback: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [key, name] of Object.entries(GEMM_TO_FALLBACK)) {
    fallback[key] = (...args: unknown[]) => {
      const mod = globalThis.Module as unknown as { asm?: Record<string, (...a: unknown[]) => unknown> };
      const fn = mod?.asm?.[name];
      if (typeof fn !== "function") throw new Error(`bergamot gemm fallback ${name} unavailable`);
      return fn(...args);
    };
  }
  return fallback;
}

export class BergamotEngine {
  private module: BergamotModule | null = null;
  private service: BlockingServiceLike | null = null;
  private model: TranslationModelLike | null = null;
  private pair: string | null = null;

  /** True when the engine holds a model for this pair already. */
  hasPair(pair: string): boolean {
    return this.pair === pair && this.model !== null;
  }

  /**
   * Load the runtime (once per worker lifetime; it stays across pair
   * switches) and the model files for one pair, with progress reporting
   * shaped exactly like the other engines'.
   */
  async load(pair: string, onProgress: ProgressFn): Promise<void> {
    await this.ensureRuntime(onProgress);
    if (this.hasPair(pair)) return;

    await this.disposeModel();
    this.pair = pair;

    const pinned = BERGAMOT_PAIRS[pair];
    if (!pinned) throw new Error(`unknown Bergamot pair ${pair}`);
    const buffers = new Map<string, ArrayBuffer>();
    for (const file of pinned.files) {
      const bytes = await fetchVerifiedFile(bergamotFileUrl(pair, file.name), file, "pt-bergamot", onProgress);
      buffers.set(file.name, bytes);
    }

    const module = this.module!;
    const modelFile = pinned.files.find((f) => f.name.startsWith("model."));
    const lexFile = pinned.files.find((f) => f.name.startsWith("lex."));
    const vocabFiles = pinned.files.filter((f) => f.name.endsWith(".spm"));
    if (!modelFile || !lexFile || vocabFiles.length === 0) throw new Error(`incomplete file set for ${pair}`);

    const aligned = (buffer: ArrayBuffer, alignment: number) => {
      const bytes = new Int8Array(buffer);
      const memory = new module.AlignedMemory(bytes.byteLength, alignment);
      memory.getByteArrayView().set(bytes);
      return memory;
    };

    const modelMemory = aligned(buffers.get(modelFile.name)!, ALIGNMENTS.model);
    const shortlistMemory = aligned(buffers.get(lexFile.name)!, ALIGNMENTS.lex);
    const vocabList = new module.AlignedMemoryList();
    for (const vocab of vocabFiles) {
      vocabList.push_back(aligned(buffers.get(vocab.name)!, ALIGNMENTS.vocab));
    }
    this.model = new module.TranslationModel(MODEL_CONFIG, modelMemory, shortlistMemory, vocabList, null);
  }

  private async ensureRuntime(onProgress: ProgressFn): Promise<void> {
    if (this.module && this.service) return;
    const cache = await caches.open("pt-bergamot");
    const glueUrl = `/bergamot/${BERGAMOT_RUNTIME.glue.name}`;
    const wasmUrl = `/bergamot/${BERGAMOT_RUNTIME.wasm.name}`;
    const cachedGlue = await cache.match(glueUrl);
    const cachedWasm = await cache.match(wasmUrl);
    const glueBuffer =
      cachedGlue && (await cachedGlue.arrayBuffer()).byteLength === BERGAMOT_RUNTIME.glue.bytes
        ? await cachedGlue.arrayBuffer()
        : null;
    const wasmBuffer =
      cachedWasm && (await cachedWasm.arrayBuffer()).byteLength === BERGAMOT_RUNTIME.wasm.bytes
        ? await cachedWasm.arrayBuffer()
        : null;

    let glue = glueBuffer ? new TextDecoder().decode(glueBuffer) : null;
    let wasm = wasmBuffer;
    if (!glue) {
      glue = new TextDecoder().decode(await fetchVerifiedFile(glueUrl, BERGAMOT_RUNTIME.glue, "pt-bergamot", onProgress));
    } else {
      onProgress({ status: "done", file: BERGAMOT_RUNTIME.glue.name, loaded: BERGAMOT_RUNTIME.glue.bytes, total: BERGAMOT_RUNTIME.glue.bytes });
    }
    if (!wasm) {
      wasm = await fetchVerifiedFile(wasmUrl, BERGAMOT_RUNTIME.wasm, "pt-bergamot", onProgress);
    } else {
      onProgress({ status: "done", file: BERGAMOT_RUNTIME.wasm.name, loaded: BERGAMOT_RUNTIME.wasm.bytes, total: BERGAMOT_RUNTIME.wasm.bytes });
    }

    // Module worker: importScripts does not exist. The glue only uses it for
    // environment detection (wasm loading is short-circuited by wasmBinary),
    // so a throwing stub is the honest way to say "must not happen" while
    // still taking the worker path.
    if (typeof importScripts !== "function") {
      self.importScripts = () => {
        throw new Error("importScripts must not be called in the bergamot engine");
      };
    }

    const moduleHolder: { wasmBinary: ArrayBuffer; instantiateWasm?: unknown; onRuntimeInitialized?: () => void } = {
      wasmBinary: wasm,
    };
    let resolveReady: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    moduleHolder.onRuntimeInitialized = () => resolveReady();
    moduleHolder.instantiateWasm = (info: { env: { memory: WebAssembly.Memory } }, accept: (instance: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(wasm!, { ...info, wasm_gemm: gemmImports(info) })
        .then((result) => accept(result.instance))
        .catch((err: unknown) => {
          throw err;
        });
      return {};
    };
    globalThis.Module = moduleHolder;
    // Indirect eval: global scope, so the glue's `var Module` merges into the
    // Module just placed on the global object.
    (0, eval)(glue);
    await Promise.race([
      ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Bergamot runtime init timeout")), 120_000)),
    ]);
    const loaded = globalThis.Module as unknown as BergamotModule;
    if (!loaded?.BlockingService) throw new Error("Bergamot runtime did not expose its API");
    this.module = loaded;
    this.service = new loaded.BlockingService({ cacheSize: 0 });
  }

  /**
   * Translate one sentence (or a group of sentences for batch mode). The
   * blocking service splits paragraphs into sentences internally; each input
   * string maps to one output string.
   */
  async translate(texts: string[], isCancelled: () => boolean): Promise<string[]> {
    if (!this.model || !this.service || !this.module) throw new Error("bergamot engine not loaded");
    const module = this.module;
    const out: string[] = [];
    for (const text of texts) {
      if (isCancelled()) throw new Error("cancelled");
      const responseOptions = new module.VectorResponseOptions();
      const input = new module.VectorString();
      const trimmed = text.trim();
      if (trimmed.length > 0) input.push_back(trimmed);
      const result = this.service.translate(this.model, input, responseOptions);
      const parts: string[] = [];
      for (let i = 0; i < result.size(); i++) {
        parts.push(result.get(i).getTranslatedText());
      }
      responseOptions.delete();
      input.delete();
      if (typeof result.delete === "function") result.delete();
      out.push(parts.join("\n").trim());
    }
    return out;
  }

  /** Warm up with a built-in sentence (never anything the person typed). */
  async warmUp(): Promise<boolean> {
    const out = await this.translate(["Hello."], () => false);
    return out.length > 0 && out[0]!.trim().length > 0;
  }

  private async disposeModel(): Promise<void> {
    if (this.model) {
      try {
        this.model.delete();
      } catch {
        // Best effort: the model is being replaced regardless.
      }
      this.model = null;
    }
    this.pair = null;
  }

  /**
   * Dispose the engine. The Marian model is freed; the runtime itself stays
   * loaded (its wasm heap never shrinks, but every later Bergamot pair
   * reuses it). The worker is terminated when the app switches away from
   * Bergamot entirely, which releases the heap.
   */
  async dispose(): Promise<void> {
    await this.disposeModel();
  }

  /** Wasm heap size in bytes, for the Details panel. */
  wasmHeapBytes(): number | null {
    return this.module?.HEAPU8?.buffer?.byteLength ?? null;
  }
}

/** The pair key serving an NLLB code pair, or null (no route). */
export function bergamotPairForCodes(src: string, tgt: string): string | null {
  return bergamotPairFor(src, tgt);
}

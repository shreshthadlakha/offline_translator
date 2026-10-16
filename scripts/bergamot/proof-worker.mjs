/// P10 proof worker: runs the Bergamot translator runtime inside a Web Worker
/// exactly the way the app will run it — a module worker (no importScripts)
/// that fetches the self-hosted runtime with SHA-256 verification, evaluates
/// the Emscripten glue with a global Module carrying wasmBinary, downloads
/// the pinned model files from the mirror, and translates Croatian in both
/// directions while measuring download size, load time, memory and seconds
/// per sentence. Nothing typed or translated leaves the device: the only
/// network requests are the app's own runtime files and the one-time model
/// download from the pinned mirror revision.

const RUNTIME_GLUE = {
  name: "bergamot-translator-worker.js",
  url: "/bergamot/bergamot-translator-worker.js",
  bytes: 80474,
  sha256: "bc2fc98d859845162817f9526c39eb1ca4805f7149dfebc0fbcda4d2af68e13c",
};
const RUNTIME_WASM = {
  name: "bergamot-translator-worker.wasm",
  url: "/bergamot/bergamot-translator-worker.wasm",
  bytes: 5241884,
  sha256: "735d4d95ede043c48f146b9a89336077f18885ad30b7e9a6a86c51a73ca02e7b",
};

const MODEL_BASE =
  "https://huggingface.co/midudev/firefox-translations/resolve/6f6acd72c26975a06a8e61b72d1fbacbd184c23f";

const PAIR_FILES = {
  "en-hr": [
    { name: "model.enhr.intgemm.alphas.bin", bytes: 31561787, sha256: "2f34590dff70aec009d3c6e9bee7a4a18aa6a0a1978c7dc49c686eb454b77704" },
    { name: "lex.50.50.enhr.s2t.bin", bytes: 3232644, sha256: "70cf1afc8aeb6d7ed7dc269ccdd4e40e2d139a2b1106313c94210d32b14bc845" },
    { name: "vocab.enhr.spm", bytes: 820766, sha256: "6b86a23aac0ba7aae69218826600afe1c70b3e5830814d9428f7248d23e016f8" },
  ],
  "hbs-en": [
    { name: "model.hbsen.intgemm.alphas.bin", bytes: 31561787, sha256: "744c61ec0b987c44717f192fcebda7c2a1ac34f5cbfb56672771d28ff79c82c7" },
    { name: "lex.50.50.hbsen.s2t.bin", bytes: 5155408, sha256: "dccff06320cb87aaa6f93c246038b453d0d0c6f47fa3acd1162f104ac6a2c43f" },
    { name: "vocab.hbsen.spm", bytes: 817335, sha256: "320561e2cef014a6d626a64822add3a387c91f609f23ea3b7f421d194075c14c" },
  ],
};

// The exact model config Firefox's extension uses with intgemm.alphas.bin
// models (gemm-precision int8shiftAlphaAll, not the demo site's
// int8shiftAll). Spaces between entries are significant to the YAML parser.
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

const EN_SENTENCES = [
  "Good morning.",
  "Where is the nearest pharmacy?",
  "The weather is nice today. I forgot my umbrella at the office.",
  "This service works entirely on your device; nothing you type ever leaves it.",
  "Firefighters finally brought the fire under control at 11:35 at night.",
  "She said she would travel to Zagreb next week to visit her grandmother.",
  "The document must be signed and submitted before Friday afternoon.",
  "Croatia's national football team reached the World Cup final in 2018.",
];

const HR_SENTENCES = [
  "Dobro jutro.",
  "Gdje je najbliža ljekarna?",
  "Danas je lijepo vrijeme. Kišobran sam ostavio u uredu.",
  "Vatrogasci su konačno stavili požar pod kontrolu u 23:35.",
  "Rekla je da će sljedeći tjedan putovati u Zagreb kako bi posjetila baku.",
  "Dokument mora biti potpisan i predan najkasnije u petak poslijepodne.",
  "Ova usluga radi u potpunosti na vašem uređaju.",
  "Hrvatska nogometna reprezentacija igrala je finale Svjetskog prvenstva 2018.",
];

const CACHE = "pt-bergamot-proof";

function post(message) {
  self.postMessage(message);
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verified fetch with progress reporting; caches only verified bytes. */
async function fetchVerified(file, reportEvery = 1 << 21) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(file.url);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if (bytes.byteLength === file.bytes) {
      post({ type: "file", file: file.name, status: "done", loaded: file.bytes, total: file.bytes, cached: true });
      return bytes;
    }
    await cache.delete(file.url);
  }
  const t0 = performance.now();
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${file.name}`);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (loaded - lastReport >= reportEvery) {
      lastReport = loaded;
      post({ type: "file", file: file.name, status: "downloading", loaded, total: file.bytes });
    }
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const arrayBuffer = buffer.buffer;
  if (arrayBuffer.byteLength !== file.bytes) {
    throw new Error(`${file.name}: expected ${file.bytes} bytes, got ${arrayBuffer.byteLength}`);
  }
  const hash = await sha256Hex(arrayBuffer);
  if (hash !== file.sha256) {
    throw new Error(`${file.name}: sha256 mismatch (${hash.slice(0, 16)}…, expected ${file.sha256.slice(0, 16)}…)`);
  }
  await cache.put(file.url, new Response(arrayBuffer));
  post({ type: "file", file: file.name, status: "done", loaded: file.bytes, total: file.bytes, ms: Math.round(performance.now() - t0) });
  return arrayBuffer;
}

// --- Runtime ---------------------------------------------------------------

let Module = null;

async function initRuntime() {
  post({ type: "stage", stage: "runtime-download" });
  const [glueText, wasmBuffer] = await Promise.all([
    fetchVerifiedText(RUNTIME_GLUE),
    fetchVerified(RUNTIME_WASM),
  ]);
  post({ type: "stage", stage: "runtime-init" });
  const t0 = performance.now();
  // Our worker is a module worker: importScripts does not exist here. The
  // Emscripten glue only uses it for environment detection (and for wasm
  // loading, which wasmBinary short-circuits), so a stub that throws is the
  // honest way to say "must not happen" while still taking the worker path.
  if (typeof importScripts !== "function") {
    self.importScripts = () => {
      throw new Error("importScripts must not be called in the bergamot engine");
    };
  }
  const module = { wasmBinary: wasmBuffer };
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  module.onRuntimeInitialized = () => resolveReady();
  // The wasm imports an intgemm module namespace "wasm_gemm" that the plain
  // glue does not provide (Firefox's extension glue and the npm package's
  // wrapper patch this in via Module.instantiateWasm). Firefox ships a native
  // implementation as WebAssembly.mozIntGemm; everywhere else the wasm
  // exports fallback implementations under different names, which we wire in
  // here — exactly the npm package's own linkFallbackIntGemm.
  module.instantiateWasm = (info, accept) => {
    const gemm = gemmImports(info);
    WebAssembly.instantiate(wasmBuffer, { ...info, wasm_gemm: gemm })
      .then((result) => accept(result.instance))
      .catch((err) => {
        throw err;
      });
    return {};
  };
  globalThis.Module = module;
  // Indirect eval: global scope, so the glue's `var Module` merges into the
  // Module we just placed on the global object (the same merge importScripts
  // performs in a classic worker).
  (0, eval)(glueText);
  await Promise.race([
    ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error("runtime init timeout")), 120_000)),
  ]);
  Module = globalThis.Module;
  return { ms: Math.round(performance.now() - t0) };
}

const GEMM_TO_FALLBACK = {
  int8_prepare_a: "int8PrepareAFallback",
  int8_prepare_b: "int8PrepareBFallback",
  int8_prepare_b_from_transposed: "int8PrepareBFromTransposedFallback",
  int8_prepare_b_from_quantized_transposed: "int8PrepareBFromQuantizedTransposedFallback",
  int8_prepare_bias: "int8PrepareBiasFallback",
  int8_multiply_and_add_bias: "int8MultiplyAndAddBiasFallback",
  int8_select_columns_of_b: "int8SelectColumnsOfBFallback",
};

function gemmImports(info) {
  if (typeof WebAssembly.mozIntGemm === "function") {
    try {
      const nativeExports = new WebAssembly.Instance(WebAssembly.mozIntGemm(), { "": { memory: info.env.memory } }).exports;
      if (Object.keys(GEMM_TO_FALLBACK).every((f) => typeof nativeExports[f] === "function")) {
        post({ type: "log", text: "gemm: native mozIntGemm linked" });
        return nativeExports;
      }
    } catch {
      // Fall through to the wasm's own implementations.
    }
  }
  const fallback = {};
  for (const [key, name] of Object.entries(GEMM_TO_FALLBACK)) {
    fallback[key] = (...args) => globalThis.Module.asm[name](...args);
  }
  post({ type: "log", text: "gemm: wasm fallback implementations linked" });
  return fallback;
}

async function fetchVerifiedText(file) {
  // Same verification, but returns the script text.
  const buffer = await fetchVerified(file);
  return new TextDecoder().decode(buffer);
}

// --- Model -------------------------------------------------------------------

function aligned(buffer, alignment) {
  const bytes = new Int8Array(buffer);
  const memory = new Module.AlignedMemory(bytes.byteLength, alignment);
  memory.getByteArrayView().set(bytes);
  return memory;
}

async function loadModel(pair) {
  post({ type: "stage", stage: `model-download:${pair}` });
  const buffers = {};
  for (const file of PAIR_FILES[pair]) {
    buffers[file.name] = await fetchVerified({ ...file, url: `${MODEL_BASE}/${pair}/${file.name}` });
  }
  post({ type: "stage", stage: `model-init:${pair}` });
  const t0 = performance.now();
  const modelFile = PAIR_FILES[pair].find((f) => f.name.startsWith("model."));
  const lexFile = PAIR_FILES[pair].find((f) => f.name.startsWith("lex."));
  const vocabFiles = PAIR_FILES[pair].filter((f) => f.name.endsWith(".spm"));
  const modelMemory = aligned(buffers[modelFile.name], 256);
  const shortlistMemory = aligned(buffers[lexFile.name], 64);
  const vocabList = new Module.AlignedMemoryList();
  for (const vocab of vocabFiles) {
    vocabList.push_back(aligned(buffers[vocab.name], 64));
  }
  const model = new Module.TranslationModel(MODEL_CONFIG, modelMemory, shortlistMemory, vocabList, null);
  return { model, ms: Math.round(performance.now() - t0) };
}

// --- Translation ---------------------------------------------------------------

function translate(model, service, text) {
  const responseOptions = new Module.VectorResponseOptions();
  const input = new Module.VectorString();
  input.push_back(text);
  const result = service.translate(model, input, responseOptions);
  const out = [];
  for (let i = 0; i < result.size(); i++) {
    out.push(result.get(i).getTranslatedText());
  }
  responseOptions.delete();
  input.delete();
  if (typeof result.delete === "function") result.delete();
  return out.join("\n");
}

function heap() {
  const memory = performance.memory;
  const wasmHeap = Module && Module.HEAPU8 ? Module.HEAPU8.buffer.byteLength : null;
  return {
    jsUsedMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
    jsLimitMB: memory ? Math.round(memory.jsHeapSizeLimit / 1048576) : null,
    wasmHeapMB: wasmHeap ? Math.round(wasmHeap / 1048576) : null,
  };
}

// --- Proof -------------------------------------------------------------------

const result = { startedAt: new Date().toISOString(), logs: [] };

try {
  post({ type: "log", text: "Bergamot proof worker started (module worker)" });

  const runtime = await initRuntime();
  result.runtimeInitMs = runtime.ms;
  post({ type: "log", text: `runtime initialized in ${runtime.ms} ms; version ${Module.BERGAMOT_VERSION_FULL ?? "?"}` });

  const service = new Module.BlockingService({ cacheSize: 0 });

  const heapAfterRuntime = heap();
  result.heapAfterRuntime = heapAfterRuntime;

  for (const [pair, direction, sentences] of [
    ["en-hr", "English -> Croatian", EN_SENTENCES],
    ["hbs-en", "Croatian -> English (hbs-en model)", HR_SENTENCES],
  ]) {
    const loaded = await loadModel(pair);
    const heapAfterModel = heap();
    const roundMs = { cold: [], warm: [] };
    const outputs = [];
    for (const text of sentences) {
      const t0 = performance.now();
      const out = translate(loaded.model, service, text);
      roundMs.cold.push(performance.now() - t0);
      outputs.push({ src: text, out });
    }
    for (const text of sentences) {
      const t0 = performance.now();
      translate(loaded.model, service, text);
      roundMs.warm.push(performance.now() - t0);
    }
    const stats = (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        median: +sorted[Math.floor(sorted.length / 2)].toFixed(1),
        mean: +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1),
        max: +Math.max(...xs).toFixed(1),
      };
    };
    result[pair] = {
      direction,
      loadMs: loaded.ms,
      heapAfterModel,
      cold: stats(roundMs.cold),
      warm: stats(roundMs.warm),
      outputs,
    };
    post({ type: "log", text: `${pair} (${direction}): load ${loaded.ms} ms, warm median ${stats(roundMs.warm).median} ms/sentence` });
    loaded.model.delete();
  }

  result.heapFinal = heap();
  result.finishedAt = new Date().toISOString();
  post({ type: "done", result });
} catch (err) {
  post({ type: "error", message: `${err && err.message ? err.message : String(err)}`, stack: String(err && err.stack).slice(0, 2000) });
}

/**
 * The lean full-model engine (NLLB-200 distilled 600M) for the translation
 * worker.
 *
 * Why this exists: the transformers.js pipeline builds every ONNX session
 * through one Promise.all, so while the full model loads both 895 MB of file
 * buffers are alive in the JavaScript heap AND both sessions' weights are
 * being copied into the WebAssembly heap at the same time. The library's own
 * numbers put the peak near 2.8 GB, and a 4 GB machine never finished loading
 * it in a browser. This engine removes exactly that simultaneity:
 *
 *  - Files are fetched one at a time, each with progress and a SHA-256 check
 *    against the pinned bundle, and each downloaded buffer goes out of scope
 *    the moment its session exists (the runtime copies the weights into its
 *    own heap during session creation, so the JavaScript copy is garbage
 *    immediately after).
 *  - The encoder session is fully built before the decoder's bytes are even
 *    requested. Never two buffers, never two session builds at once.
 *  - Session options trim everything trimmable: no CPU memory arena, no
 *    memory pattern, WebAssembly execution only, graph optimization honored
 *    from the init message.
 *
 * The tokenizer is still the library's own NllbTokenizer, driven through its
 * own _build_translation_inputs — the same post-processor language prefix,
 * the same forced target-language token, the same decode. Decoding is greedy
 * with the merged decoder's past-key-value cache, mirroring the library's
 * generation loop step for step: the first call feeds the decoder start
 * token with zero-length past tensors and use_cache_branch false; the target
 * language token is forced (the library's ForcedBOS processor at length 1);
 * every later call feeds exactly one token with the cache and
 * use_cache_branch true; argmax breaks ties toward the first index, exactly
 * like the library's max(); generation stops at the eos token or the same
 * SPEED_CONFIG token budget the pipeline engines use.
 *
 * Cache: the same "transformers-cache" bucket and the same URL keys the
 * pipeline used, so a download from an earlier version of the app remains
 * valid — every read is hash-verified regardless of where the bytes came
 * from, and a mismatched entry is dropped and fetched again.
 */

import { NllbTokenizer } from "@huggingface/transformers";
// The ONNX runtime is imported directly, the way the IndicTrans2 engine does
// it: the worker's build resolves this import and the transformers library's
// own 'onnxruntime-web' import to the same module, so both share one runtime
// instance and one wasmPaths configuration.
import * as ortModule from "onnxruntime-web";
import { NLLB_BUNDLE, nllbFileUrl, type NllbPinnedFile } from "../lib/nllb/bundles";
import { SPEED_CONFIG } from "../lib/speed-config";

/** The cache the verified files live in. The transformers.js pipeline cache,
 * shared on purpose: identical URL keys, so pipeline-era downloads of the
 * same pinned revision are reused after hash verification. */
const FILE_CACHE = "transformers-cache";

type OrtTensor = { data: unknown; dims: number[]; dispose?: () => void };
type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
  inputNames: string[];
  outputNames: string[];
  release: () => Promise<void>;
};
type OrtModule = {
  Tensor: new (type: string, data: unknown, dims: number[]) => OrtTensor;
  InferenceSession: {
    create: (buffer: ArrayBuffer | Uint8Array, options?: Record<string, unknown>) => Promise<OrtSession>;
  };
};

type ProgressFn = (data: { status: string; file?: string; loaded?: number; total?: number }) => void;

/** What the tokenizer returns for one sentence, structurally. */
type TokenizedInputs = {
  input_ids: { data: ArrayLike<number | bigint> };
  attention_mask: { data: ArrayLike<number | bigint> };
};

/** The library's NllbTokenizer, narrowed to the surface this engine uses. */
type TokenizerLike = {
  _build_translation_inputs(
    raw_inputs: string | string[],
    tokenizer_options: Record<string, unknown>,
    generate_kwargs: Record<string, unknown>,
  ): TokenizedInputs;
  decode(ids: number[], options?: { skip_special_tokens?: boolean }): string;
  encode(text: string, options?: { add_special_tokens?: boolean }): number[];
};

function ort(): OrtModule {
  const mod = ortModule as unknown as OrtModule;
  if (!mod?.InferenceSession) throw new Error("ONNX runtime unavailable in worker");
  return mod;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch one pinned file. Serves from the app's own cache when the bytes are
 * already there and still hash-verify; otherwise downloads with progress,
 * verifies and caches. Verification happens on EVERY read, cached or not:
 * the transformers-cache also holds entries written by the pipeline engine,
 * which were never hash-checked when they were stored.
 */
async function fetchVerifiedFile(file: NllbPinnedFile, onProgress: ProgressFn): Promise<ArrayBuffer> {
  const url = nllbFileUrl(file.name);
  const cache = await caches.open(FILE_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if (bytes.byteLength === file.bytes && (await sha256Hex(bytes)) === file.sha256) {
      onProgress({ status: "done", file: file.name, loaded: file.bytes, total: file.bytes });
      return bytes;
    }
    // Wrong bytes for this pin: stale or corrupt. Drop it and fetch again.
    await cache.delete(url);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${file.name}`);
  // The pinned byte size is the progress total (L-9): the wire
  // content-length can be a compressed size while the reader yields
  // decompressed bytes, which would make loaded outrun total.
  const total = file.bytes;

  if (!response.body) {
    const bytes = await response.arrayBuffer();
    return await verifyAndCache(bytes);
  }

  // Stream every chunk directly into its final place in one pre-allocated
  // buffer. Collecting chunks and assembling them afterwards would hold two
  // full copies of a 475 MB file at once — the exact memory peak this
  // engine exists to avoid. The pinned size (or the server's content-length,
  // same thing here) sizes the destination up front; a stream that
  // over-delivers grows the buffer, and any size mismatch is rejected by
  // the verification below.
  const reader = response.body.getReader();
  const expected = total > 0 ? total : file.bytes;
  let all = new Uint8Array(expected);
  let loaded = 0;
  onProgress({ status: "initiate", file: file.name });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength > 0) {
      if (loaded + value.byteLength > all.length) {
        const grown = new Uint8Array(Math.max(all.length * 2, loaded + value.byteLength));
        grown.set(all.subarray(0, loaded), 0);
        all = grown;
      }
      all.set(value, loaded);
      loaded += value.byteLength;
    }
    onProgress({
      status: "progress",
      file: file.name,
      loaded,
      total: total || file.bytes,
    });
  }
  return await verifyAndCache(all.buffer);

  async function verifyAndCache(bytes: ArrayBuffer): Promise<ArrayBuffer> {
    if (bytes.byteLength !== file.bytes) {
      throw new Error(`Size mismatch for ${file.name}: got ${bytes.byteLength}, pinned ${file.bytes}`);
    }
    const hex = await sha256Hex(bytes);
    if (hex !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}`);
    }
    try {
      await cache.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
    } catch {
      // Cache storage may be unavailable (private mode). The bytes are still
      // verified and usable for this session.
    }
    onProgress({ status: "done", file: file.name, loaded: file.bytes, total: file.bytes });
    return bytes;
  }
}

type LoadedInternals = {
  enc: OrtSession;
  dec: OrtSession;
  tokenizer: TokenizerLike;
  decoderStartId: number;
  eosId: number;
  /** Zero-length past tensors for the first decoder call, one per session
   * input, built once and reused (the library builds these per call; the
   * values are all empty, so reuse is exact). */
  emptyPast: Record<string, OrtTensor>;
  /** true when the decoder session takes the use_cache_branch bool input. */
  hasCacheBranch: boolean;
};

export class NllbLeanEngine {
  private loaded: LoadedInternals | null = null;
  loadedBundle: { totalBytes: number; files: NllbPinnedFile[] } | null = null;

  get isLoaded(): boolean {
    return this.loaded !== null;
  }

  async dispose(): Promise<void> {
    const l = this.loaded;
    this.loaded = null;
    this.loadedBundle = null;
    if (!l) return;
    for (const s of [l.enc, l.dec]) {
      try {
        await s.release();
      } catch {
        // Best effort.
      }
    }
  }

  /**
   * Load the bundle. `sessionOptions` carries the memory-trimming options
   * and the graph optimization level from the init message.
   */
  async load(
    onProgress: ProgressFn,
    sessionOptions: Record<string, unknown>,
  ): Promise<void> {
    if (this.loaded) await this.dispose();
    this.loadedBundle = { totalBytes: NLLB_BUNDLE.totalBytes, files: [...NLLB_BUNDLE.files] };

    // Announce every file up front, with its size. The worker's stage logic
    // treats "all announced files done" as the end of the downloading phase;
    // without this, a file whose turn has not come yet is simply absent from
    // the map, and the "reading into memory" stage would post while bytes are
    // still moving (found by the P12 browser timeline). The sizes make the
    // aggregate total known from the first byte, so a small file finishing
    // early can't make the overall fraction read 1 before the big files have
    // even started.
    for (const file of NLLB_BUNDLE.files) {
      onProgress({ status: "initiate", file: file.name, total: file.bytes });
    }

    const byName = new Map<string, ArrayBuffer>();
    for (const file of NLLB_BUNDLE.files) {
      if (file.name.endsWith(".onnx")) continue; // loaded below, one at a time
      byName.set(file.name, await fetchVerifiedFile(file, onProgress));
    }

    // The tokenizer: the library's own class on the verified bytes. The JSON
    // texts are parsed and the buffers dropped before any session exists.
    const tokenizerJSON = JSON.parse(new TextDecoder().decode(byName.get("tokenizer.json")!));
    const tokenizerConfig = JSON.parse(new TextDecoder().decode(byName.get("tokenizer_config.json")!));
    const genConfig = JSON.parse(new TextDecoder().decode(byName.get("generation_config.json")!));
    const config = JSON.parse(new TextDecoder().decode(byName.get("config.json")!));
    byName.clear();

    const tokenizer = new NllbTokenizer(tokenizerJSON, tokenizerConfig) as unknown as TokenizerLike;
    const decoderStartId = genConfig.decoder_start_token_id ?? 2;
    const eosId = genConfig.eos_token_id ?? 2;

    // Session options: WebAssembly only, plus the caller's memory trims.
    const options: Record<string, unknown> = {
      ...sessionOptions,
      executionProviders: ["wasm"],
    };

    // The decoder session is created FIRST, then the encoder — the opposite
    // of the inference order, deliberately. The decoder's creation is the
    // single biggest memory event of the whole load (its q8 weights plus the
    // optimizer's materialized copies plus a transient workspace, measured
    // ~2.3 GB alone in the reference harness), so it must happen while
    // nothing else is resident. Creating the encoder first would hold the
    // encoder session on top of that peak. Both sessions are of course
    // resident together afterwards — inference needs both.
    //
    // createSessionFromFile is deliberately a separate function: its buffer
    // parameter and local references die when it returns, so the downloaded
    // bytes are collectable the moment the session exists — never two file
    // buffers alive at once.
    let enc: OrtSession;
    const dec = await createSessionFromFile("onnx/decoder_model_merged_quantized.onnx", options, onProgress);
    try {
      enc = await createSessionFromFile("onnx/encoder_model_quantized.onnx", options, onProgress);
    } catch (err) {
      try {
        await dec.release();
      } catch {
        // Best effort.
      }
      throw err;
    }

    // Zero-length past tensors for the first decoder call, exactly the shapes
    // the library's addPastKeyValues builds: [batch, heads, 0, head_dim].
    const encHeads = config.encoder_attention_heads ?? 16;
    const decHeads = config.decoder_attention_heads ?? 16;
    const encDim = Math.ceil((config.d_model ?? 1024) / encHeads);
    const decDim = Math.ceil((config.d_model ?? 1024) / decHeads);
    const decLayers = Math.floor((dec.outputNames.length - 1) / 4);
    const o = ort();
    const emptyPast: Record<string, OrtTensor> = {};
    for (let i = 0; i < decLayers; i++) {
      emptyPast[`past_key_values.${i}.encoder.key`] = new o.Tensor("float32", new Float32Array(0), [1, encHeads, 0, encDim]);
      emptyPast[`past_key_values.${i}.encoder.value`] = new o.Tensor("float32", new Float32Array(0), [1, encHeads, 0, encDim]);
      emptyPast[`past_key_values.${i}.decoder.key`] = new o.Tensor("float32", new Float32Array(0), [1, decHeads, 0, decDim]);
      emptyPast[`past_key_values.${i}.decoder.value`] = new o.Tensor("float32", new Float32Array(0), [1, decHeads, 0, decDim]);
    }

    this.loaded = {
      enc,
      dec,
      tokenizer,
      decoderStartId,
      eosId,
      emptyPast,
      hasCacheBranch: dec.inputNames.includes("use_cache_branch"),
    };
  }

  /**
   * Translate one sentence. `shouldStop` is polled between decode steps so
   * the queue can cancel generation mid sentence.
   */
  async translate(
    text: string,
    srcLang: string,
    tgtLang: string,
    shouldStop: () => boolean,
    maxNewTokens?: number,
  ): Promise<string> {
    const l = this.loaded;
    if (!l) throw new Error("NLLB lean engine not loaded");
    const o = ort();

    // Tokenization through the library's own translation-inputs path: the
    // post-processor's language token is set to the source language, the
    // sequence becomes [src_lang, ...body, </s>], and the target language is
    // returned as the forced first token of the generation.
    const generateKwargs: Record<string, unknown> = { src_lang: srcLang, tgt_lang: tgtLang };
    const inputs = l.tokenizer._build_translation_inputs(
      text,
      { padding: true, truncation: true },
      generateKwargs,
    );
    const inputIds = Array.from(inputs.input_ids.data).map(Number);
    const attn = Array.from(inputs.attention_mask.data).map(Number);
    const forcedBosId = Number(generateKwargs.forced_bos_token_id);

    const inputIdsT = new o.Tensor("int64", BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]);
    const attnT = new o.Tensor("int64", BigInt64Array.from(attn.map(BigInt)), [1, attn.length]);

    const encOut = await l.enc.run({ input_ids: inputIdsT, attention_mask: attnT });
    const encHidden = encOut.last_hidden_state ?? encOut[l.enc.outputNames[0]!];

    // The same token budget the pipeline engines use: about 1.6 times the
    // source tokens plus 8, capped. The source token count excludes special
    // tokens, matching the pipeline's estimate.
    const budget =
      maxNewTokens ??
      (() => {
        const { factor, plus, cap, charsPerToken } = SPEED_CONFIG.decoding;
        let tokens: number;
        try {
          tokens = l.tokenizer.encode(text, { add_special_tokens: false }).length;
        } catch {
          tokens = Math.ceil(text.length / charsPerToken);
        }
        return Math.min(cap, Math.max(12, Math.round(factor * tokens + plus)));
      })();

    const outputIds: number[] = [l.decoderStartId];
    let decoderInput = new o.Tensor("int64", BigInt64Array.from([BigInt(l.decoderStartId)]), [1, 1]);
    // The encoder's past key/values never change across steps; the first
    // decoder call's present values are captured and reused for every later
    // call (the library's optimum cache-reuse trick).
    let encoderPast: Record<string, OrtTensor> | null = null;
    let decoderPast: Record<string, OrtTensor> | null = null;

    // Deterministic per-step cleanup: every run-owned tensor that is no
    // longer needed is disposed the moment it dies, instead of waiting for
    // the garbage collector. A twelve-layer 1024-dim decoder produces about
    // 0.2 MB × tokens of present tensors per step; on a long generation
    // that garbage reaches hundreds of megabytes, and relying on lazy
    // collection is exactly what pushed the pipeline's peak so high.
    const disposeAll = (tensors: Iterable<OrtTensor>) => {
      for (const t of tensors) {
        try {
          t.dispose?.();
        } catch {
          // Best effort: garbage collection is the fallback.
        }
      }
    };

    try {
      for (let step = 0; step < budget; step++) {
        if (shouldStop()) break;
        const feeds: Record<string, unknown> = {
          input_ids: decoderInput,
          encoder_hidden_states: encHidden,
          encoder_attention_mask: attnT,
        };
        if (l.hasCacheBranch) {
          feeds.use_cache_branch = new o.Tensor("bool", [step > 0], [1]);
        }
        if (step === 0) {
          Object.assign(feeds, l.emptyPast);
        } else {
          for (const name of Object.keys(encoderPast!)) feeds[name] = encoderPast![name]!;
          for (const name of Object.keys(decoderPast!)) feeds[name] = decoderPast![name]!;
        }

        const decOut = await l.dec.run(feeds);

        // Greedy: argmax over the last position's logits, first index wins on
        // ties (the library's max() behaves the same way).
        const logits = decOut.logits!;
        const seqLen = logits.dims[1]!;
        const vocabSize = logits.dims[2]!;
        const data = logits.data as Float32Array;
        const offset = (seqLen - 1) * vocabSize;
        let nextId: number;
        if (step === 0) {
          // The library's ForcedBOSTokenLogitsProcessor at sequence length 1:
          // every logit is masked except the target language token.
          nextId = forcedBosId;
        } else {
          let maxVal = -Infinity;
          nextId = 0;
          for (let v = 0; v < vocabSize; v++) {
            const val = data[offset + v]!;
            if (val > maxVal) {
              maxVal = val;
              nextId = v;
            }
          }
        }
        logits.dispose?.();

        // Capture the encoder-side present values once; thread the
        // decoder-side values from this call into the next.
        if (encoderPast === null) {
          encoderPast = {};
          decoderPast = {};
          for (const name of l.dec.outputNames) {
            if (!name.startsWith("present.")) continue;
            const pastName = name.replace("present.", "past_key_values.");
            if (pastName.includes(".encoder.")) encoderPast[pastName] = decOut[name]!;
            else decoderPast[pastName] = decOut[name]!;
          }
        } else {
          // The previous step's decoder past tensors have now been consumed
          // as this run's inputs, and this run's fresh encoder-side present
          // values are byte-identical to the ones captured at step 0 (the
          // optimum reuse). Both are dead: dispose, never accumulate.
          disposeAll(Object.values(decoderPast!));
          const fresh: Record<string, OrtTensor> = {};
          for (const name of l.dec.outputNames) {
            if (!name.startsWith("present.")) continue;
            if (name.includes(".encoder.")) {
              decOut[name]!.dispose?.();
              continue;
            }
            fresh[name.replace("present.", "past_key_values.")] = decOut[name]!;
          }
          decoderPast = fresh;
        }

        outputIds.push(nextId);
        if (nextId === l.eosId) break;
        decoderInput = new o.Tensor("int64", BigInt64Array.from([BigInt(nextId)]), [1, 1]);
      }
    } finally {
      // The sentence is done: the encoder's output and the surviving past
      // tensors belong to this call and die here, not at the collector's
      // leisure.
      encHidden.dispose?.();
      if (encoderPast) disposeAll(Object.values(encoderPast));
      if (decoderPast) disposeAll(Object.values(decoderPast));
    }

    return l.tokenizer.decode(outputIds, { skip_special_tokens: true });
  }
}

/** Create one session from one pinned file. The downloaded buffer is local
 * to this function: by the time it returns, no JavaScript reference to the
 * bytes survives, so the buffer is collectable immediately. */
async function createSessionFromFile(
  name: string,
  options: Record<string, unknown>,
  onProgress: ProgressFn,
): Promise<OrtSession> {
  const file = NLLB_BUNDLE.files.find((f) => f.name === name);
  if (!file) throw new Error(`Unknown bundle file ${name}`);
  const bytes = await fetchVerifiedFile(file, onProgress);
  const o = ort();
  const session = await o.InferenceSession.create(bytes, options);
  // `bytes` dies here: the runtime has copied what it needs into its own heap.
  return session;
}

/**
 * The IndicTrans2 engine for the translation worker.
 *
 * Everything about this engine stays on this origin's terms:
 *  - The model files load straight from the Hugging Face Hub at an exact
 *    commit hash, and every file is verified against a SHA-256 checksum
 *    BEFORE the bytes are used or cached.
 *  - Once verified, files live in the browser's Cache API under the app's
 *    own cache name, so later visits work offline like the other engines.
 *  - The tokenizers are the fast BPE tokenizer.json files from the bundle,
 *    built directly through transformers.js's PreTrainedTokenizer - no
 *    SentencePiece wasm, no third party requests beyond the pinned files.
 *
 * Inference follows the documented protocol of the bundle: encoder session,
 * then a greedy decode loop over decoder_model (first step) and
 * decoder_with_past_model (later steps, with the KV cache), argmax until
 * EOS. Text goes through the IndicProcessor port (normalization,
 * transliteration into the Devanagari-unified space, language tags) before
 * the model and back out of it afterwards.
 */

import { PreTrainedTokenizer } from "@huggingface/transformers";
// The ONNX runtime is imported directly so its session API is available to
// this engine. The worker build script resolves this import to exactly one
// runtime build: ort.wasm.min.mjs in the default worker (11.1 MB wasm) or
// ort.webgpu.min.mjs in the WebGPU worker (21.6 MB jsep wasm). The
// transformers library resolves its own 'onnxruntime-web' import to the same
// build, so both share one runtime instance and one wasmPaths configuration.
import * as ortModule from "onnxruntime-web";
import {
  INDICTRANS2_BUNDLES,
  bundleFileUrl,
  type IndicTrans2BundleKey,
  type PinnedFile,
} from "../lib/indictrans2/bundles";
import { IndicProcessor } from "../lib/indictrans2/processor";

/** The cache the verified files live in. Separate from transformers-cache
 * so it is never confused with the pipeline engines' files. */
const FILE_CACHE = "pt-indictrans2";

// The ORT module transformers.js carries. In the default worker this is the
// small wasm build; in the WebGPU worker it is the jsep build.
type OrtTensor = { data: unknown; dims: number[] };
type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
  inputNames: string[];
  outputNames: string[];
  release: () => Promise<void>;
};
type OrtModule = {
  Tensor: new (type: string, data: unknown, dims: number[]) => OrtTensor;
  InferenceSession: {
    create: (
      buffer: ArrayBuffer | Uint8Array,
      options?: Record<string, unknown>,
    ) => Promise<OrtSession>;
  };
};

/** Structural type for the callable tokenizer instances. */
type TokenizerLike = {
  (text: string, options?: { add_special_tokens?: boolean }): Promise<{
    input_ids: { data: ArrayLike<number | bigint> };
    attention_mask: { data: ArrayLike<number | bigint> };
  }>;
  decode(ids: number[], options?: { skip_special_tokens?: boolean }): string;
};

function ort(): OrtModule {
  const mod = ortModule as unknown as OrtModule;
  if (!mod?.InferenceSession) throw new Error("ONNX runtime unavailable in worker");
  return mod;
}

// --- Verified fetching -------------------------------------------------------------

type ProgressFn = (data: { status: string; file?: string; loaded?: number; total?: number }) => void;

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fetch one pinned file. Serves from the app's own cache when already
 * verified; otherwise downloads with progress, verifies the SHA-256 and only
 * then caches and returns the bytes. A checksum mismatch is an error that
 * must never be swallowed: the bytes are not the model we benchmarked.
 */
async function fetchVerifiedFile(
  bundle: IndicTrans2BundleKey,
  file: PinnedFile,
  onProgress: ProgressFn,
): Promise<ArrayBuffer> {
  const url = bundleFileUrl(bundle, file.name);
  const cache = await caches.open(FILE_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    // Both checks, not just the size (L-4): a same-size corrupt entry must
    // never be used. The bytes are already read, so hashing them is free.
    if (bytes.byteLength === file.bytes && (await sha256Hex(bytes)) === file.sha256) {
      onProgress({ status: "done", file: file.name, loaded: file.bytes, total: file.bytes });
      return bytes;
    }
    // Wrong size or wrong hash for this pin: the cache entry is stale or
    // corrupt. Drop it and fetch fresh, verified bytes.
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

  // Stream to memory with progress, then hash the whole buffer.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress({ status: "initiate", file: file.name });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress({
      status: "progress",
      file: file.name,
      loaded,
      total: total || file.bytes,
    });
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
      throw new Error(
        `Size mismatch for ${file.name}: got ${bytes.byteLength}, pinned ${file.bytes}`,
      );
    }
    const hex = await sha256Hex(bytes);
    if (hex !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}`);
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

async function removeBundleFromCache(bundle: IndicTrans2BundleKey): Promise<void> {
  try {
    const cache = await caches.open(FILE_CACHE);
    for (const file of INDICTRANS2_BUNDLES[bundle].files) {
      await cache.delete(bundleFileUrl(bundle, file.name));
    }
  } catch {
    // Best effort.
  }
}

// --- The engine -------------------------------------------------------------------

export type LoadedBundle = {
  key: IndicTrans2BundleKey;
  totalBytes: number;
  files: PinnedFile[];
};

type LoadedInternals = {
  enc: OrtSession;
  dec: OrtSession;
  decPast: OrtSession;
  numLayers: number;
  srcTok: TokenizerLike;
  tgtTok: TokenizerLike;
  meta: { src_dict_size: number; tgt_dict_size: number; unk_id: number };
  decoderStartId: number;
  eosId: number;
};

export class IndicTrans2Engine {
  private loaded: LoadedInternals | null = null;
  loadedBundle: LoadedBundle | null = null;
  private processor = new IndicProcessor();

  get isLoaded(): boolean {
    return this.loaded !== null;
  }

  async dispose(): Promise<void> {
    const l = this.loaded;
    this.loaded = null;
    this.loadedBundle = null;
    if (!l) return;
    for (const s of [l.enc, l.dec, l.decPast]) {
      try {
        await s.release();
      } catch {
        // Best effort.
      }
    }
  }

  /**
   * Load a bundle. `device` selects the execution provider; on WebGPU
   * failure the caller disposes and retries with "wasm" (the verified files
   * come back from the cache, so no second download).
   */
  async load(
    bundleKey: IndicTrans2BundleKey,
    device: "wasm" | "webgpu",
    onProgress: ProgressFn,
    sessionOptions: Record<string, unknown>,
  ): Promise<void> {
    if (this.loaded) await this.dispose();
    const bundle = INDICTRANS2_BUNDLES[bundleKey];
    this.loadedBundle = { key: bundleKey, totalBytes: bundle.totalBytes, files: bundle.files };

    // Announce every file up front with its size: the aggregate total is the
    // whole bundle from the first byte, so a small file finishing early can't
    // make the overall fraction read 1, and the map always names every file
    // that is still coming (the stage logic waits for all of them).
    for (const file of bundle.files) {
      onProgress({ status: "initiate", file: file.name, total: file.bytes });
    }

    const byName = new Map<string, ArrayBuffer>();
    for (const file of bundle.files) {
      const bytes = await fetchVerifiedFile(bundleKey, file, onProgress);
      byName.set(file.name, bytes);
    }

    const meta = JSON.parse(new TextDecoder().decode(byName.get("tokenizer_meta.json")!));
    const gen = JSON.parse(new TextDecoder().decode(byName.get("generation_config.json")!));
    const srcTokJSON = JSON.parse(new TextDecoder().decode(byName.get("tokenizer_src.json")!));
    const tgtTokJSON = JSON.parse(new TextDecoder().decode(byName.get("tokenizer_tgt.json")!));
    const srcTok = new PreTrainedTokenizer(srcTokJSON, {
      tokenizer_class: "PreTrainedTokenizerFast",
    }) as unknown as TokenizerLike;
    const tgtTok = new PreTrainedTokenizer(tgtTokJSON, {
      tokenizer_class: "PreTrainedTokenizerFast",
    }) as unknown as TokenizerLike;

    // External data: both sidecars, under both path spellings, available to
    // every session (each graph references only its own).
    const externalData: Array<{ path: string; data: Uint8Array }> = [];
    for (const name of ["encoder_model.onnx.data", "decoder_shared.onnx.data"]) {
      const bytes = byName.get(name);
      if (bytes) {
        const u8 = new Uint8Array(bytes);
        externalData.push({ path: name, data: u8 });
        externalData.push({ path: `./${name}`, data: u8 });
      }
    }

    const o = ort();
    const options: Record<string, unknown> = {
      ...sessionOptions,
      executionProviders: [device === "webgpu" ? "webgpu" : "wasm"],
      externalData,
    };
    const enc = await o.InferenceSession.create(byName.get("encoder_model.onnx")!, options);
    const dec = await o.InferenceSession.create(byName.get("decoder_model.onnx")!, options);
    const decPast = await o.InferenceSession.create(
      byName.get("decoder_with_past_model.onnx")!,
      options,
    );

    this.loaded = {
      enc,
      dec,
      decPast,
      numLayers: (dec.outputNames.length - 1) / 4,
      srcTok,
      tgtTok,
      meta,
      decoderStartId: gen.decoder_start_token_id ?? 2,
      eosId: gen.eos_token_id ?? 2,
    };
  }

  /** Remove the cached files of a bundle (Settings: remove downloaded model). */
  static async clearCachedBundle(bundleKey: IndicTrans2BundleKey): Promise<void> {
    await removeBundleFromCache(bundleKey);
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
  ): Promise<string> {
    const l = this.loaded;
    if (!l) throw new Error("IndicTrans2 engine not loaded");
    const o = ort();

    const { text: prefixed, placeholders } = this.processor.preprocess(text, srcLang, tgtLang);
    // The preprocessor emits "{src} {tgt} {body}". Tokenize the tags and the
    // body separately: transformers.js's added-token splitting would
    // otherwise eat the leading space of the body (metaspace prefix).
    const space1 = prefixed.indexOf(" ");
    const space2 = prefixed.indexOf(" ", space1 + 1);
    const tagSrc = prefixed.slice(0, space1);
    const tagTgt = prefixed.slice(space1 + 1, space2);
    const body = prefixed.slice(space2 + 1);

    const srcTagIds = Array.from(
      (await l.srcTok(tagSrc, { add_special_tokens: false })).input_ids.data,
    ).map(Number);
    const tgtTagIds = Array.from(
      (await l.srcTok(tagTgt, { add_special_tokens: false })).input_ids.data,
    ).map(Number);
    const bodyRes = await l.srcTok(body.startsWith(" ") ? body : " " + body);
    const bodyIds = Array.from(bodyRes.input_ids.data).map(Number);
    const bodyMask = Array.from(bodyRes.attention_mask.data).map(Number);

    const inputIds = [
      srcTagIds[0] ?? l.meta.unk_id,
      tgtTagIds[0] ?? l.meta.unk_id,
      ...bodyIds,
    ].map((id) => (id < l.meta.src_dict_size ? id : l.meta.unk_id));
    const attn = [1, 1, ...bodyMask];

    const inputIdsT = new o.Tensor(
      "int64",
      BigInt64Array.from(inputIds.map(BigInt)),
      [1, inputIds.length],
    );
    const attnT = new o.Tensor(
      "int64",
      BigInt64Array.from(attn.map(BigInt)),
      [1, attn.length],
    );

    const encOut = await l.enc.run({ input_ids: inputIdsT, attention_mask: attnT });
    const encHidden = encOut.last_hidden_state ?? encOut[l.enc.outputNames[0]!];

    // Token budget: about 1.6x the source tokens plus 8, capped.
    const maxNewTokens = Math.min(256, Math.max(12, Math.round(1.6 * inputIds.length + 8)));

    const outputIds: number[] = [l.decoderStartId];
    let decoderInput = new o.Tensor(
      "int64",
      BigInt64Array.from([BigInt(l.decoderStartId)]),
      [1, 1],
    );
    let past: Record<string, OrtTensor> | null = null;

    for (let step = 0; step < maxNewTokens; step++) {
      if (shouldStop()) break;
      let feeds: Record<string, unknown>;
      if (step === 0) {
        feeds = {
          input_ids: decoderInput,
          encoder_hidden_states: encHidden,
          encoder_attention_mask: attnT,
        };
      } else {
        feeds = { input_ids: decoderInput, encoder_attention_mask: attnT };
        for (let i = 0; i < l.numLayers; i++) {
          feeds[`past_key_values.${i}.decoder.key`] = past![`present.${i}.decoder.key`];
          feeds[`past_key_values.${i}.decoder.value`] = past![`present.${i}.decoder.value`];
          feeds[`past_key_values.${i}.encoder.key`] = past![`present.${i}.encoder.key`];
          feeds[`past_key_values.${i}.encoder.value`] = past![`present.${i}.encoder.value`];
        }
      }
      const decOut = (await (step === 0 ? l.dec : l.decPast).run(feeds)) as Record<string, OrtTensor>;
      past = decOut;
      const logits = decOut.logits!;
      const seqLen = logits.dims[1]!;
      const vocabSize = logits.dims[2]!;
      const data = logits.data as Float32Array;
      const offset = (seqLen - 1) * vocabSize;
      let maxVal = -Infinity;
      let nextId = 0;
      for (let v = 0; v < vocabSize; v++) {
        const val = data[offset + v]!;
        if (val > maxVal) {
          maxVal = val;
          nextId = v;
        }
      }
      outputIds.push(nextId);
      if (nextId === l.eosId) break;
      decoderInput = new o.Tensor(
        "int64",
        BigInt64Array.from([BigInt(nextId)]),
        [1, 1],
      );
    }

    const safeIds = outputIds.map((id) => (id < l.meta.tgt_dict_size ? id : l.meta.unk_id));
    const raw = l.tgtTok.decode(safeIds, { skip_special_tokens: true });
    return this.processor.postprocess(raw, tgtLang, placeholders);
  }
}

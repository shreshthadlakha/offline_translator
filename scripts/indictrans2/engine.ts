/**
 * Node engine for the IndicTrans2 int8 ONNX bundles (p5a proof).
 * Mirrors the app worker's future path: preprocess (IndicProcessor port),
 * tokenize with the fast BPE tokenizer.json files through transformers.js,
 * greedy decode with the KV cache across decoder_model + decoder_with_past,
 * postprocess.
 *
 * One direction per process: `bun run engine.ts <en-indic|indic-en>` prints a
 * sample translation for smoke testing. The benchmark driver calls the class.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { AutoTokenizer, env } from "@huggingface/transformers";
import { IndicProcessor } from "./processor";

const CACHE = path.join(import.meta.dir, "cache");

// In Node, allow reading the tokenizer files from local directories we
// prepare below (tokenizer.json + tokenizer_config.json naming).
env.allowLocalModels = true;

export type BundleKey = "en-indic" | "indic-en";

function prepareTokenizerDir(bundleDir: string, which: "src" | "tgt"): string {
  const dir = path.join(bundleDir, `tok-${which}`);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "tokenizer.json");
  if (!existsSync(target)) {
    copyFileSync(path.join(bundleDir, `tokenizer_${which}.json`), target);
  }
  const config = path.join(dir, "tokenizer_config.json");
  if (!existsSync(config)) {
    copyFileSync(path.join(bundleDir, "tokenizer_config.json"), config);
  }
  return dir;
}

export class IndicTransOnnx {
  enc!: ort.InferenceSession;
  dec!: ort.InferenceSession;
  decPast!: ort.InferenceSession;
  numLayers = 0;
  meta!: { src_dict_size: number; tgt_dict_size: number; unk_id: number };
  decoderStartId = 2;
  eosId = 2;
  processor = new IndicProcessor();
  // deno-lint-ignore no-explicit-any
  srcTok: any;
  // deno-lint-ignore no-explicit-any
  tgtTok: any;

  async load(bundle: BundleKey): Promise<void> {
    const dir = path.join(CACHE, bundle);
    this.meta = JSON.parse(readFileSync(path.join(dir, "tokenizer_meta.json"), "utf8"));
    const gen = JSON.parse(readFileSync(path.join(dir, "generation_config.json"), "utf8"));
    this.decoderStartId = gen.decoder_start_token_id ?? 2;
    this.eosId = gen.eos_token_id ?? 2;

    const opts: ort.InferenceSession.SessionOptions = {
      graphOptimizationLevel: "all",
      executionMode: "sequential",
    };
    this.enc = await ort.InferenceSession.create(path.join(dir, "encoder_model.onnx"), opts);
    this.dec = await ort.InferenceSession.create(path.join(dir, "decoder_model.onnx"), opts);
    this.decPast = await ort.InferenceSession.create(
      path.join(dir, "decoder_with_past_model.onnx"),
      opts,
    );
    this.numLayers = (this.dec.outputNames.length - 1) / 4;

    this.srcTok = await AutoTokenizer.from_pretrained(prepareTokenizerDir(dir, "src"));
    this.tgtTok = await AutoTokenizer.from_pretrained(prepareTokenizerDir(dir, "tgt"));
  }

  private pastFeed(
    // deno-lint-ignore no-explicit-any
    outputs: Record<string, any>,
  ): Record<string, ort.Tensor> {
    const feed: Record<string, ort.Tensor> = {};
    for (let i = 0; i < this.numLayers; i++) {
      feed[`past_key_values.${i}.decoder.key`] = outputs[`present.${i}.decoder.key`];
      feed[`past_key_values.${i}.decoder.value`] = outputs[`present.${i}.decoder.value`];
      feed[`past_key_values.${i}.encoder.key`] = outputs[`present.${i}.encoder.key`];
      feed[`past_key_values.${i}.encoder.value`] = outputs[`present.${i}.encoder.value`];
    }
    return feed;
  }

  async translate(
    text: string,
    srcLang: string,
    tgtLang: string,
    maxNewTokens = 256,
  ): Promise<{ text: string; tokens: number; ms: number }> {
    const started = performance.now();
    const { text: prefixed, placeholders } = this.processor.preprocess(text, srcLang, tgtLang);
    // The first two space separated fields are the language tags; the model
    // input keeps them as dedicated tokens. Tokenize tags and body separately
    // (transformers.js added-token splitting workaround, as in the reference
    // browser implementation).
    const spaceIdx1 = prefixed.indexOf(" ");
    const spaceIdx2 = prefixed.indexOf(" ", spaceIdx1 + 1);
    const tagSrc = prefixed.slice(0, spaceIdx1);
    const tagTgt = prefixed.slice(spaceIdx1 + 1, spaceIdx2);
    const body = prefixed.slice(spaceIdx2 + 1);

    const srcTagIds = Array.from(
      (await this.srcTok(tagSrc, { add_special_tokens: false })).input_ids.data,
    ).map(Number);
    const tgtTagIds = Array.from(
      (await this.srcTok(tagTgt, { add_special_tokens: false })).input_ids.data,
    ).map(Number);
    const bodyRes = await this.srcTok(body.startsWith(" ") ? body : " " + body);
    const bodyIds = Array.from(bodyRes.input_ids.data).map(Number);
    const bodyMask = Array.from(bodyRes.attention_mask.data).map(Number);

    const inputIds = [...srcTagIds.slice(0, 1), ...tgtTagIds.slice(0, 1), ...bodyIds].map((id) =>
      id < this.meta.src_dict_size ? id : this.meta.unk_id,
    );
    const attn = [...srcTagIds.slice(0, 1).map(() => 1), ...tgtTagIds.slice(0, 1).map(() => 1), ...bodyMask];

    const inputIdsT = new ort.Tensor(
      "int64",
      BigInt64Array.from(inputIds.map(BigInt)),
      [1, inputIds.length],
    );
    const attnT = new ort.Tensor("int64", BigInt64Array.from(attn.map(BigInt)), [1, attn.length]);

    const encOut = await this.enc.run({ input_ids: inputIdsT, attention_mask: attnT });
    const encHidden = encOut.last_hidden_state;

    const outputIds: number[] = [this.decoderStartId];
    let decoderInput = new ort.Tensor(
      "int64",
      BigInt64Array.from([BigInt(this.decoderStartId)]),
      [1, 1],
    );
    // deno-lint-ignore no-explicit-any
    let past: Record<string, any> | null = null;
    let tokens = 0;

    for (let step = 0; step < maxNewTokens; step++) {
      // deno-lint-ignore no-explicit-any
      let decOut: Record<string, any>;
      if (step === 0) {
        decOut = await this.dec.run({
          input_ids: decoderInput,
          encoder_hidden_states: encHidden,
          encoder_attention_mask: attnT,
        });
      } else {
        decOut = await this.decPast.run({
          input_ids: decoderInput,
          encoder_attention_mask: attnT,
          ...this.pastFeed(past!),
        });
      }
      past = decOut;
      const logits = decOut.logits as ort.Tensor;
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
      tokens += 1;
      if (nextId === this.eosId) break;
      decoderInput = new ort.Tensor("int64", BigInt64Array.from([BigInt(nextId)]), [1, 1]);
    }

    const safeIds = outputIds.map((id) => (id < this.meta.tgt_dict_size ? id : this.meta.unk_id));
    const raw = this.tgtTok.decode(safeIds, { skip_special_tokens: true });
    const text2 = this.processor.postprocess(raw, tgtLang, placeholders);
    return { text: text2, tokens, ms: performance.now() - started };
  }
}

// Smoke test when run directly.
if (import.meta.main) {
  const bundle = (process.argv[2] ?? "en-indic") as BundleKey;
  console.log(`Loading ${bundle} ...`);
  const engine = new IndicTransOnnx();
  const t0 = performance.now();
  await engine.load(bundle);
  console.log(`loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const tests: Array<[string, string, string]> =
    bundle === "en-indic"
      ? [
          ["Who will win the election?", "eng_Latn", "hin_Deva"],
          ["I would like a cup of tea, please.", "eng_Latn", "ben_Beng"],
          ["The weather is very pleasant this evening.", "eng_Latn", "tam_Taml"],
          ["Hello, how are you today?", "eng_Latn", "urd_Arab"],
        ]
      : [
          ["चुनाव कौन जीतेगा?", "hin_Deva", "eng_Latn"],
          ["আমি দয়া করে এক কাপ চা চাই।", "ben_Beng", "eng_Latn"],
          ["இன்று மாலை வானிலை மிகவும் இதமாக இருக்கிறது.", "tam_Taml", "eng_Latn"],
          ["مجھے ایک کپ چائے چاہیے پلیز۔", "urd_Arab", "eng_Latn"],
        ];
  for (const [text, src, tgt] of tests) {
    const t1 = performance.now();
    const out = await engine.translate(text, src, tgt);
    console.log(`  [${src} -> ${tgt}] "${text}"\n    -> "${out.text}" (${out.tokens} tok, ${((performance.now() - t1) / 1000).toFixed(2)} s)`);
  }
}

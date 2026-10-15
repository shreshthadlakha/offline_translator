/**
 * Downloads the two IndicTrans2 int8 ONNX bundles pinned to exact commit
 * hashes and records a SHA-256 manifest for every file. The app (p5b) uses
 * the same pinning + checksum scheme.
 *
 * Usage: bun run download.ts
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const OUT_ROOT = path.join(import.meta.dir, "cache");

export const BUNDLES = {
  "en-indic": {
    repo: "hari31416/indictrans2-en-indic-dist-200M-ONNX-int8",
    commit: "1eaa43a3fb76f382f1b22c76e56f6ab4926ad68b",
    files: [
      "encoder_model.onnx",
      "encoder_model.onnx.data",
      "decoder_model.onnx",
      "decoder_with_past_model.onnx",
      "decoder_shared.onnx.data",
      "tokenizer_src.json",
      "tokenizer_tgt.json",
      "tokenizer_meta.json",
      "tokenizer_config.json",
      "generation_config.json",
      "config.json",
    ],
  },
  "indic-en": {
    repo: "hari31416/indictrans2-indic-en-dist-200M-ONNX-int8",
    commit: "a7ecdc0ba73148c6e1d051ca372332471d8aff4f",
    files: [
      "encoder_model.onnx",
      "encoder_model.onnx.data",
      "decoder_model.onnx",
      "decoder_with_past_model.onnx",
      "decoder_shared.onnx.data",
      "tokenizer_src.json",
      "tokenizer_tgt.json",
      "tokenizer_meta.json",
      "tokenizer_config.json",
      "generation_config.json",
      "config.json",
    ],
  },
} as const;

async function sha256(file: string): Promise<string> {
  const buf = await fs.readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

async function download(url: string, dest: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${res.status} for ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const stream = createWriteStream(dest);
  let loaded = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    stream.write(value);
    if (total > 1_000_000) {
      const pct = ((loaded / total) * 100).toFixed(1);
      process.stdout.write(`\r    ${path.basename(dest)} ${pct}% (${(loaded / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)} MB)`);
    }
  }
  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });
  if (total) process.stdout.write("\n");
  return loaded;
}

async function main() {
  const manifest: Record<string, Record<string, { bytes: number; sha256: string }>> = {};
  for (const [key, bundle] of Object.entries(BUNDLES)) {
    const dir = path.join(OUT_ROOT, key);
    await fs.mkdir(dir, { recursive: true });
    manifest[key] = {};
    console.log(`\n=== ${bundle.repo} @ ${bundle.commit.slice(0, 12)} ===`);
    for (const file of bundle.files) {
      const dest = path.join(dir, file);
      const url = `https://huggingface.co/${bundle.repo}/resolve/${bundle.commit}/${file}`;
      let bytes: number;
      try {
        const stat = await fs.stat(dest);
        bytes = stat.size;
        console.log(`  ${file}: exists (${(bytes / 1e6).toFixed(1)} MB)`);
      } catch {
        bytes = await download(url, dest);
      }
      manifest[key][file] = { bytes, sha256: await sha256(dest) };
    }
  }
  const manifestPath = path.join(OUT_ROOT, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const total = Object.values(manifest)
    .flatMap((files) => Object.values(files))
    .reduce((sum, f) => sum + f.bytes, 0);
  console.log(`\nManifest written to ${manifestPath}`);
  console.log(`Total bundle size: ${(total / 1e6).toFixed(1)} MB`);
}

await main();

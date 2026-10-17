/**
 * The pinned NLLB-200 distilled 600M bundle for the lean full-model engine.
 *
 * The same seven files the transformers.js pipeline used to download, at the
 * same pinned revision and through the same URL shape — so the lean engine
 * reuses the browser's existing "transformers-cache" entries (every byte is
 * SHA-256 verified before use, and a mismatched entry is dropped and
 * re-fetched). What changes is the loading order and the memory peak, not
 * the bytes: one file is fetched at a time, each downloaded buffer is freed
 * as soon as its session exists, and the encoder session is fully built
 * before the decoder's bytes are even requested.
 *
 * Hashes: the four ONNX/tokenizer LFS files are the repository's own sha256
 * (from the Hub tree API at the pinned revision); the four small config
 * files were hashed from the downloaded bytes at the same revision.
 */

export type NllbPinnedFile = {
  name: string;
  bytes: number;
  sha256: string;
};

export const NLLB_BUNDLE = {
  repo: "Xenova/nllb-200-distilled-600M",
  commit: "261c31d1a5732c67cdd16d80e8d6088507c7ccea",
  totalBytes: 911962632,
  files: [
    { name: "onnx/encoder_model_quantized.onnx", bytes: 419120483, sha256: "5cde664eacba07a62f198857ec6c06e09572b1ebb77c8137f1fa99ac604a3a28" },
    { name: "onnx/decoder_model_merged_quantized.onnx", bytes: 475505771, sha256: "dd66608c2a4194e78f95548fa0e64f24302303698c5b09fa8e1f9e16ec00676b" },
    { name: "tokenizer.json", bytes: 17331224, sha256: "8ac789ad7dabea44d41537822d48c516ba358374c51813e2cba78c006e150c94" },
    { name: "tokenizer_config.json", bytes: 544, sha256: "ddf411c9f790d081e72de76bb8e8b714d74e160e61bc10c9bd8f56022dcd7fd7" },
    { name: "config.json", bytes: 873, sha256: "52f035acb54ac80e5ef7fe78d6967f8ddf8e8799f078d1a92a2c8168d8ff4a20" },
    { name: "generation_config.json", bytes: 189, sha256: "1ce846259ae04c572ae1863e358534bbc376ff3d3f100b1494feda6200b51de8" },
    { name: "special_tokens_map.json", bytes: 3548, sha256: "992bd4ed610d644d6823081937bcc91bb8878dd556cea4ae5327f2480361330e" },
  ] as NllbPinnedFile[],
} as const;

/** The URL a bundle file loads from, pinned to the exact commit. The shape
 * matches the transformers.js cache key, so cache entries written by the
 * pipeline era and by this engine are interchangeable. */
export function nllbFileUrl(name: string): string {
  return `https://huggingface.co/${NLLB_BUNDLE.repo}/resolve/${NLLB_BUNDLE.commit}/${name}`;
}

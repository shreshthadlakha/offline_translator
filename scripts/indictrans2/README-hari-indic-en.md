---
license: mit
language:
  - as
  - bn
  - brx
  - doi
  - gu
  - hi
  - kn
  - ks
  - kok
  - mai
  - ml
  - mni
  - mr
  - ne
  - or
  - pa
  - sa
  - sat
  - sd
  - ta
  - te
  - ur
  - en
tags:
  - translation
  - onnx
  - indic
  - indictrans2
  - browser
  - int8
pipeline_tag: translation
library_name: onnx
base_model: ai4bharat/indictrans2-indic-en-dist-200M
---

# IndicTrans2 200M (indic→en) — ONNX bundle [INT8 (Dynamic Quantization)]

> [!TIP]
> This model is part of a suite of optimized/quantized ONNX versions of the base model.
> Other variants in this direction:
> - **FP32 (Full Precision / Base)**: [`hari31416/indictrans2-indic-en-dist-200M-ONNX`](https://huggingface.co/hari31416/indictrans2-indic-en-dist-200M-ONNX)
> - **FP16 (Half Precision)**: [`hari31416/indictrans2-indic-en-dist-200M-ONNX-fp16`](https://huggingface.co/hari31416/indictrans2-indic-en-dist-200M-ONNX-fp16)
> - **INT8 (Dynamic Quantization)**: [`hari31416/indictrans2-indic-en-dist-200M-ONNX-int8`](https://huggingface.co/hari31416/indictrans2-indic-en-dist-200M-ONNX-int8) *(Current)*
> - **Q4F16 (4-bit Block Quantization)**: [`hari31416/indictrans2-indic-en-dist-200M-ONNX-q4f16`](https://huggingface.co/hari31416/indictrans2-indic-en-dist-200M-ONNX-q4f16)

ONNX-exported and quantized version of [`ai4bharat/indictrans2-indic-en-dist-200M`](https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M)
for in-browser and local edge inference.

- **Precision**: INT8 (Dynamic Quantization)
- **Description**: Dynamic INT8 quantization of the encoder and decoder. Highly recommended for CPU environments.
- **Source Pipeline & Details**: For pipeline details, benchmarks, and usage instructions, see the [indictrans2-onnx-export GitHub repository](https://github.com/Hari31416/indictrans2-onnx-export).

Built for use with [Transformers.js](https://github.com/huggingface/transformers.js)
and [onnxruntime-web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
in the browser, with fast BPE tokenizer.json files that don't require the
SentencePiece WASM runtime.

## Performance Visualizations

These charts show overall tradeoffs, language-level parity, and category breakdown.

![Overall Tradeoffs](./overall.png)
![Language-Level Parity](./languages.png)
![Category breakdown](./categories.png)

## Performance Tradeoffs & Size Comparison

Compared against the FP32 ONNX oracle on the golden evaluation fixtures.

| Format | Model Size | Exact Match (Token) | Exact Match (Text) | SacreBLEU (Raw) | Latency (Mean) | Speedup vs. FP32 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| FP32 | 1.19 GB | 100.00% | 100.00% | 100.00 | 12.2 ms | 1.000x |
| FP16 | 627.2 MB | 99.91% | 99.91% | 99.96 | 14.3 ms | 0.849x |
| INT8 | 319.7 MB | 85.64% | 85.64% | 94.34 | 10.1 ms | 1.171x |
| Q4F16 | 358.6 MB | 73.36% | 73.36% | 88.31 | 15.8 ms | 0.742x |

## Language-Level Parity (INT8)

Exact match rates and translation quality (SacreBLEU / chrF) per language pair under this precision:

| Language Code | Total Fixtures | Token Match Rate | Text Match Rate | SacreBLEU | SacreBLEU (chrF) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **eng_Latn** | 1100 | 85.6% | 85.6% | 94.34 | 97.30 |

## Category-Level Parity (INT8)

Exact match rates and translation quality grouped by category types:

| Category | Total Fixtures | Token Match Rate | Text Match Rate | SacreBLEU | SacreBLEU (chrF) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Generic** | 286 | 84.6% | 84.6% | 93.64 | 97.02 |
| **Lexicon** | 264 | 83.7% | 83.7% | 94.00 | 96.85 |
| **Numerals** | 264 | 87.5% | 87.5% | 95.02 | 97.83 |
| **Politics** | 286 | 86.7% | 86.7% | 94.70 | 97.53 |

## Translation Mismatch Examples

Here is a sample of up to 5 translation mismatches compared to the FP32 oracle. Many mismatches represent minor synonym differences or spacing variations.

### Mismatch #1 (Category: Generic)
- **Source (asm_Beng → eng_Latn)**: `কৃত্ৰিম বুদ্ধিমত্তাই শিক্ষাৰ ক্ষেত্ৰত পৰিৱৰ্তন কঢ়িয়াই আহিছে।`
- **Expected (FP32)**: `Artificial intelligence is changing education.`
- **Actual (INT8)**: `Artificial intelligence is bringing changes in the field of education.`

### Mismatch #2 (Category: Generic)
- **Source (asm_Beng → eng_Latn)**: `ভাল বৰষুণৰ ফলত শস্যৰ উৎপাদন উন্নত হৈছে।`
- **Expected (FP32)**: `Good rainfall has improved crop yields.`
- **Actual (INT8)**: `The good rainfall has improved crop yields.`

### Mismatch #3 (Category: Lexicon)
- **Source (asm_Beng → eng_Latn)**: `এই চুক্তি এবছৰৰ বাবে বৈধ।`
- **Expected (FP32)**: `The agreement is valid for one year.`
- **Actual (INT8)**: `This agreement is valid for one year.`

### Mismatch #4 (Category: Numerals)
- **Source (asm_Beng → eng_Latn)**: `প্ৰতিদিনে যথেষ্ট পৰিমাণে পানী খোৱাটো অতি গুৰুত্বপূৰ্ণ।`
- **Expected (FP32)**: `It is important to drink plenty of water every day.`
- **Actual (INT8)**: `It is very important to drink plenty of water every day.`

### Mismatch #5 (Category: Politics)
- **Source (asm_Beng → eng_Latn)**: `তেওঁ বিশ্ববিদ্যালয়ৰ পৰা সন্মানসহ স্নাতক ডিগ্ৰী লাভ কৰিছিল।`
- **Expected (FP32)**: `He received a bachelor's degree with honors from the university.`
- **Actual (INT8)**: `He graduated with honors from the university.`


## Files

- `encoder_model.onnx` (and optional `.onnx.data` weights sidecar)
- `decoder_model.onnx` and `decoder_with_past_model.onnx` (share `decoder_shared.onnx.data` when present)
- `translate.py` — self-contained Python inference helper (see Usage below)
- Fast tokenizer config files (`tokenizer_src.json`, `tokenizer_tgt.json`, `tokenizer_meta.json`)
- Model configuration configs (`config.json`, `generation_config.json`)

## Usage Example (Python, onnxruntime)

```python
# translate.py is included in this repo alongside the ONNX bundle.
# You can also find it (and read the full source) at:
#   https://github.com/Hari31416/indictrans2-onnx-export/blob/main/src/translate.py

from translate import IndicTransONNX

# Pass a HF repo ID for automatic download, or a local bundle directory path
model = IndicTransONNX("hari31416/indictrans2-indic-en-dist-200M-ONNX-int8")
print(model.translate("चुनाव कौन जीतेगा?", src_lang="hin_Deva", tgt_lang="eng_Latn"))
```

Required packages:

```bash
pip install onnxruntime tokenizers huggingface-hub
```

## License

MIT (preserved from upstream AI4Bharat).

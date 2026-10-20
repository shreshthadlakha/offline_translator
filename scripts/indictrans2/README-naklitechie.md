---
license: mit
language:
  - en
  - hi
  - bn
  - ta
  - te
  - mr
  - gu
  - kn
  - ml
  - pa
  - or
  - ur
tags:
  - translation
  - onnx
  - quantized
  - int8
  - indic
  - indictrans2
  - research
pipeline_tag: translation
library_name: onnx
base_model: naklitechie/indictrans2-en-indic-dist-200M-ONNX
---

# IndicTrans2 200M (en→indic) — INT8 quantized ONNX bundle

> ⚠️ **Research artifact — not for production.**
> For shippable use, prefer either:
> - the fp32 ONNX sibling [`naklitechie/indictrans2-en-indic-dist-200M-ONNX`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M-ONNX) (bit-exact vs PyTorch), or
> - the original PyTorch model [`naklitechie/indictrans2-en-indic-dist-200M`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M).
>
> This int8 variant exists to document the size/quality trade-off — read
> the benchmarks below before deciding.

INT8 dynamic quantization of [`naklitechie/indictrans2-en-indic-dist-200M-ONNX`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M-ONNX)
(itself an ONNX export of [`naklitechie/indictrans2-en-indic-dist-200M`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M))
via `onnxruntime.quantization.quantize_dynamic(weight_type=QuantType.QInt8, per_channel=True)`.

## Size

| Variant | Total bundle | vs fp32 |
|---|---|---|
| [PyTorch original (`naklitechie/indictrans2-en-indic-dist-200M`)](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M) | ~750 MB (safetensors) | — |
| [fp32 ONNX (`naklitechie/indictrans2-en-indic-dist-200M-ONNX`)](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M-ONNX) | 1.3 GB | 100% |
| **int8 ONNX (this repo)** | **335 MB** | **26%** |

The encoder is 72 MB (was 282 MB), decoder 136 MB (was 532 MB),
decoder_with_past 127 MB (was 496 MB). External `.data` sidecars are
inlined — int8 weights fit comfortably in a single .onnx protobuf.

## Benchmarks vs PyTorch original

The **ground truth** for these benchmarks is the original PyTorch model at
[`naklitechie/indictrans2-en-indic-dist-200M`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M), run with
`num_beams=1, do_sample=False, max_new_tokens=128` and decoded with the same
slow tokenizer + IndicProcessor postprocess pipeline AI4Bharat ships.

```
PyTorch original  →  model.generate(num_beams=1)        →  reference output
                                                              ‖ compare
int8 ONNX bundle  →  encoder.run + decoder.run loop     →  this repo's output
```

The intermediate fp32 ONNX bundle ([`naklitechie/indictrans2-en-indic-dist-200M-ONNX`](https://huggingface.co/naklitechie/indictrans2-en-indic-dist-200M-ONNX))
is verified to be **bit-exact** to PyTorch on this fixture set (528/528, 100%
token + text match), so any divergence here comes purely from the int8 step.

**421/528 = 79.7% of fixtures produce the same tokens as PyTorch.**
The remaining 107 drift in word choice
(synonyms, dropped/added pleasantries, diacritic variants) — see the
side-by-side examples below.

### Per-language pass rate

| Language | Exact-match | Rate |
|---|---|---|
| ben_Beng | 34/48 | 71% |
| guj_Gujr | 38/48 | 79% |
| hin_Deva | 40/48 | 83% |
| kan_Knda | 35/48 | 73% |
| mal_Mlym | 37/48 | 77% |
| mar_Deva | 40/48 | 83% |
| ory_Orya | 41/48 | 85% |
| pan_Guru | 38/48 | 79% |
| tam_Taml | 37/48 | 77% |
| tel_Telu | 40/48 | 83% |
| urd_Arab | 41/48 | 85% |

### Per-category pass rate

| Category | Exact-match | Rate |
|---|---|---|
| generic | 110/132 | 83% |
| lexicon | 107/132 | 81% |
| numerals | 100/132 | 76% |
| politics | 104/132 | 79% |

### Examples — int8 matches PyTorch (native-script, post-IndicProcessor)

These are randomly sampled from the 421 passing fixtures —
one per category. Most everyday text falls into this bucket.

| Lang | Source | PyTorch original (= int8 here) |
|---|---|---|
| ben_Beng | He is a good friend of mine. | সে আমার ভালো বন্ধু। |
| kan_Knda | Voter turnout in the state elections was higher than expecte | ರಾಜ್ಯ ಚುನಾವಣೆಯಲ್ಲಿ ನಿರೀಕ್ಷೆಗಿಂತ ಹೆಚ್ಚಿನ ಮತದಾನವಾಗಿದೆ. |
| kan_Knda | The meeting is scheduled for 15 March 2025 at 3:30 PM. | ಈ ಸಭೆಯನ್ನು 2025ರ ಮಾರ್ಚ್ 15ರಂದು ಮಧ್ಯಾಹ್ನ 3:30ಕ್ಕೆ ನಿಗದಿಪಡಿಸಲಾಗಿದೆ. |
| mar_Deva | Quantum computing promises to revolutionise cryptography and | क्वांटम संगणनामुळे गुप्तलेखन आणि औषधांच्या शोधात क्रांती घडण्याचे आश्वासन मिळते. |

### Examples — int8 drifts from PyTorch

These are the kind of divergences int8 introduces. Most are perceptually
equivalent translations; a few drop a meaningful word.

| Lang | Source | PyTorch original | int8 (this repo) |
|---|---|---|---|
| guj_Gujr | Hello, how are you today? | નમસ્તે આજે તમે કેવા છો? | નમસ્તે આજે તમે કેવા છો |
| ben_Beng | I would like a cup of tea, please. | আমি দয়া করে এক কাপ চা চাই। | আমি এক কাপ চা চাই। |
| kan_Knda | I would like a cup of tea, please. | ನನಗೆ ಒಂದು ಕಪ್ ಚಹಾ ಬೇಕು. | ನನಗೆ ದಯವಿಟ್ಟು ಒಂದು ಕಪ್ ಚಹಾ ಬೇಕು. |
| pan_Guru | I would like a cup of tea, please. | ਮੈਂ ਚਾਹ ਦਾ ਕੱਪ ਚਾਹ ਚਾਹ ਚਾਹ ਚਾਹ ਚਾਹ। | ਮੈਂ ਚਾਹ ਦਾ ਕੱਪ ਚਾਹ ਚਾਹ ਚਾਹ ਚਾਹਦਾ ਹਾਂ। |
| urd_Arab | I would like a cup of tea, please. | مجھے ایک کپ چائے چاہیے پلیز۔ | مجھے براہ کرم ایک کپ چائے چاہیے۔ |
| kan_Knda | The weather is very pleasant this evening. | ಇಂದು ಸಂಜೆ ಹವಾಮಾನವು ಬಹಳ ಆಹ್ಲಾದಕರವಾಗಿರುತ್ತದೆ. | ಇಂದು ಸಂಜೆ ಹವಾಮಾನವು ತುಂಬಾ ಆಹ್ಲಾದಕರವಾಗಿರುತ್ತದೆ. |
| pan_Guru | The weather is very pleasant this evening. | ਅੱਜ ਸ਼ਾਮ ਦਾ ਮੌਸਮ ਬਹੁਤ ਸੁਹਾਵਣਾ ਹੈ। | ਅੱਜ ਸ਼ਾਮ ਨੂੰ ਮੌਸਮ ਬਹੁਤ ਸੁਹਾਵਣਾ ਹੈ। |
| ory_Orya | The weather is very pleasant this evening. | ଆଜି ସନ୍ଧ୍ଯ଼ାରେ ପାଗ ଅତ୍ଯ଼ନ୍ତ ସୁଖଦ ରହିଛି। | ଆଜି ସନ୍ଧ୍ଯ଼ାରେ ପାଗ ଅତ୍ଯ଼ନ୍ତ ମନୋରମ ରହିଛି। |

### Raw-output divergence examples (Devanagari-normalized, before IndicProcessor)

For reference — these are the raw model outputs (the model emits Devanagari
for non-Devanagari languages, then IndicProcessor.postprocess converts to
the native script).

| Lang | Source | PyTorch raw (= fp32 ONNX raw) | int8 ONNX raw |
|---|---|---|---|
| guj_Gujr | `Hello, how are you today?` | `नमस्ते आजे तमे केवा छो ?` | `नमस्ते आजे तमे केवा छो` |
| ben_Beng | `I would like a cup of tea, please.` | `आमि दय़ा करे एक काप चा चाइ ।` | `आमि एक काप चा चाइ ।` |
| kan_Knda | `I would like a cup of tea, please.` | `ननगॆ ऒंदु कप् चहा बेकु .` | `ननगॆ दयविट्टु ऒंदु कप् चहा बेकु .` |
| pan_Guru | `I would like a cup of tea, please.` | `मैं चाह दा कੱप चाह चाह चाह चाह चाह ।` | `मैं चाह दा कੱप चाह चाह चाह चाहदा हां ।` |
| urd_Arab | `I would like a cup of tea, please.` | `مجھے ایک کپ چائے چاہیے پلیز ۔` | `مجھے براہ کرم ایک کپ چائے چاہیے ۔` |
| kan_Knda | `The weather is very pleasant this evening.` | `इंदु संजॆ हवामानवु बहळ आह्लादकरवागिरुत्तदॆ .` | `इंदु संजॆ हवामानवु तुंबा आह्लादकरवागिरुत्तदॆ .` |
| pan_Guru | `The weather is very pleasant this evening.` | `अੱज स़ाम दा मौसम बहुत सुहावणा है ।` | `अੱज स़ाम नूੰ मौसम बहुत सुहावणा है ।` |
| ory_Orya | `The weather is very pleasant this evening.` | `आजि सन्ध्य़ारे पाग अत्य़न्त सुखद रहिछि ।` | `आजि सन्ध्य़ारे पाग अत्य़न्त मनोरम रहिछि ।` |
| hin_Deva | `We are going to the market tomorrow morning.` | `हम कल सुबह बाजार जा रहे हैं ।` | `हम कल सुबह बाज़ार जा रहे हैं ।` |
| mal_Mlym | `We are going to the market tomorrow morning.` | `नाळॆ राविलॆ ञङ्ङൾ माർक्कऱ्ऱिൽ पोकुन्नु .` | `नाळॆ राविलॆ ञङ्ङൾ माർक्कऱ्ऱिൽ पोकुं .` |

## When to use this

- ✅ Memory- or storage-constrained inference (mobile, edge, embedded)
- ✅ Coarse-grained translation where minor wording drift is acceptable
- ✅ Smoke-testing a UX flow before committing to fp32 download size
- ❌ Production deployments
- ❌ Research/citation contexts requiring bit-exact reproducibility
- ❌ Domain-critical text (legal, medical, technical) where a swapped synonym matters

## Usage (Python, onnxruntime)

Identical to the [fp32 repo](naklitechie/indictrans2-en-indic-dist-200M-ONNX) — just point `snapshot_download` at
this repo:

```python
from huggingface_hub import snapshot_download
snap = snapshot_download(repo_id="naklitechie/indictrans2-en-indic-dist-200M-ONNX-int8")
# … same code path as the fp32 README
```

The tokenizer files (`tokenizer_src.json`, `tokenizer_tgt.json`,
`tokenizer_meta.json`) are byte-identical to fp32. Only the three `*.onnx`
files differ.

## How this was built

```bash
python browser-prep/scripts/06_quantize.py --dtype int8
# → scratch/it2-onnx-int8/
# Validation against captured truth: see fixtures/parity_report.json
```

Quantization tooling: `onnxruntime.quantization.quantize_dynamic` with
`weight_type=QuantType.QInt8, per_channel=True`. No calibration dataset; pure
weight quantization, activations stay fp32 dynamically.

## Failed alternatives

- **fp16** via `onnxconverter_common.float16.convert_float_to_float16`: encoder
  loaded but decoders failed in onnxruntime due to dynamo-export Cast handling
  and downstream tensor-reuse patterns. Tracked for follow-up with
  `onnxruntime.transformers.optimizer` or transformers.js's `scripts/convert.py`.

## License

MIT, preserved from upstream [ai4bharat/indictrans2-en-indic-dist-200M](https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M).

## Citation

```bibtex
@article{ai4bharat-indictrans2,
  title   = {IndicTrans2: Towards High-Quality and Accessible Machine Translation Models for all 22 Scheduled Indian Languages},
  author  = {Gala, Jay and Chitale, Pranjal A. and others},
  journal = {Transactions on Machine Learning Research},
  year    = {2023}
}
```

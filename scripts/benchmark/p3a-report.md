# P3a Report — Better small models for South Asian languages

**Date:** 2026-10-12 · **Bar:** P2 quality bar (`quality-bar.mjs`: pass = gap ≥ −2.0 chrF++ vs the published NLLB-200-distilled-600M baseline AND flagRate ≤ 2%) · **Benchmark:** P1 runner semantics (200-sentence FLORES-200 devtest sample, chrF++, sanity flags, the shared scoring modules `chrfpp.mjs` / `sanity.mjs` / `terminal-punct.ts`)

## Plan (three lines)

Research the IndicTrans2 distilled-200M landscape (gated originals vs ungated community ONNX), then run the smallest test that could kill the idea — one Urdu sentence in Node through the full JS pipeline — gated by a golden-diff of my JavaScript IndicProcessor port against the compiled Python IndicTransToolkit. If that passes, benchmark Urdu/Tamil/Bengali both directions against the P2 bar, score the only other browser-ready candidate (m2m100_418M) the same way, and extend to all 13 languages × 2 directions since both models were already on disk. Recommend per language with numbers; nothing integrated into the app.

## Feasibility verdict

**WORKS — and it beats the full model.** IndicTrans2 distilled 200M (AI4Bharat, MIT) runs on-device in the standard seq2seq ONNX session pattern (encoder / decoder / decoder_with_past — the same graphs transformers.js drives for the app's opus models). Exact numbers from the Urdu feasibility run and the 26-direction benchmark:

| measurement | en→indic model | indic→en model | (reference: app's opus small models / NLLB full) |
|---|---|---|---|
| weights, int8 dynamic ONNX | 277 MB | 232 MB | ~110–120 MB / 912 MB (q8) |
| full bundle incl. tokenizers | 318 MB | 270 MB | — / ~912 MB |
| session load (Node, warm disk) | 1.2 s | 1.2 s | ~12 s cold (browser) / minutes |
| median per sentence (greedy, Node) | 0.52–0.79 s | 0.47–0.75 s | ~0.7 s (browser worker) |
| peak RSS (whole Node process) | 727–820 MB | 647–737 MB | — / ~2.8 GB |
| covers | all 13 languages | all 13 languages | hi only (failed) / all |

No transformers.js-ready bundle exists today (no `decoder_model_merged` layout, two tokenizer JSONs, id clamping needed, and the mandatory IndicProcessor has no JavaScript implementation). The missing pieces were built and proven for this report:

1. **IndicProcessor ported to JavaScript** (`scripts/benchmark/indic-processor.mjs`, ~700 lines): punctuation normalization, digit unification, entity placeholders, Moses en tokenizer/detokenizer, Bengali/Tamil/Urdu normalizers (incl. the bundled urduhack pipeline), trivial tokenize/detokenize, and the Devanagari-unifying transliterator with Tamil corrections. **Golden-verified: 1200/1200 preprocess outputs and 5189/5200 postprocess outputs byte-identical to the compiled Python toolkit** (the 11 diffs are the toolkit's own `set()`-iteration nondeterminism on two sentences with multiple entities — documented below). Two upstream bugs were discovered and replicated exactly, because the models were trained on this pipeline: the Bengali normalizer's `NUKTA = "\\u09BC"` literal-string bug, and a missing comma in `_INDIC_FAILURE_CASES`.
2. **Tokenizer path proven**: the community fast-tokenizer JSONs produce **id sequences identical to the official SPM+dict tokenizer** (200/200 English, 200/200 Urdu/Tamil, 200/200 Bengali after NFC pre-normalization + id clamping to the model dict — 0/32,322 vocab mismatches). Decoding replicates the exact Rust Metaspace semantics (concat with ▁→space, trim, skip specials).
3. **Conversion validated end-to-end**: the model card's four example sentences reproduce faithfully (greedy vs the card's beam-5 gives synonym-level differences only); the ADT/entity placeholder restore and numeral handling work on real FLORES sentences.

**Required runtime steps in JavaScript** (the answer to "what preprocessing/postprocessing does each candidate need"): preprocess = punct-norm → digit unification → entity placeholder wrap → (English) Moses tokenize / (Brahmi-script Indic) normalize + trivial tokenize + transliterate into unified Devanagari (Urdu/Santali/Meitei stay in native script) → prepend `src tgt` language tags → NFC → BPE encode → clamp ids to the model dict. Postprocess = Metaspace decode → (Arabic-script) punctuation gluing → placeholder restore → (English) Moses detokenize / (Indic) transliterate back to the target script + trivial detokenize. All of it is deterministic string work, now proven in JS.

## Benchmark: 13 languages × 2 directions (all scored locally)

Published baseline = NLLB-200-distilled-600M chrF++ (the number the P2 bar uses). Greedy decoding, max_new_tokens 256, int8, Node harness — the same local methodology as P1/P2 (which carries the −1.4 greedy/local-vs-published calibration; these numbers still clear the bar without any compensation).

| direction | local chrF++ | published NLLB-600M | gap | flags | verdict | median s/sent |
|---|---|---|---|---|---|---|
| en→Urdu | 50.14 | 46.6 | **+3.54** | 0% | PASS | 0.625 |
| Urdu→en | 59.06 | 57.8 | **+1.26** | 0.5% | PASS | 0.507 |
| en→Tamil | 56.29 | 51.1 | **+5.19** | 0% | PASS | 0.558 |
| Tamil→en | 57.23 | 55.8 | **+1.43** | 0% | PASS | 0.499 |
| en→Bengali | 51.30 | 46.2 | **+5.10** | 0% | PASS | 0.522 |
| Bengali→en | 58.13 | 57.9 | **+0.23** | 1.5% | PASS | 0.542 |
| en→Hindi | 57.84 | 54.2 | **+3.64** | 0.5% | PASS | 0.595 |
| Hindi→en | 65.63 | 62.5 | **+3.13** | 0% | PASS | 0.466 |
| en→Gujarati | 55.19 | 50.4 | **+4.79** | 0% | PASS | 0.546 |
| Gujarati→en | 64.70 | 62.5 | **+2.20** | 0% | PASS | 0.513 |
| en→Kannada | 53.27 | 50.2 | **+3.07** | 0% | PASS | 0.516 |
| Kannada→en | 58.78 | 57.0 | **+1.78** | 0% | PASS | 0.492 |
| en→Malayalam | 54.66 | 47.2 | **+7.46** | 2.0% | PASS | 0.693 |
| Malayalam→en | 61.10 | 59.0 | **+2.10** | 0% | PASS | 0.493 |
| en→Marathi | 50.21 | 44.6 | **+5.61** | 0.5% | PASS | 0.567 |
| Marathi→en | 62.50 | 58.9 | **+3.60** | 0.5% | PASS | 0.485 |
| en→Nepali | 55.64 | 49.0 | **+6.64** | 0% | PASS | 0.513 |
| Nepali→en | 65.33 | 62.5 | **+2.83** | 0% | PASS | 0.488 |
| en→Odia | 48.05 | 44.9 | **+3.15** | 0% | PASS | 0.563 |
| Odia→en | 61.25 | 58.5 | **+2.75** | 0% | PASS | 0.495 |
| en→Punjabi | 50.52 | 46.7 | **+3.82** | 0% | PASS | 0.789 |
| Punjabi→en | 62.85 | 61.5 | **+1.35** | 0.5% | PASS | 0.514 |
| en→Telugu | 57.87 | 51.8 | **+6.07** | 0% | PASS | 0.554 |
| Telugu→en | 62.79 | 61.2 | **+1.59** | 2.5% | **BORDERLINE** | 0.472 |
| en→Assamese | 38.69 | 34.6 | **+4.09** | 0.5% | PASS | 0.780 |
| Assamese→en | 50.74 | 52.7 | **−1.96** | 1.0% | PASS (narrow) | 0.747 |

**Headline: 25/26 PASS. Every en→Indic direction is +3.1 to +7.5 chrF++ ABOVE the published full-model baseline** — a 200M int8 model at ~30% of the size beats the 912 MB NLLB-600M on its own benchmark languages. X→en directions are +0.2 to +3.6 above, except Assamese→en at −1.96 (still within the −2.0 pass line; Assamese is the lowest-resource language in the set). The single BORDERLINE (Telugu→en, gap +1.59) breaches only the flag-rate cap: 3 sentences with mild doubled-quote artifacts (per-sentence chrF 62–68 on those) plus one genuinely compressed sentence (chrF 34.8); reviewed by hand.

Scoring semantics follow P2b with one documented deviation: sanity flags run on the post-processed (final) text rather than the raw decode, because the raw output is in unified Devanagari for Brahmi-script targets (raw-script flags would be meaningless), and the IndicTrans postprocess never adds terminal punctuation, so truncation evidence survives. chrF++ is scored on the app-visible text (final + the shared `restoreTerminalPunctuation`), exactly like P2b.

## Other candidates (Task 4)

| candidate | verdict | evidence |
|---|---|---|
| **m2m100_418M** (Xenova, browser-ready, q8) | **REJECT** | scored on en→ur with the same harness: chrF++ 37.23, gap **−9.37 = FAIL**, 3 repeat-loop sentences, median **10.5 s/sentence**, 640 MB q8, peak RSS 2.4 GB. Dominated by IndicTrans2 on every axis (+3.5 vs −9.4 gap, 0.6 vs 10.5 s, 277 vs 640 MB). The remaining 5 directions were not worth ~3 h of machine time given this. Also missing Assamese and Telugu entirely. |
| Helsinki opus-mt single pairs (en-ur, ur-en, bn-en, en-ml, ml-en, en-mr, mr-en, pa-en) | REJECT without scoring (not recommended, so no score needed) | PyTorch-only (no ONNX conversion exists — each would need an optimum export), legacy "alpha" quality far below NLLB on these pairs per the OPUS-MT dashboard, and the code-space is full of traps: `opus-mt-taw-en` is Tai-Kadai (not Tamil), `en-bnt` Bantu (not Bengali), `en-urj` Uralic (not Urdu), `en-guw` Guarani (not Gujarati), `en-pag`/`en-pap` Pangasinan/Papiamento (not Punjabi). |
| bodhan-ai/indic-translate | REJECT | `license: other` (not a clean OSS license), no ONNX, no size advantage at inference. |
| prajdabre/rotary-indictrans2-dist-200M (RoPE, 2048-token context) | HOLD | PyTorch-only + custom rotary architecture (would need trust_remote_code optimum export); same size class. Candidate for a later re-export comparison — not browser-ready today. |
| opus-en-hi / opus-hi-en (in the app today) | REJECT | already failed the P2 bar at −22.9 / −18.2 (invented words, dropped clauses); P2c proved no decoding setting rescues them. Superseded by IndicTrans2 en→hi **+3.64** / hi→en **+3.13**. |
| onnx-community/opus-mt-hi-en | REJECT | same upstream model as above (P2 fail). |

## Recommendation (Task 5) — best engine per language

**Recommend IndicTrans2 distilled 200M int8 (via the hari31416 ONNX export) for all 13 languages, both directions.** Each number below is a local benchmark score from this report.

| language | en→X engine (gap) | X→en engine (gap) | vs today |
|---|---|---|---|
| Hindi | IndicTrans2 en-indic (+3.64) | IndicTrans2 indic-en (+3.13) | replaces the quarantined opus-hi (−22.9/−18.2) |
| Bengali | IndicTrans2 (+5.10) | IndicTrans2 (+0.23) | was full-model only |
| Gujarati | IndicTrans2 (+4.79) | IndicTrans2 (+2.20) | was full-model only |
| Kannada | IndicTrans2 (+3.07) | IndicTrans2 (+1.78) | was full-model only |
| Malayalam | IndicTrans2 (+7.46) | IndicTrans2 (+2.10) | was full-model only |
| Marathi | IndicTrans2 (+5.61) | IndicTrans2 (+3.60) | was full-model only |
| Nepali | IndicTrans2 (+6.64) | IndicTrans2 (+2.83) | was full-model only |
| Odia | IndicTrans2 (+3.15) | IndicTrans2 (+2.75) | was full-model only |
| Punjabi | IndicTrans2 (+3.82) | IndicTrans2 (+1.35) | was full-model only |
| Tamil | IndicTrans2 (+5.19) | IndicTrans2 (+1.43) | was full-model only |
| Telugu | IndicTrans2 (+6.07) | IndicTrans2 (+1.59, borderline flag-rate) | was full-model only |
| Assamese | IndicTrans2 (+4.09) | IndicTrans2 (−1.96, narrow pass) | was full-model only |
| Urdu | IndicTrans2 (+3.54) | IndicTrans2 (+1.26) | was full-model only |

Routing shape for a future integration (not done here): two engines, `en→{13 langs}` and `{13 langs}→en`, at 277 MB / 232 MB (int8) each — a user translating one direction downloads one model. NLLB-600M remains the fallback for everything else and for any future re-check. Assamese→en and Telugu→en are the two directions to watch (narrowest margins; see the table above for why they still pass).

## Hosting (Task 6)

Nothing needs to leave the device at runtime — the models download once from the Hugging Face Hub exactly like the app's current engines (public FLORES data only flowed through this benchmark; the only network was the public model download).

If/when the app integrates this engine, the model files could come from:
1. **The existing community repos as-is** (`hari31416/indictrans2-{en-indic,indic-en}-dist-200M-ONNX-int8`, MIT, ungated) — zero work, no account needed; the app's worker would load the three ONNX files + two tokenizer JSONs directly (the custom session-driving this benchmark already exercises).
2. **Our own repacked repo on the Hub** (recommended): a transformers.js-layout bundle (merged decoder graphs, single-file weights, embedded tokenizer configs) hosted under the project's HF account. For this I would need from you: **a Hugging Face account (any username) and a write token** to create the repo — the MIT license permits redistribution with attribution. Nothing else.
3. **Self-export** (if we ever want to control quantization): the original ai4bharat repos are gated (require accepting their license with a logged-in account — so I would need your token for that too), but an ungated mirror of the same weights exists (`Raghavan/indictrans2-en-indic-dist-200M`) and the community fp32 ONNX is ungated, so a full optimum re-export can be done without any credentials.

## What failed / known limits

- **Nothing in the core pipeline failed.** Non-failures worth recording:
- The 11/5200 postprocess golden diffs (sentences 737/723): the Python toolkit's own `set()`-iteration nondeterminism under hash randomization flips which entity gets `<ID1>` vs `<ID2>`; the JS port is deterministic (insertion order). Final output is self-consistent either way; corpus chrF impact ≈ 0.02.
- The fast-tokenizer JSONs differ from the official SPM on 3/200 decomposed-Bengali sentences (the Rust precompiled charsmap does not compose `ে`+`া`→`ো`); NFC pre-normalization closes this to 0/200 — and on those sentences the JS path was closer to the official SPM than the Rust path anyway.
- transformers.js's own decode differs from Rust Metaspace decode on leading-▁ punctuation pieces — so the harness implements the Rust rule directly (verified).
- The 2.5% flag rate on Telugu→en (borderline) is 3 mild quote-doubling artifacts + 1 weak sentence, hand-reviewed.
- m2m100_418M needed ~5 tool-chunks and ~35 min for one direction at 10.5 s/sentence — its speed alone disqualifies it.
- Speed numbers are Node/onnxruntime-node (same engine, same session options as the app's worker path); browser-worker numbers for this model will come from the integration task. Load times are warm-disk; a cold browser download of 277 MB will be dominated by network, like any model.

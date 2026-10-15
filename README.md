# Private Translator

Translate between 56 languages entirely on your own device. Nothing you type and nothing translated is ever sent anywhere: the only network requests the app makes are its own files and a one-time download of the translation model, pinned to an exact revision, straight from the Hugging Face Hub. No account, no limits, no analytics, no tracking, no third-party scripts or fonts.

## Quick start

Requires Node.js 24 (Node ≥ 20.9 works for dev and build; the verification scripts import TypeScript directly and want 24).

```bash
npm ci        # installs and generates the worker, service worker and ORT runtime files
npm run dev   # http://localhost:3000
```

Everything in `public/ort/`, `public/translator.worker.js`, `public/sw.js` and the two build-id stamps is generated — by `postinstall`, `predev` and `prebuild` — never committed. A fresh checkout needs nothing else.

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run drift       # notices + quality table + revision pins must match the code
npm run build       # production build (standalone)
```

CI runs all of it on every push: `.github/workflows/ci.yml`.

## How it works

Four kinds of engines, chosen per language pair:

- **Small single-pair models** (Opus-MT conversions, ~105–155 MB): one small model per popular pair, both directions where a verified conversion exists. Loads in seconds, translates ~1 s/sentence on a laptop. Includes community conversions by `fintutto` (Greek, Hebrew, Swahili, Bulgarian to English).
- **Group models** (Opus-MT many-languages, ~119 MB): one model covers a language family with a language tag per pair (Portuguese today).
- **IndicTrans2** (distilled 200M, int8 ONNX exports by `hari31416`, ~262–309 MB per direction): the thirteen Indian languages, both directions with English, with a JavaScript port of the reference preprocessing and a custom decoding loop.
- **The full model** (NLLB-200 distilled 600M, 912 MB): covers every pair of the 56-language registry. The honest heavy path — the app asks before that download.

Every model is loaded **pinned to a fixed Hugging Face revision** (`MODEL_REVISIONS` in `src/lib/engines.ts`), so upstream repository changes can never silently change what this app downloads. A model is downloaded once, kept in the browser's cache, and the app keeps working offline afterwards. Inference runs in a web worker — WebGPU when available, WebAssembly otherwise — so typing never blocks.

## Languages and honest quality

The whole routed fleet was benchmarked against professional human translations (FLORES-200 devtest, chrF++, 200 fixed sentences per direction through the real browser worker). Verdicts below come from that measurement — **including the failures**, because hiding them would defeat the point. Full detail: `scripts/benchmark/quality-table.md` (per-direction scores, gaps, flag rates); methodology and calibration: the P1/P2 sections of `worklog.md`.

- **pass** — within 2 chrF++ points of the full model's published score on that direction (39 of 71 small-model directions, including 25 of the 26 IndicTrans2 directions)
- **borderline** — within 5 points, or passing with more flagged sentences than the bar allows (22): labelled "Fast, approximate" in the app, with a notice under the translation and a per-language "use the full model" choice
- **fail** — more than 5 points below (10): the routes the engine-alternatives research could not replace with anything better. They stay live, labelled "Fast, limited", with the same notice and choice; the worst failures (every Croatian, Serbian and Norwegian group route, English to Bulgarian and to Vietnamese and more) were removed entirely and route to the full model instead
- **full** — no small model exists; the pair routes to the full model

`small` = dedicated pair model, `group` = shared family model, `indictrans2` = the IndicTrans2 bundles.

| Afrikaans | `afr_Latn` | small (111 MB), borderline | small (111 MB), fail |
| Amharic | `amh_Ethi` | full model (912 MB) | full model (912 MB) |
| Arabic | `arb_Arab` | small (118 MB), borderline | small (118 MB), borderline |
| Assamese | `asm_Beng` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Bengali | `ben_Beng` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Bulgarian | `bul_Cyrl` | full model (912 MB) | small (149 MB), borderline |
| Catalan | `cat_Latn` | full model (912 MB) | full model (912 MB) |
| Chinese (Simplified) | `zho_Hans` | small (119 MB), borderline | small (119 MB), borderline |
| Chinese (Traditional) | `zho_Hant` | full model (912 MB) | full model (912 MB) |
| Croatian | `hrv_Latn` | full model (912 MB) | full model (912 MB) |
| Czech | `ces_Latn` | small (117 MB), pass | small (117 MB), borderline |
| Danish | `dan_Latn` | small (113 MB), pass | small (113 MB), pass |
| Dutch | `nld_Latn` | small (122 MB), pass | small (122 MB), borderline |
| Finnish | `fin_Latn` | small (119 MB), pass | small (113 MB), borderline |
| French | `fra_Latn` | small (113 MB), pass | small (113 MB), pass |
| German | `deu_Latn` | small (112 MB), pass | small (112 MB), borderline |
| Greek | `ell_Grek` | small (154 MB), borderline | full model (912 MB) |
| Gujarati | `guj_Gujr` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Hausa | `hau_Latn` | full model (912 MB) | full model (912 MB) |
| Hebrew | `heb_Hebr` | small (155 MB), pass | full model (912 MB) |
| Hindi | `hin_Deva` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Hungarian | `hun_Latn` | small (117 MB), pass | small (117 MB), borderline |
| Indonesian | `ind_Latn` | small (108 MB), borderline | small (108 MB), fail |
| Italian | `ita_Latn` | small (136 MB), pass | small (137 MB), borderline |
| Japanese | `jpn_Jpan` | full model (912 MB) | small (115 MB), fail |
| Kannada | `kan_Knda` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Korean | `kor_Hang` | full model (912 MB) | small (120 MB), fail |
| Malay | `zsm_Latn` | full model (912 MB) | full model (912 MB) |
| Malayalam | `mal_Mlym` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Marathi | `mar_Deva` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Nepali | `npi_Deva` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Norwegian Bokmål | `nob_Latn` | full model (912 MB) | full model (912 MB) |
| Odia | `ory_Orya` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Pashto | `pbt_Arab` | full model (912 MB) | full model (912 MB) |
| Persian | `pes_Arab` | full model (912 MB) | full model (912 MB) |
| Polish | `pol_Latn` | full model (912 MB) | small (118 MB), borderline |
| Portuguese | `por_Latn` | group (119 MB), borderline | group (119 MB), borderline |
| Punjabi | `pan_Guru` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Romanian | `ron_Latn` | small (113 MB), pass | full model (912 MB) |
| Russian | `rus_Cyrl` | small (118 MB), borderline | small (118 MB), fail |
| Serbian | `srp_Cyrl` | full model (912 MB) | full model (912 MB) |
| Sinhala | `sin_Sinh` | full model (912 MB) | full model (912 MB) |
| Spanish | `spa_Latn` | small (119 MB), pass | small (119 MB), borderline |
| Swahili | `swh_Latn` | small (143 MB), borderline | full model (912 MB) |
| Swedish | `swe_Latn` | small (110 MB), pass | small (110 MB), borderline |
| Tagalog | `tgl_Latn` | full model (912 MB) | full model (912 MB) |
| Tamil | `tam_Taml` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Telugu | `tel_Telu` | indictrans2 (309 MB), pass | indictrans2 (262 MB), borderline |
| Thai | `tha_Thai` | full model (912 MB) | small (117 MB), fail |
| Turkish | `tur_Latn` | full model (912 MB) | small (117 MB), fail |
| Ukrainian | `ukr_Cyrl` | small (117 MB), fail | small (117 MB), fail |
| Urdu | `urd_Arab` | indictrans2 (309 MB), pass | indictrans2 (262 MB), pass |
| Vietnamese | `vie_Latn` | full model (912 MB) | small (107 MB), fail |
| Yoruba | `yor_Latn` | full model (912 MB) | full model (912 MB) |
| Zulu | `zul_Latn` | full model (912 MB) | full model (912 MB) |

## Size

Measured from a production build, compressed, as transferred:

- **First visit: ~297 KB** (HTML + JS + CSS, 11 requests). Fonts load per script on demand (~270 KB total).
- **First translation setup:** ~5.4 MB more (the worker bundle and the self-hosted ONNX Runtime WebAssembly), plus the model itself — 105–155 MB for a small pair, 262–309 MB for IndicTrans2, 912 MB for the full model. Once, then cached.

## Privacy, verifiable

- The translation worker wraps `fetch` and reports every request it makes to the page: the built-in **"Check for yourself"** panel shows each origin, path and size, live, with typed text never included.
- The ONNX runtime files are self-hosted from `/ort/` — no CDN requests.
- All fonts are subset woff2 files served from this origin — no Google Fonts at runtime.
- No analytics, error reporting, or anything else that phones home: there is no server code at all.

## Repository layout

```
src/app/                 the one page (App Router)
src/components/          translator UI, settings, history, batch, about sections
src/hooks/               engine state, settings, history, speech
src/lib/engines.ts       the engine table + pinned model revisions (the source of truth)
src/workers/             the translation worker (bundled to public/translator.worker.js)
scripts/build-worker.mjs     generates the worker, service worker and build stamps
scripts/copy-ort.mjs         self-hosts the ONNX runtime files
scripts/generate-notices.mjs THIRD_PARTY_NOTICES.md, from the engine table
scripts/check-drift.mjs      notices + quality table + pins must match the code
scripts/release/             revision pinning + first-visit measurement
scripts/benchmark/           the quality benchmark (FLORES-200, chrF++) and its results
scripts/language-audit/      the Hub audit that verified every model and license
```

## License

MIT OR Apache-2.0, at your choice — see `LICENSE-MIT`, `LICENSE-APACHE` and `NOTICE`.

Third-party components and models, including every model's pinned revision, license and non-commercial status, are listed in `THIRD_PARTY_NOTICES.md`. Note that the full NLLB-200 model is CC BY-NC 4.0 (non-commercial); the Opus-MT models are Apache-2.0 / CC BY 4.0; IndicTrans2 is MIT (AI4Bharat), and the IndicTrans2 preprocessing is ported from MIT-licensed reference code (IndicTransToolkit, indic-nlp-library, sacremoses, urduhack) with the credits in the notices.

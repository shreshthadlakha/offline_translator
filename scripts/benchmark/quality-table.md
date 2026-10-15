# Quality table — every engine the app routes, scored against professional human translation

Generated 2026-10-15 from the P1 benchmark: 200 fixed FLORES-200 devtest sentences (seed 42, the same ids for every language and direction), chrF++ scored against the professional human references, run through the real browser worker bundle. The baseline is the full model's own published chrF++ (NLLB-200 distilled 600M, model-card metrics). Nothing typed or translated left the device.

**The bar** (`scripts/benchmark/quality-bar.mjs`, all constants adjustable): a small model **passes** a direction when its chrF++ is within 2 points of the published baseline (or higher) **and** at most 2% of sentences carry a sanity flag; within 5 points is **borderline**; more than 5 below is **fail**. A chrF-pass gap with a flag breach is borderline, not fail — the flag review showed the high-flag passes (en->ar 15.5%, en->zh 17.5%) are mostly missing final punctuation rather than broken output. Full-model rows are **baseline**: the full model is the bar, so it gets no run and no verdict.

**Calibration**: P1 measured this local harness against the published numbers on the same model: a stable -1.38 chrF++ offset (greedy q8, 200 of 1012 sentences, vs Meta's full-devtest eval). CALIBRATION_OFFSET is 0 here, so gaps are the literal published comparison — a small model exactly as good as the full model reads about -1.4 and still passes.

**How to read the speed columns**: cold load and median seconds per sentence for small models come from the real browser worker path (one fresh model download per direction, one sentence at a time — what a user actually experiences). Full-model rows have no run: this 4 GB sandbox's browser cannot load the 600M model; five directions have P1 Node-harness local numbers at the bottom.

CJK directions have naturally low chrF++ (published en->zh is 19.6): the gap vs baseline is what counts, never the absolute number.

**Verdicts across the 44 routed small-model directions: 13 pass, 18 borderline, 13 fail.** Plus 66 full-model baseline rows (one per remaining language direction).

| Language | Direction | Engine | Model | chrF++ | Baseline | Gap | Flags | Cold load | Median s/sent | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Afrikaans | afr_Latn->en | opus-af-en | 111 MB | 63.47 | 72.90 | -9.43 | 1.0% (2/200) | 13.4 s | 0.663 | **fail** |
| Afrikaans | en->afr_Latn | opus-en-af | 111 MB | 58.06 | 62.40 | -4.34 | 1.5% (3/200) | 12.6 s | 0.678 | **borderline** |
| Amharic | amh_Ethi->en | nllb-200-distilled-600M | 912 MB | 54.90 | 54.90 | — | — | — | — | **baseline** |
| Amharic | en->amh_Ethi | nllb-200-distilled-600M | 912 MB | 37.20 | 37.20 | — | — | — | — | **baseline** |
| Arabic | arb_Arab->en | opus-ar-en | 118 MB | 58.63 | 62.20 | -3.57 | 0.5% (1/200) | 12.1 s | 0.814 | **borderline** |
| Arabic | en->arb_Arab | opus-en-ar | 118 MB | 49.56 | 51.40 | -1.84 | 3.0% (6/200) | 13.1 s | 0.679 | **borderline** |
| Assamese | asm_Beng->en | nllb-200-distilled-600M | 912 MB | 52.70 | 52.70 | — | — | — | — | **baseline** |
| Assamese | en->asm_Beng | nllb-200-distilled-600M | 912 MB | 34.60 | 34.60 | — | — | — | — | **baseline** |
| Bengali | ben_Beng->en | nllb-200-distilled-600M | 912 MB | 57.90 | 57.90 | — | — | — | — | **baseline** |
| Bengali | en->ben_Beng | nllb-200-distilled-600M | 912 MB | 46.20 | 46.20 | — | — | — | — | **baseline** |
| Bulgarian | bul_Cyrl->en | opus-mul-en (group) | 118 MB | 51.57 | 63.40 | -11.83 | 1.5% (3/200) | 13.1 s | 0.857 | **fail** |
| Bulgarian | en->bul_Cyrl | nllb-200-distilled-600M | 912 MB | 60.40 | 60.40 | — | — | — | — | **baseline** |
| Catalan | cat_Latn->en | nllb-200-distilled-600M | 912 MB | 66.60 | 66.60 | — | — | — | — | **baseline** |
| Catalan | en->cat_Latn | nllb-200-distilled-600M | 912 MB | 61.20 | 61.20 | — | — | — | — | **baseline** |
| Chinese (Simplified) | zho_Hans->en | opus-zh-en | 119 MB | 48.87 | 52.90 | -4.03 | 4.0% (8/200) | 13.6 s | 0.655 | **borderline** |
| Chinese (Simplified) | en->zho_Hans | opus-en-zh | 119 MB | 22.36 | 19.60 | +2.76 | 5.0% (10/200) | 13.7 s | 0.609 | **borderline** |
| Chinese (Traditional) | zho_Hant->en | nllb-200-distilled-600M | 912 MB | 49.70 | 49.70 | — | — | — | — | **baseline** |
| Chinese (Traditional) | en->zho_Hant | nllb-200-distilled-600M | 912 MB | 13.30 | 13.30 | — | — | — | — | **baseline** |
| Croatian | hrv_Latn->en | nllb-200-distilled-600M | 912 MB | 59.50 | 59.50 | — | — | — | — | **baseline** |
| Croatian | en->hrv_Latn | nllb-200-distilled-600M | 912 MB | 52.20 | 52.20 | — | — | — | — | **baseline** |
| Czech | ces_Latn->en | opus-cs-en | 117 MB | 57.39 | 61.50 | -4.11 | 0.5% (1/200) | 14.6 s | 0.798 | **borderline** |
| Czech | en->ces_Latn | opus-en-cs | 117 MB | 51.41 | 52.70 | -1.29 | 0.0% (0/200) | 12.9 s | 0.728 | **pass** |
| Danish | dan_Latn->en | opus-da-en | 113 MB | 65.72 | 67.70 | -1.98 | 0.0% (0/200) | 14.1 s | 0.682 | **pass** |
| Danish | en->dan_Latn | opus-en-da | 113 MB | 64.62 | 63.20 | +1.42 | 1.0% (2/200) | 13.2 s | 0.643 | **pass** |
| Dutch | nld_Latn->en | opus-nl-en | 122 MB | 54.28 | 56.90 | -2.62 | 0.5% (1/200) | 13.7 s | 0.760 | **borderline** |
| Dutch | en->nld_Latn | opus-en-nl | 122 MB | 53.51 | 53.10 | +0.41 | 0.5% (1/200) | 14.8 s | 0.750 | **pass** |
| Finnish | fin_Latn->en | opus-fi-en | 113 MB | 54.01 | 56.60 | -2.59 | 0.5% (1/200) | 13 s | 0.608 | **borderline** |
| Finnish | en->fin_Latn | opus-en-fi | 119 MB | 52.60 | 48.80 | +3.80 | 1.0% (2/200) | 13 s | 0.736 | **pass** |
| French | fra_Latn->en | opus-fr-en | 113 MB | 64.10 | 65.40 | -1.30 | 0.0% (0/200) | 12.3 s | 0.721 | **pass** |
| French | en->fra_Latn | opus-en-fr | 113 MB | 67.18 | 67.00 | +0.18 | 0.0% (0/200) | 12.5 s | 0.718 | **pass** |
| German | deu_Latn->en | opus-de-en | 112 MB | 62.41 | 65.30 | -2.89 | 0.0% (0/200) | 11.4 s | 0.608 | **borderline** |
| German | en->deu_Latn | opus-en-de | 112 MB | 58.65 | 59.40 | -0.75 | 0.0% (0/200) | 12.9 s | 0.697 | **pass** |
| Greek | ell_Grek->en | nllb-200-distilled-600M | 912 MB | 58.40 | 58.40 | — | — | — | — | **baseline** |
| Greek | en->ell_Grek | nllb-200-distilled-600M | 912 MB | 48.50 | 48.50 | — | — | — | — | **baseline** |
| Gujarati | guj_Gujr->en | nllb-200-distilled-600M | 912 MB | 62.50 | 62.50 | — | — | — | — | **baseline** |
| Gujarati | en->guj_Gujr | nllb-200-distilled-600M | 912 MB | 50.40 | 50.40 | — | — | — | — | **baseline** |
| Hausa | hau_Latn->en | nllb-200-distilled-600M | 912 MB | 52.60 | 52.60 | — | — | — | — | **baseline** |
| Hausa | en->hau_Latn | nllb-200-distilled-600M | 912 MB | 49.00 | 49.00 | — | — | — | — | **baseline** |
| Hebrew | heb_Hebr->en | nllb-200-distilled-600M | 912 MB | 61.80 | 61.80 | — | — | — | — | **baseline** |
| Hebrew | en->heb_Hebr | nllb-200-distilled-600M | 912 MB | 50.80 | 50.80 | — | — | — | — | **baseline** |
| Hindi | hin_Deva->en | opus-hi-en | 116 MB | 44.32 | 62.50 | -18.18 | 2.5% (5/200) | 13.3 s | 0.662 | **fail** |
| Hindi | en->hin_Deva | opus-en-hi | 117 MB | 31.27 | 54.20 | -22.93 | 17.0% (34/200) | 13.3 s | 0.686 | **fail** |
| Hungarian | hun_Latn->en | opus-hu-en | 117 MB | 54.74 | 58.00 | -3.26 | 1.0% (2/200) | 12.4 s | 0.733 | **borderline** |
| Hungarian | en->hun_Latn | opus-en-hu | 117 MB | 50.81 | 50.60 | +0.21 | 0.0% (0/200) | 12.9 s | 0.798 | **pass** |
| Indonesian | ind_Latn->en | opus-id-en | 108 MB | 57.41 | 63.90 | -6.49 | 0.5% (1/200) | 13.3 s | 0.544 | **fail** |
| Indonesian | en->ind_Latn | opus-en-id | 108 MB | 62.45 | 66.60 | -4.15 | 3.0% (6/200) | 12.4 s | 0.569 | **borderline** |
| Italian | ita_Latn->en | opus-it-en | 137 MB | 56.73 | 59.30 | -2.57 | 0.5% (1/200) | 14.5 s | 0.957 | **borderline** |
| Italian | en->ita_Latn | opus-en-it | 136 MB | 54.73 | 54.60 | +0.13 | 0.5% (1/200) | 15.9 s | 1.109 | **pass** |
| Japanese | jpn_Jpan->en | opus-ja-en | 115 MB | 43.87 | 50.20 | -6.33 | 1.5% (3/200) | 13.4 s | 0.599 | **fail** |
| Japanese | en->jpn_Jpan | nllb-200-distilled-600M | 912 MB | 23.60 | 23.60 | — | — | — | — | **baseline** |
| Kannada | kan_Knda->en | nllb-200-distilled-600M | 912 MB | 57.00 | 57.00 | — | — | — | — | **baseline** |
| Kannada | en->kan_Knda | nllb-200-distilled-600M | 912 MB | 50.20 | 50.20 | — | — | — | — | **baseline** |
| Korean | kor_Hang->en | opus-ko-en | 120 MB | 44.49 | 52.50 | -8.01 | 1.0% (2/200) | 12.5 s | 0.734 | **fail** |
| Korean | en->kor_Hang | nllb-200-distilled-600M | 912 MB | 32.10 | 32.10 | — | — | — | — | **baseline** |
| Malay | zsm_Latn->en | nllb-200-distilled-600M | 912 MB | 64.30 | 64.30 | — | — | — | — | **baseline** |
| Malay | en->zsm_Latn | nllb-200-distilled-600M | 912 MB | 63.50 | 63.50 | — | — | — | — | **baseline** |
| Malayalam | mal_Mlym->en | nllb-200-distilled-600M | 912 MB | 59.00 | 59.00 | — | — | — | — | **baseline** |
| Malayalam | en->mal_Mlym | nllb-200-distilled-600M | 912 MB | 47.20 | 47.20 | — | — | — | — | **baseline** |
| Marathi | mar_Deva->en | nllb-200-distilled-600M | 912 MB | 58.90 | 58.90 | — | — | — | — | **baseline** |
| Marathi | en->mar_Deva | nllb-200-distilled-600M | 912 MB | 44.60 | 44.60 | — | — | — | — | **baseline** |
| Nepali | npi_Deva->en | nllb-200-distilled-600M | 912 MB | 62.50 | 62.50 | — | — | — | — | **baseline** |
| Nepali | en->npi_Deva | nllb-200-distilled-600M | 912 MB | 49.00 | 49.00 | — | — | — | — | **baseline** |
| Norwegian Bokmål | nob_Latn->en | nllb-200-distilled-600M | 912 MB | 62.90 | 62.90 | — | — | — | — | **baseline** |
| Norwegian Bokmål | en->nob_Latn | nllb-200-distilled-600M | 912 MB | 56.80 | 56.80 | — | — | — | — | **baseline** |
| Odia | ory_Orya->en | nllb-200-distilled-600M | 912 MB | 58.50 | 58.50 | — | — | — | — | **baseline** |
| Odia | en->ory_Orya | nllb-200-distilled-600M | 912 MB | 44.90 | 44.90 | — | — | — | — | **baseline** |
| Pashto | pbt_Arab->en | nllb-200-distilled-600M | 912 MB | 54.50 | 54.50 | — | — | — | — | **baseline** |
| Pashto | en->pbt_Arab | nllb-200-distilled-600M | 912 MB | 36.90 | 36.90 | — | — | — | — | **baseline** |
| Persian | pes_Arab->en | nllb-200-distilled-600M | 912 MB | 58.70 | 58.70 | — | — | — | — | **baseline** |
| Persian | en->pes_Arab | nllb-200-distilled-600M | 912 MB | 47.40 | 47.40 | — | — | — | — | **baseline** |
| Polish | pol_Latn->en | opus-pl-en | 118 MB | 49.37 | 54.30 | -4.93 | 0.0% (0/200) | 13.7 s | 0.728 | **borderline** |
| Polish | en->pol_Latn | nllb-200-distilled-600M | 912 MB | 45.30 | 45.30 | — | — | — | — | **baseline** |
| Portuguese | por_Latn->en | opus-romance-en (group) | 119 MB | 64.25 | 69.00 | -4.75 | 1.0% (2/200) | 13.6 s | 0.661 | **borderline** |
| Portuguese | en->por_Latn | opus-en-romance (group) | 119 MB | 64.86 | 67.40 | -2.54 | 0.0% (0/200) | 14 s | 0.866 | **borderline** |
| Punjabi | pan_Guru->en | nllb-200-distilled-600M | 912 MB | 61.50 | 61.50 | — | — | — | — | **baseline** |
| Punjabi | en->pan_Guru | nllb-200-distilled-600M | 912 MB | 46.70 | 46.70 | — | — | — | — | **baseline** |
| Romanian | ron_Latn->en | nllb-200-distilled-600M | 912 MB | 65.90 | 65.90 | — | — | — | — | **baseline** |
| Romanian | en->ron_Latn | opus-en-ro | 113 MB | 56.84 | 58.20 | -1.36 | 0.0% (0/200) | 13.2 s | 0.778 | **pass** |
| Russian | rus_Cyrl->en | opus-ru-en | 118 MB | 53.17 | 58.60 | -5.43 | 1.0% (2/200) | 13.9 s | 0.704 | **fail** |
| Russian | en->rus_Cyrl | opus-en-ru | 118 MB | 50.16 | 52.50 | -2.34 | 1.0% (2/200) | 15.2 s | 0.777 | **borderline** |
| Serbian | srp_Cyrl->en | nllb-200-distilled-600M | 912 MB | 63.50 | 63.50 | — | — | — | — | **baseline** |
| Serbian | en->srp_Cyrl | nllb-200-distilled-600M | 912 MB | 53.30 | 53.30 | — | — | — | — | **baseline** |
| Sinhala | sin_Sinh->en | nllb-200-distilled-600M | 912 MB | 56.50 | 56.50 | — | — | — | — | **baseline** |
| Sinhala | en->sin_Sinh | nllb-200-distilled-600M | 912 MB | 42.40 | 42.40 | — | — | — | — | **baseline** |
| Spanish | spa_Latn->en | opus-es-en | 119 MB | 54.68 | 57.10 | -2.42 | 0.0% (0/200) | 14.1 s | 0.833 | **borderline** |
| Spanish | en->spa_Latn | opus-en-es | 119 MB | 52.92 | 52.60 | +0.32 | 0.0% (0/200) | 13.3 s | 0.722 | **pass** |
| Swahili | swh_Latn->en | nllb-200-distilled-600M | 912 MB | 60.70 | 60.70 | — | — | — | — | **baseline** |
| Swahili | en->swh_Latn | nllb-200-distilled-600M | 912 MB | 58.00 | 58.00 | — | — | — | — | **baseline** |
| Swedish | swe_Latn->en | opus-sv-en | 110 MB | 64.30 | 67.00 | -2.70 | 0.0% (0/200) | 12.6 s | 0.769 | **borderline** |
| Swedish | en->swe_Latn | opus-en-sv | 110 MB | 63.52 | 62.70 | +0.82 | 1.0% (2/200) | 13.9 s | 0.646 | **pass** |
| Tagalog | tgl_Latn->en | nllb-200-distilled-600M | 912 MB | 63.70 | 63.70 | — | — | — | — | **baseline** |
| Tagalog | en->tgl_Latn | nllb-200-distilled-600M | 912 MB | 56.40 | 56.40 | — | — | — | — | **baseline** |
| Tamil | tam_Taml->en | nllb-200-distilled-600M | 912 MB | 55.80 | 55.80 | — | — | — | — | **baseline** |
| Tamil | en->tam_Taml | nllb-200-distilled-600M | 912 MB | 51.10 | 51.10 | — | — | — | — | **baseline** |
| Telugu | tel_Telu->en | nllb-200-distilled-600M | 912 MB | 61.20 | 61.20 | — | — | — | — | **baseline** |
| Telugu | en->tel_Telu | nllb-200-distilled-600M | 912 MB | 51.80 | 51.80 | — | — | — | — | **baseline** |
| Thai | tha_Thai->en | opus-th-en | 117 MB | 44.49 | 52.70 | -8.21 | 0.5% (1/200) | 13.1 s | 0.752 | **fail** |
| Thai | en->tha_Thai | nllb-200-distilled-600M | 912 MB | 36.00 | 36.00 | — | — | — | — | **baseline** |
| Turkish | tur_Latn->en | opus-tr-en | 117 MB | 53.40 | 60.00 | -6.60 | 1.0% (2/200) | 14.7 s | 0.666 | **fail** |
| Turkish | en->tur_Latn | nllb-200-distilled-600M | 912 MB | 52.90 | 52.90 | — | — | — | — | **baseline** |
| Ukrainian | ukr_Cyrl->en | opus-uk-en | 117 MB | 54.09 | 61.10 | -7.01 | 0.5% (1/200) | 13.1 s | 0.667 | **fail** |
| Ukrainian | en->ukr_Cyrl | opus-en-uk | 117 MB | 43.91 | 50.50 | -6.59 | 1.5% (3/200) | 11.5 s | 0.736 | **fail** |
| Urdu | urd_Arab->en | nllb-200-distilled-600M | 912 MB | 57.80 | 57.80 | — | — | — | — | **baseline** |
| Urdu | en->urd_Arab | nllb-200-distilled-600M | 912 MB | 46.60 | 46.60 | — | — | — | — | **baseline** |
| Vietnamese | vie_Latn->en | opus-vi-en | 107 MB | 49.98 | 58.10 | -8.12 | 0.5% (1/200) | 11.7 s | 0.560 | **fail** |
| Vietnamese | en->vie_Latn | nllb-200-distilled-600M | 912 MB | 56.40 | 56.40 | — | — | — | — | **baseline** |
| Yoruba | yor_Latn->en | nllb-200-distilled-600M | 912 MB | 39.90 | 39.90 | — | — | — | — | **baseline** |
| Yoruba | en->yor_Latn | nllb-200-distilled-600M | 912 MB | 22.90 | 22.90 | — | — | — | — | **baseline** |
| Zulu | zul_Latn->en | nllb-200-distilled-600M | 912 MB | 56.80 | 56.80 | — | — | — | — | **baseline** |
| Zulu | en->zul_Latn | nllb-200-distilled-600M | 912 MB | 51.00 | 51.00 | — | — | — | — | **baseline** |

## List 1 — languages on a small model that are borderline or fail (23)

A quality problem today: the app routes these directions to a small model that does not clear the bar. Each entry shows the direction, the engine, the verdict, the chrF++ vs the published baseline, and the flag rate.

- **Afrikaans** (afr_Latn):  
`afr_Latn->en` (opus-af-en): **fail**, chrF++ 63.47 vs 72.9 (gap -9.43), flags 1.0%  
`en->afr_Latn` (opus-en-af): **borderline**, chrF++ 58.06 vs 62.4 (gap -4.34), flags 1.5%
- **Arabic** (arb_Arab):  
`arb_Arab->en` (opus-ar-en): **borderline**, chrF++ 58.63 vs 62.2 (gap -3.57), flags 0.5%  
`en->arb_Arab` (opus-en-ar): **borderline**, chrF++ 49.56 vs 51.4 (gap -1.84), flags 3.0%
- **Bulgarian** (bul_Cyrl):  
`bul_Cyrl->en` (opus-mul-en): **fail**, chrF++ 51.57 vs 63.4 (gap -11.83), flags 1.5%
- **Chinese (Simplified)** (zho_Hans):  
`en->zho_Hans` (opus-en-zh): **borderline**, chrF++ 22.36 vs 19.6 (gap +2.76), flags 5.0%  
`zho_Hans->en` (opus-zh-en): **borderline**, chrF++ 48.87 vs 52.9 (gap -4.03), flags 4.0%
- **Czech** (ces_Latn):  
`ces_Latn->en` (opus-cs-en): **borderline**, chrF++ 57.39 vs 61.5 (gap -4.11), flags 0.5%
- **Dutch** (nld_Latn):  
`nld_Latn->en` (opus-nl-en): **borderline**, chrF++ 54.28 vs 56.9 (gap -2.62), flags 0.5%
- **Finnish** (fin_Latn):  
`fin_Latn->en` (opus-fi-en): **borderline**, chrF++ 54.01 vs 56.6 (gap -2.59), flags 0.5%
- **German** (deu_Latn):  
`deu_Latn->en` (opus-de-en): **borderline**, chrF++ 62.41 vs 65.3 (gap -2.89), flags 0.0%
- **Hindi** (hin_Deva):  
`en->hin_Deva` (opus-en-hi): **fail**, chrF++ 31.27 vs 54.2 (gap -22.93), flags 17.0%  
`hin_Deva->en` (opus-hi-en): **fail**, chrF++ 44.32 vs 62.5 (gap -18.18), flags 2.5%
- **Hungarian** (hun_Latn):  
`hun_Latn->en` (opus-hu-en): **borderline**, chrF++ 54.74 vs 58 (gap -3.26), flags 1.0%
- **Indonesian** (ind_Latn):  
`en->ind_Latn` (opus-en-id): **borderline**, chrF++ 62.45 vs 66.6 (gap -4.15), flags 3.0%  
`ind_Latn->en` (opus-id-en): **fail**, chrF++ 57.41 vs 63.9 (gap -6.49), flags 0.5%
- **Italian** (ita_Latn):  
`ita_Latn->en` (opus-it-en): **borderline**, chrF++ 56.73 vs 59.3 (gap -2.57), flags 0.5%
- **Japanese** (jpn_Jpan):  
`jpn_Jpan->en` (opus-ja-en): **fail**, chrF++ 43.87 vs 50.2 (gap -6.33), flags 1.5%
- **Korean** (kor_Hang):  
`kor_Hang->en` (opus-ko-en): **fail**, chrF++ 44.49 vs 52.5 (gap -8.01), flags 1.0%
- **Polish** (pol_Latn):  
`pol_Latn->en` (opus-pl-en): **borderline**, chrF++ 49.37 vs 54.3 (gap -4.93), flags 0.0%
- **Portuguese** (por_Latn):  
`en->por_Latn` (opus-en-romance): **borderline**, chrF++ 64.86 vs 67.4 (gap -2.54), flags 0.0%  
`por_Latn->en` (opus-romance-en): **borderline**, chrF++ 64.25 vs 69 (gap -4.75), flags 1.0%
- **Russian** (rus_Cyrl):  
`en->rus_Cyrl` (opus-en-ru): **borderline**, chrF++ 50.16 vs 52.5 (gap -2.34), flags 1.0%  
`rus_Cyrl->en` (opus-ru-en): **fail**, chrF++ 53.17 vs 58.6 (gap -5.43), flags 1.0%
- **Spanish** (spa_Latn):  
`spa_Latn->en` (opus-es-en): **borderline**, chrF++ 54.68 vs 57.1 (gap -2.42), flags 0.0%
- **Swedish** (swe_Latn):  
`swe_Latn->en` (opus-sv-en): **borderline**, chrF++ 64.3 vs 67 (gap -2.7), flags 0.0%
- **Thai** (tha_Thai):  
`tha_Thai->en` (opus-th-en): **fail**, chrF++ 44.49 vs 52.7 (gap -8.21), flags 0.5%
- **Turkish** (tur_Latn):  
`tur_Latn->en` (opus-tr-en): **fail**, chrF++ 53.4 vs 60 (gap -6.6), flags 1.0%
- **Ukrainian** (ukr_Cyrl):  
`en->ukr_Cyrl` (opus-en-uk): **fail**, chrF++ 43.91 vs 50.5 (gap -6.59), flags 1.5%  
`ukr_Cyrl->en` (opus-uk-en): **fail**, chrF++ 54.09 vs 61.1 (gap -7.01), flags 0.5%
- **Vietnamese** (vie_Latn):  
`vie_Latn->en` (opus-vi-en): **fail**, chrF++ 49.98 vs 58.1 (gap -8.12), flags 0.5%

## List 2 — languages with no small model at all (29)

Every direction routes to the full model (the honest heavy path, ~912 MB download). These are coverage gaps, not quality failures: the full model is the bar itself.

Amharic (amh_Ethi), Assamese (asm_Beng), Bengali (ben_Beng), Catalan (cat_Latn), Chinese (Traditional) (zho_Hant), Croatian (hrv_Latn), Greek (ell_Grek), Gujarati (guj_Gujr), Hausa (hau_Latn), Hebrew (heb_Hebr), Kannada (kan_Knda), Malay (zsm_Latn), Malayalam (mal_Mlym), Marathi (mar_Deva), Nepali (npi_Deva), Norwegian Bokmål (nob_Latn), Odia (ory_Orya), Pashto (pbt_Arab), Persian (pes_Arab), Punjabi (pan_Guru), Serbian (srp_Cyrl), Sinhala (sin_Sinh), Swahili (swh_Latn), Tagalog (tgl_Latn), Tamil (tam_Taml), Telugu (tel_Telu), Urdu (urd_Arab), Yoruba (yor_Latn), Zulu (zul_Latn)

## Full model — P1 local runs (provenance only)

The five directions where the full model itself was run locally in the P1 Node harness, showing the local-vs-published calibration:

- eng_Latn->fra_Latn: local 65.72 vs published 67 (delta -1.28, flags 2.0%)
- eng_Latn->hin_Deva: local 52.05 vs published 54.2 (delta -2.15, flags 2.5%)
- fra_Latn->eng_Latn: local 64.56 vs published 65.4 (delta -0.84, flags 1.0%)
- hin_Deva->eng_Latn: local 61.77 vs published 62.5 (delta -0.73, flags 0.0%)
- eng_Latn->zho_Hans: local 17.72 vs published 19.6 (delta -1.88, flags 18.5%)

## Notes on the borderline-by-flags directions

- **en->ar (opus-en-ar)** and **en->zh (opus-en-zh)** clear the chrF bar (en->zh is +2.7 *above* the published baseline) but flag on 15.5% / 17.5% of sentences. Reviewed by hand: most of those flags are a missing final period or a missing final 。, not lost content; en->zh also has 3 wrong-script sentences and 7 length-ratio flags. For context, the full model's own local en->zho_Hans run in P1 flagged 36.5% (greedy early stops are endemic to this direction) and scored 17.72 vs the small model's 22.32 — on this pair the fast route is the *better* option on both signals.
- **Hindi (both directions)** is the clearest quality failure among the single-pair models: clause dropping, hallucinated content ("escaped marriage in Nepal" became India), repeat loops and mass truncation on news-domain sentences; -22.9 (en->hi) and -18.2 (hi->en) against the baseline.
- **The two mul group models** fail every direction they serve (gaps -9.3 to -19.0): half the sentences truncate mid-word into Croatian/Bulgarian/Serbian/Norwegian. The language audit kept them on ten conversational sentences against the full model's output; the professional human references overturn that. The Romance group model is materially better (en->por -2.5, por->en -4.8, both borderline; ron->en -7.8 fails).


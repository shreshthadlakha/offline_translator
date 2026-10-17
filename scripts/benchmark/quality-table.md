# Quality table — every engine the app routes, scored against professional human translation

Generated 2026-10-17 from the P1 benchmark: 200 fixed FLORES-200 devtest sentences (seed 42, the same ids for every language and direction), chrF++ scored against the professional human references, run through the real browser worker bundle. The baseline is the full model's own published chrF++ (NLLB-200 distilled 600M, model-card metrics). Nothing typed or translated left the device.

**The bar** (`scripts/benchmark/quality-bar.mjs`, all constants adjustable): a small model **passes** a direction when its chrF++ is within 2 points of the published baseline (or higher) **and** at most 2% of sentences carry a sanity flag; within 5 points is **borderline**; more than 5 below is **fail**. A chrF-pass gap with a flag breach is borderline, not fail — the flag review showed the high-flag passes (en->ar 15.5%, en->zh 17.5%) are mostly missing final punctuation rather than broken output. Full-model rows are **baseline**: the full model is the bar, so it gets no run and no verdict.

**Calibration**: P1 measured this local harness against the published numbers on the same model: a stable -1.38 chrF++ offset (greedy q8, 200 of 1012 sentences, vs Meta's full-devtest eval). CALIBRATION_OFFSET is 0 here, so gaps are the literal published comparison — a small model exactly as good as the full model reads about -1.4 and still passes.

**How to read the speed columns**: cold load and median seconds per sentence for small models come from the real browser worker path (one fresh model download per direction, one sentence at a time — what a user actually experiences). Full-model rows have no run: this 4 GB sandbox's browser cannot load the 600M model; five directions have P1 Node-harness local numbers at the bottom.

CJK directions have naturally low chrF++ (published en->zh is 19.6): the gap vs baseline is what counts, never the absolute number.

**Verdicts across the 95 routed small-model directions: 70 pass, 25 borderline, 0 fail.** Plus 15 full-model baseline rows (one per remaining language direction).

| Language | Direction | Engine | Model | chrF++ | Baseline | Gap | Flags | Cold load | Median s/sent | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Afrikaans | afr_Latn->en | bergamot-af-en | 36 MB | 72.59 | 72.90 | -0.31 | 0.0% (0/200) | 7.1 s | 0.078 | **pass** |
| Afrikaans | en->afr_Latn | opus-en-af | 111 MB | 58.06 | 62.40 | -4.34 | 1.5% (3/200) | 12.6 s | 0.678 | **borderline** |
| Amharic | amh_Ethi->en | nllb-200-distilled-600M | 912 MB | 54.90 | 54.90 | — | — | — | — | **baseline** |
| Amharic | en->amh_Ethi | nllb-200-distilled-600M | 912 MB | 37.20 | 37.20 | — | — | — | — | **baseline** |
| Arabic | arb_Arab->en | opus-ar-en | 118 MB | 58.63 | 62.20 | -3.57 | 0.5% (1/200) | 12.1 s | 0.814 | **borderline** |
| Arabic | en->arb_Arab | opus-en-ar | 118 MB | 49.56 | 51.40 | -1.84 | 3.0% (6/200) | 13.1 s | 0.679 | **borderline** |
| Assamese | asm_Beng->en | indictrans2-indic-en | 262 MB | 54.63 | 52.70 | +1.93 | 0.0% (0/200) | 32.3 s | 0.904 | **pass** |
| Assamese | en->asm_Beng | indictrans2-en-indic | 309 MB | 38.84 | 34.60 | +4.24 | 1.0% (2/200) | 36.7 s | 1.874 | **pass** |
| Bengali | ben_Beng->en | indictrans2-indic-en | 262 MB | 60.71 | 57.90 | +2.81 | 0.5% (1/200) | 33.2 s | 0.827 | **pass** |
| Bengali | en->ben_Beng | indictrans2-en-indic | 309 MB | 51.26 | 46.20 | +5.06 | 0.0% (0/200) | 37.2 s | 1.305 | **pass** |
| Bulgarian | bul_Cyrl->en | bergamot-bg-en | 37 MB | 63.01 | 63.40 | -0.39 | 0.0% (0/200) | 7.5 s | 0.073 | **pass** |
| Bulgarian | en->bul_Cyrl | bergamot-en-bg | 36 MB | 65.83 | 60.40 | +5.43 | 0.0% (0/200) | 7.8 s | 0.080 | **pass** |
| Catalan | cat_Latn->en | bergamot-ca-en | 37 MB | 65.84 | 66.60 | -0.76 | 0.0% (0/200) | 8.2 s | 0.077 | **pass** |
| Catalan | en->cat_Latn | bergamot-en-ca | 37 MB | 64.65 | 61.20 | +3.45 | 0.0% (0/200) | 9.5 s | 0.076 | **pass** |
| Chinese (Simplified) | zho_Hans->en | opus-zh-en | 119 MB | 48.87 | 52.90 | -4.03 | 4.0% (8/200) | 13.6 s | 0.655 | **borderline** |
| Chinese (Simplified) | en->zho_Hans | opus-en-zh | 119 MB | 22.36 | 19.60 | +2.76 | 5.0% (10/200) | 13.7 s | 0.609 | **borderline** |
| Chinese (Traditional) | zho_Hant->en | bergamot-zh-Hant-en | 52 MB | 51.05 | 49.70 | +1.35 | 0.0% (0/200) | 11.3 s | 0.068 | **pass** |
| Chinese (Traditional) | en->zho_Hant | bergamot-en-zh-Hant | 49 MB | 21.34 | 13.30 | +8.04 | 2.0% (4/200) | 10.9 s | 0.067 | **pass** |
| Croatian | hrv_Latn->en | bergamot-hbs-en | 38 MB | 60.15 | 59.50 | +0.65 | 0.0% (0/200) | 6.7 s | 0.071 | **pass** |
| Croatian | en->hrv_Latn | bergamot-en-hr | 36 MB | 57.80 | 52.20 | +5.60 | 0.5% (1/200) | 6.9 s | 0.077 | **pass** |
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
| Greek | ell_Grek->en | bergamot-el-en | 22 MB | 56.35 | 58.40 | -2.05 | 0.0% (0/200) | 7.2 s | 0.040 | **borderline** |
| Greek | en->ell_Grek | bergamot-en-el | 21 MB | 50.55 | 48.50 | +2.05 | 0.5% (1/200) | 6.8 s | 0.041 | **pass** |
| Gujarati | guj_Gujr->en | indictrans2-indic-en | 262 MB | 64.70 | 62.50 | +2.20 | 0.0% (0/200) | 33.3 s | 0.827 | **pass** |
| Gujarati | en->guj_Gujr | indictrans2-en-indic | 309 MB | 55.37 | 50.40 | +4.97 | 0.0% (0/200) | 38.5 s | 1.366 | **pass** |
| Hausa | hau_Latn->en | nllb-200-distilled-600M | 912 MB | 52.60 | 52.60 | — | — | — | — | **baseline** |
| Hausa | en->hau_Latn | nllb-200-distilled-600M | 912 MB | 49.00 | 49.00 | — | — | — | — | **baseline** |
| Hebrew | heb_Hebr->en | bergamot-he-en | 23 MB | 62.56 | 61.80 | +0.76 | 0.0% (0/200) | 7.2 s | 0.037 | **pass** |
| Hebrew | en->heb_Hebr | opus-en-he | 155 MB | 53.28 | 50.80 | +2.48 | 0.0% (0/200) | 26.1 s | 0.465 | **pass** |
| Hindi | hin_Deva->en | indictrans2-indic-en | 262 MB | 65.68 | 62.50 | +3.18 | 0.0% (0/200) | 33.1 s | 0.767 | **pass** |
| Hindi | en->hin_Deva | indictrans2-en-indic | 309 MB | 57.86 | 54.20 | +3.66 | 0.0% (0/200) | 36.7 s | 1.321 | **pass** |
| Hungarian | hun_Latn->en | opus-hu-en | 117 MB | 54.74 | 58.00 | -3.26 | 1.0% (2/200) | 12.4 s | 0.733 | **borderline** |
| Hungarian | en->hun_Latn | opus-en-hu | 117 MB | 50.81 | 50.60 | +0.21 | 0.0% (0/200) | 12.9 s | 0.798 | **pass** |
| Indonesian | ind_Latn->en | bergamot-id-en | 22 MB | 62.48 | 63.90 | -1.42 | 0.0% (0/200) | 6.2 s | 0.035 | **pass** |
| Indonesian | en->ind_Latn | opus-en-id | 108 MB | 62.45 | 66.60 | -4.15 | 3.0% (6/200) | 12.4 s | 0.569 | **borderline** |
| Italian | ita_Latn->en | opus-it-en | 137 MB | 56.73 | 59.30 | -2.57 | 0.5% (1/200) | 14.5 s | 0.957 | **borderline** |
| Italian | en->ita_Latn | opus-en-it | 136 MB | 54.73 | 54.60 | +0.13 | 0.5% (1/200) | 15.9 s | 1.109 | **pass** |
| Japanese | jpn_Jpan->en | bergamot-ja-en | 55 MB | 52.49 | 50.20 | +2.29 | 0.0% (0/200) | 10.5 s | 0.071 | **pass** |
| Japanese | en->jpn_Jpan | bergamot-en-ja | 50 MB | 28.91 | 23.60 | +5.31 | 0.0% (0/200) | 11.7 s | 0.066 | **pass** |
| Kannada | kan_Knda->en | indictrans2-indic-en | 262 MB | 58.91 | 57.00 | +1.91 | 0.0% (0/200) | 30.9 s | 0.861 | **pass** |
| Kannada | en->kan_Knda | indictrans2-en-indic | 309 MB | 53.18 | 50.20 | +2.98 | 0.0% (0/200) | 36.5 s | 1.344 | **pass** |
| Korean | kor_Hang->en | bergamot-ko-en | 54 MB | 52.90 | 52.50 | +0.40 | 0.0% (0/200) | 10.1 s | 0.067 | **pass** |
| Korean | en->kor_Hang | bergamot-en-ko | 52 MB | 34.84 | 32.10 | +2.74 | 2.0% (4/200) | 11.2 s | 0.068 | **pass** |
| Malay | zsm_Latn->en | bergamot-ms-en | 22 MB | 62.10 | 64.30 | -2.20 | 0.5% (1/200) | 7 s | 0.033 | **borderline** |
| Malay | en->zsm_Latn | bergamot-en-ms | 22 MB | 65.59 | 63.50 | +2.09 | 0.0% (0/200) | 6.6 s | 0.034 | **pass** |
| Malayalam | mal_Mlym->en | indictrans2-indic-en | 262 MB | 61.10 | 59.00 | +2.10 | 0.0% (0/200) | 35.9 s | 0.852 | **pass** |
| Malayalam | en->mal_Mlym | indictrans2-en-indic | 309 MB | 54.50 | 47.20 | +7.30 | 2.0% (4/200) | 38.7 s | 1.545 | **pass** |
| Marathi | mar_Deva->en | indictrans2-indic-en | 262 MB | 62.43 | 58.90 | +3.53 | 0.5% (1/200) | 33.2 s | 0.811 | **pass** |
| Marathi | en->mar_Deva | indictrans2-en-indic | 309 MB | 50.24 | 44.60 | +5.64 | 0.5% (1/200) | 37 s | 1.282 | **pass** |
| Nepali | npi_Deva->en | indictrans2-indic-en | 262 MB | 64.81 | 62.50 | +2.31 | 0.0% (0/200) | 32.6 s | 0.833 | **pass** |
| Nepali | en->npi_Deva | indictrans2-en-indic | 309 MB | 55.34 | 49.00 | +6.34 | 0.0% (0/200) | 36.6 s | 1.209 | **pass** |
| Norwegian Bokmål | nob_Latn->en | bergamot-nb-en | 22 MB | 63.73 | 62.90 | +0.83 | 0.0% (0/200) | 7.4 s | 0.036 | **pass** |
| Norwegian Bokmål | en->nob_Latn | bergamot-en-nb | 22 MB | 60.08 | 56.80 | +3.28 | 1.0% (2/200) | 6.4 s | 0.035 | **pass** |
| Odia | ory_Orya->en | indictrans2-indic-en | 262 MB | 60.72 | 58.50 | +2.22 | 0.0% (0/200) | 34.4 s | 0.808 | **pass** |
| Odia | en->ory_Orya | indictrans2-en-indic | 309 MB | 48.09 | 44.90 | +3.19 | 0.0% (0/200) | 38.7 s | 1.312 | **pass** |
| Pashto | pbt_Arab->en | nllb-200-distilled-600M | 912 MB | 54.50 | 54.50 | — | — | — | — | **baseline** |
| Pashto | en->pbt_Arab | nllb-200-distilled-600M | 912 MB | 36.90 | 36.90 | — | — | — | — | **baseline** |
| Persian | pes_Arab->en | bergamot-fa-en | 22 MB | 57.44 | 58.70 | -1.26 | 0.0% (0/200) | 6.9 s | 0.037 | **pass** |
| Persian | en->pes_Arab | bergamot-en-fa | 22 MB | 51.19 | 47.40 | +3.79 | 0.5% (1/200) | 6.2 s | 0.038 | **pass** |
| Polish | pol_Latn->en | bergamot-pl-en | 37 MB | 53.19 | 54.30 | -1.11 | 0.0% (0/200) | 7.7 s | 0.079 | **pass** |
| Polish | en->pol_Latn | bergamot-en-pl | 36 MB | 48.27 | 45.30 | +2.97 | 0.5% (1/200) | 10 s | 0.081 | **pass** |
| Portuguese | por_Latn->en | opus-romance-en (group) | 119 MB | 64.25 | 69.00 | -4.75 | 1.0% (2/200) | 13.6 s | 0.661 | **borderline** |
| Portuguese | en->por_Latn | opus-en-romance (group) | 119 MB | 64.86 | 67.40 | -2.54 | 0.0% (0/200) | 14 s | 0.866 | **borderline** |
| Punjabi | pan_Guru->en | indictrans2-indic-en | 262 MB | 63.31 | 61.50 | +1.81 | 0.5% (1/200) | 32.8 s | 0.870 | **pass** |
| Punjabi | en->pan_Guru | indictrans2-en-indic | 309 MB | 50.56 | 46.70 | +3.86 | 0.0% (0/200) | 34.3 s | 1.796 | **pass** |
| Romanian | ron_Latn->en | bergamot-ro-en | 23 MB | 63.35 | 65.90 | -2.55 | 0.0% (0/200) | 6.6 s | 0.042 | **borderline** |
| Romanian | en->ron_Latn | opus-en-ro | 113 MB | 56.84 | 58.20 | -1.36 | 0.0% (0/200) | 13.2 s | 0.778 | **pass** |
| Russian | rus_Cyrl->en | bergamot-ru-en | 37 MB | 57.70 | 58.60 | -0.90 | 0.0% (0/200) | 8.2 s | 0.077 | **pass** |
| Russian | en->rus_Cyrl | opus-en-ru | 118 MB | 50.16 | 52.50 | -2.34 | 1.0% (2/200) | 15.2 s | 0.777 | **borderline** |
| Serbian | srp_Cyrl->en | bergamot-hbs-en | 38 MB | 63.86 | 63.50 | +0.36 | 0.0% (0/200) | 6.6 s | 0.074 | **pass** |
| Serbian | en->srp_Cyrl | bergamot-en-sr | 35 MB | 61.12 | 53.30 | +7.82 | 0.5% (1/200) | 7.8 s | 0.073 | **pass** |
| Sinhala | sin_Sinh->en | nllb-200-distilled-600M | 912 MB | 56.50 | 56.50 | — | — | — | — | **baseline** |
| Sinhala | en->sin_Sinh | nllb-200-distilled-600M | 912 MB | 42.40 | 42.40 | — | — | — | — | **baseline** |
| Spanish | spa_Latn->en | opus-es-en | 119 MB | 54.68 | 57.10 | -2.42 | 0.0% (0/200) | 14.1 s | 0.833 | **borderline** |
| Spanish | en->spa_Latn | opus-en-es | 119 MB | 52.92 | 52.60 | +0.32 | 0.0% (0/200) | 13.3 s | 0.722 | **pass** |
| Swahili | swh_Latn->en | nllb-200-distilled-600M | 912 MB | 60.70 | 60.70 | — | — | — | — | **baseline** |
| Swahili | en->swh_Latn | opus-en-sw | 143 MB | 53.66 | 58.00 | -4.34 | 3.0% (6/200) | 16.3 s | 0.458 | **borderline** |
| Swedish | swe_Latn->en | opus-sv-en | 110 MB | 64.30 | 67.00 | -2.70 | 0.0% (0/200) | 12.6 s | 0.769 | **borderline** |
| Swedish | en->swe_Latn | opus-en-sv | 110 MB | 63.52 | 62.70 | +0.82 | 1.0% (2/200) | 13.9 s | 0.646 | **pass** |
| Tagalog | tgl_Latn->en | nllb-200-distilled-600M | 912 MB | 63.70 | 63.70 | — | — | — | — | **baseline** |
| Tagalog | en->tgl_Latn | nllb-200-distilled-600M | 912 MB | 56.40 | 56.40 | — | — | — | — | **baseline** |
| Tamil | tam_Taml->en | indictrans2-indic-en | 262 MB | 57.51 | 55.80 | +1.71 | 0.0% (0/200) | 32.5 s | 0.826 | **pass** |
| Tamil | en->tam_Taml | indictrans2-en-indic | 309 MB | 56.11 | 51.10 | +5.01 | 0.0% (0/200) | 38.1 s | 1.398 | **pass** |
| Telugu | tel_Telu->en | indictrans2-indic-en | 262 MB | 62.57 | 61.20 | +1.37 | 2.5% (5/200) | 44.5 s | 0.830 | **borderline** |
| Telugu | en->tel_Telu | indictrans2-en-indic | 309 MB | 57.60 | 51.80 | +5.80 | 0.5% (1/200) | 35.4 s | 1.258 | **pass** |
| Thai | tha_Thai->en | bergamot-th-en | 37 MB | 53.89 | 52.70 | +1.19 | 0.0% (0/200) | 8.2 s | 0.071 | **pass** |
| Thai | en->tha_Thai | bergamot-en-th | 36 MB | 46.02 | 36.00 | +10.02 | 0.5% (1/200) | 8.5 s | 0.065 | **pass** |
| Turkish | tur_Latn->en | bergamot-tr-en | 23 MB | 57.82 | 60.00 | -2.18 | 0.0% (0/200) | 7.1 s | 0.037 | **borderline** |
| Turkish | en->tur_Latn | bergamot-en-tr | 21 MB | 56.79 | 52.90 | +3.89 | 0.0% (0/200) | 6.5 s | 0.036 | **pass** |
| Ukrainian | ukr_Cyrl->en | bergamot-uk-en | 22 MB | 58.76 | 61.10 | -2.34 | 0.0% (0/200) | 6.3 s | 0.039 | **borderline** |
| Ukrainian | en->ukr_Cyrl | bergamot-en-uk | 36 MB | 55.65 | 50.50 | +5.15 | 0.0% (0/200) | 8 s | 0.077 | **pass** |
| Urdu | urd_Arab->en | indictrans2-indic-en | 262 MB | 59.06 | 57.80 | +1.26 | 0.0% (0/200) | 33.6 s | 0.867 | **pass** |
| Urdu | en->urd_Arab | indictrans2-en-indic | 309 MB | 49.85 | 46.60 | +3.25 | 0.0% (0/200) | 35.9 s | 1.478 | **pass** |
| Vietnamese | vie_Latn->en | bergamot-vi-en | 22 MB | 55.94 | 58.10 | -2.16 | 0.5% (1/200) | 7.1 s | 0.037 | **borderline** |
| Vietnamese | en->vie_Latn | bergamot-en-vi | 37 MB | 59.20 | 56.40 | +2.80 | 0.0% (0/200) | 8.5 s | 0.077 | **pass** |
| Yoruba | yor_Latn->en | nllb-200-distilled-600M | 912 MB | 39.90 | 39.90 | — | — | — | — | **baseline** |
| Yoruba | en->yor_Latn | nllb-200-distilled-600M | 912 MB | 22.90 | 22.90 | — | — | — | — | **baseline** |
| Zulu | zul_Latn->en | nllb-200-distilled-600M | 912 MB | 56.80 | 56.80 | — | — | — | — | **baseline** |
| Zulu | en->zul_Latn | nllb-200-distilled-600M | 912 MB | 51.00 | 51.00 | — | — | — | — | **baseline** |

## List 1 — languages on a small model that are borderline or fail (22)

A quality problem today: the app routes these directions to a small model that does not clear the bar. Each entry shows the direction, the engine, the verdict, the chrF++ vs the published baseline, and the flag rate.

- **Afrikaans** (afr_Latn):  
`en->afr_Latn` (opus-en-af): **borderline**, chrF++ 58.06 vs 62.4 (gap -4.34), flags 1.5%
- **Arabic** (arb_Arab):  
`arb_Arab->en` (opus-ar-en): **borderline**, chrF++ 58.63 vs 62.2 (gap -3.57), flags 0.5%  
`en->arb_Arab` (opus-en-ar): **borderline**, chrF++ 49.56 vs 51.4 (gap -1.84), flags 3.0%
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
- **Greek** (ell_Grek):  
`ell_Grek->en` (bergamot-el-en): **borderline**, chrF++ 56.35 vs 58.4 (gap -2.05), flags 0.0%
- **Hungarian** (hun_Latn):  
`hun_Latn->en` (opus-hu-en): **borderline**, chrF++ 54.74 vs 58 (gap -3.26), flags 1.0%
- **Indonesian** (ind_Latn):  
`en->ind_Latn` (opus-en-id): **borderline**, chrF++ 62.45 vs 66.6 (gap -4.15), flags 3.0%
- **Italian** (ita_Latn):  
`ita_Latn->en` (opus-it-en): **borderline**, chrF++ 56.73 vs 59.3 (gap -2.57), flags 0.5%
- **Malay** (zsm_Latn):  
`zsm_Latn->en` (bergamot-ms-en): **borderline**, chrF++ 62.1 vs 64.3 (gap -2.2), flags 0.5%
- **Portuguese** (por_Latn):  
`en->por_Latn` (opus-en-romance): **borderline**, chrF++ 64.86 vs 67.4 (gap -2.54), flags 0.0%  
`por_Latn->en` (opus-romance-en): **borderline**, chrF++ 64.25 vs 69 (gap -4.75), flags 1.0%
- **Romanian** (ron_Latn):  
`ron_Latn->en` (bergamot-ro-en): **borderline**, chrF++ 63.35 vs 65.9 (gap -2.55), flags 0.0%
- **Russian** (rus_Cyrl):  
`en->rus_Cyrl` (opus-en-ru): **borderline**, chrF++ 50.16 vs 52.5 (gap -2.34), flags 1.0%
- **Spanish** (spa_Latn):  
`spa_Latn->en` (opus-es-en): **borderline**, chrF++ 54.68 vs 57.1 (gap -2.42), flags 0.0%
- **Swahili** (swh_Latn):  
`en->swh_Latn` (opus-en-sw): **borderline**, chrF++ 53.66 vs 58 (gap -4.34), flags 3.0%
- **Swedish** (swe_Latn):  
`swe_Latn->en` (opus-sv-en): **borderline**, chrF++ 64.3 vs 67 (gap -2.7), flags 0.0%
- **Telugu** (tel_Telu):  
`tel_Telu->en` (indictrans2-indic-en): **borderline**, chrF++ 62.57 vs 61.2 (gap +1.37), flags 2.5%
- **Turkish** (tur_Latn):  
`tur_Latn->en` (bergamot-tr-en): **borderline**, chrF++ 57.82 vs 60 (gap -2.18), flags 0.0%
- **Ukrainian** (ukr_Cyrl):  
`ukr_Cyrl->en` (bergamot-uk-en): **borderline**, chrF++ 58.76 vs 61.1 (gap -2.34), flags 0.0%
- **Vietnamese** (vie_Latn):  
`vie_Latn->en` (bergamot-vi-en): **borderline**, chrF++ 55.94 vs 58.1 (gap -2.16), flags 0.5%

## List 2 — languages with no small model at all (7)

Every direction routes to the full model (the honest heavy path, ~912 MB download). These are coverage gaps, not quality failures: the full model is the bar itself.

Amharic (amh_Ethi), Hausa (hau_Latn), Pashto (pbt_Arab), Sinhala (sin_Sinh), Tagalog (tgl_Latn), Yoruba (yor_Latn), Zulu (zul_Latn)

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


# P2c — decoding settings vs small-model quality

Every cell: the same 200-sentence FLORES-200 devtest sample as P1/P2/P2b, the real browser worker bundle, the same scoring (chrF++ on the app-visible text, sanity flags on the raw model output) and the same quality bar as the P2 table. Only the decoding settings handed to the worker differ; the app's defaults and routing are untouched.

Variants: **A** = current settings · **B** = generous limit · **C** = B + no_repeat_ngram_size 3 · **D** = B + beam search (2 beams) · **E** = B + beam search (4 beams)

## 1. Token-length check (task 1, measured before any run)

References tokenized with each engine's own tokenizer; "fits" = reference tokens + 1 (the EOS slot) <= the variant's limit computed from the matching source tokens (the group engine's sources carry the `>>hrv<<` tag, like the worker's budget code).

| direction | engine | med src tok | med ref tok | med limit A | refs not fitting A | med limit B | refs not fitting B |
|---|---|---|---|---|---|---|---|
| eng_Latn → hrv_Latn | opus-en-mul | 28 | 48 | 53 | 29.0% | 100 | 0.0% |
| eng_Latn → hin_Deva | opus-en-hi | 27 | 31 | 51 | 0.0% | 97 | 0.0% |
| eng_Latn → vie_Latn | opus-en-vi | 27 | 33 | 51 | 0.0% | 97 | 0.0% |
| kor_Hang → eng_Latn | opus-ko-en | 29 | 27 | 54 | 0.0% | 103 | 0.0% |
| tha_Thai → eng_Latn | opus-th-en | 23 | 27 | 45 | 0.0% | 85 | 0.0% |
| rus_Cyrl → eng_Latn | opus-ru-en | 32 | 27 | 59 | 0.0% | 112 | 0.0% |
| eng_Latn → zho_Hans | opus-en-zh | 27 | 25 | 51 | 0.5% | 97 | 0.0% |
| eng_Latn → fra_Latn | opus-en-fr | 28 | 33 | 53 | 0.0% | 100 | 0.0% |
| eng_Latn → deu_Latn | opus-en-de | 27 | 30 | 51 | 0.0% | 97 | 0.0% |

## 2. chrF++ by variant (gap vs the full model's published baseline in parentheses)

| direction | A | B | C | D | E |
|---|---|---|---|---|---|
| eng_Latn → hrv_Latn | 39.3 (-12.9) FAIL | 39.9 (-12.3) FAIL | 39.5 (-12.7) FAIL | 39.9 (-12.3) FAIL | 39.9 (-12.3) FAIL |
| eng_Latn → hin_Deva | 31.3 (-22.9) FAIL | 31.3 (-22.9) FAIL | 31.4 (-22.8) FAIL | 31.3 (-22.9) FAIL | 31.3 (-22.9) FAIL |
| eng_Latn → vie_Latn | 42.4 (-14.0) FAIL | 42.5 (-13.9) FAIL | 42.5 (-13.9) FAIL | 42.5 (-13.9) FAIL | 42.5 (-13.9) FAIL |
| kor_Hang → eng_Latn | 44.5 (-8.0) FAIL | 44.5 (-8.0) FAIL | 44.5 (-8.0) FAIL | 44.5 (-8.0) FAIL | 44.5 (-8.0) FAIL |
| tha_Thai → eng_Latn | 44.5 (-8.2) FAIL | 44.5 (-8.2) FAIL | 44.4 (-8.3) FAIL | 44.5 (-8.2) FAIL | 44.5 (-8.2) FAIL |
| rus_Cyrl → eng_Latn | 53.2 (-5.4) FAIL | 53.1 (-5.5) FAIL | 53.3 (-5.3) FAIL | 53.1 (-5.5) FAIL | 53.1 (-5.5) FAIL |
| eng_Latn → zho_Hans | 22.4 (+2.8) BORD | 22.4 (+2.8) BORD | 22.2 (+2.6) BORD | 22.4 (+2.8) BORD | 22.4 (+2.8) BORD |
| eng_Latn → fra_Latn | 67.2 (+0.2) PASS | 67.2 (+0.2) PASS | 66.9 (-0.1) PASS | 67.2 (+0.2) PASS | 67.2 (+0.2) PASS |
| eng_Latn → deu_Latn | 58.6 (-0.8) PASS | 58.6 (-0.8) PASS | 58.5 (-0.9) PASS | 58.6 (-0.8) PASS | 58.6 (-0.8) PASS |

## 3. Sanity flags by variant (flagged sentences / 200; mid-word cuts and loops in parentheses)

`cut` = endsMidWord (mid-word truncation evidence), `loop` = repeatLoop. missingFinalPunct is a count, never a flag (P2b).

| direction | A | B | C | D | E |
|---|---|---|---|---|---|
| eng_Latn → hrv_Latn | 15 (cut 11, loop 0) | 4 (cut 0, loop 0) | 4 (cut 0, loop 0) | 4 (cut 0, loop 0) | 4 (cut 0, loop 0) |
| eng_Latn → hin_Deva | 34 (cut 0, loop 7) | 34 (cut 0, loop 7) | 32 (cut 0, loop 4) | 34 (cut 0, loop 7) | 34 (cut 0, loop 7) |
| eng_Latn → vie_Latn | 11 (cut 0, loop 9) | 11 (cut 0, loop 9) | 9 (cut 0, loop 7) | 11 (cut 0, loop 9) | 11 (cut 0, loop 9) |
| kor_Hang → eng_Latn | 4 (cut 2, loop 0) | 4 (cut 2, loop 0) | 4 (cut 2, loop 0) | 4 (cut 2, loop 0) | 4 (cut 2, loop 0) |
| tha_Thai → eng_Latn | 2 (cut 1, loop 0) | 2 (cut 1, loop 0) | 2 (cut 1, loop 0) | 2 (cut 1, loop 0) | 2 (cut 1, loop 0) |
| rus_Cyrl → eng_Latn | 3 (cut 1, loop 1) | 3 (cut 1, loop 1) | 2 (cut 1, loop 0) | 3 (cut 1, loop 1) | 3 (cut 1, loop 1) |
| eng_Latn → zho_Hans | 10 (cut 0, loop 1) | 11 (cut 0, loop 1) | 11 (cut 0, loop 1) | 11 (cut 0, loop 1) | 11 (cut 0, loop 1) |
| eng_Latn → fra_Latn | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) |
| eng_Latn → deu_Latn | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) | 0 (cut 0, loop 0) |

## 4. Speed by variant (median seconds per sentence; × = ratio vs A)

| direction | A | B | C | D | E |
|---|---|---|---|---|---|
| eng_Latn → hrv_Latn | 1.29s (×1.00) | 1.21s (×0.94) | 1.17s (×0.91) | 1.28s (×1.00) | 1.20s (×0.93) |
| eng_Latn → hin_Deva | 0.66s (×1.00) | 0.65s (×0.99) | 0.67s (×1.01) | 0.72s (×1.09) | 0.72s (×1.10) |
| eng_Latn → vie_Latn | 0.67s (×1.00) | 0.68s (×1.01) | 0.79s (×1.17) | 0.65s (×0.97) | 0.69s (×1.02) |
| kor_Hang → eng_Latn | 0.60s (×1.00) | 0.70s (×1.16) | 0.71s (×1.18) | 0.67s (×1.12) | 0.71s (×1.18) |
| tha_Thai → eng_Latn | 0.62s (×1.00) | 0.64s (×1.03) | 0.68s (×1.09) | 0.70s (×1.12) | 0.63s (×1.01) |
| rus_Cyrl → eng_Latn | 0.65s (×1.00) | 0.70s (×1.09) | 0.75s (×1.17) | 0.73s (×1.13) | 0.68s (×1.05) |
| eng_Latn → zho_Hans | 0.61s (×1.00) | 0.62s (×1.00) | 0.60s (×0.98) | 0.60s (×0.98) | 0.62s (×1.01) |
| eng_Latn → fra_Latn | 0.75s (×1.00) | 0.85s (×1.14) | 0.76s (×1.01) | 0.76s (×1.01) | 0.77s (×1.03) |
| eng_Latn → deu_Latn | 0.72s (×1.00) | 0.66s (×0.91) | 0.63s (×0.88) | 0.67s (×0.92) | 0.81s (×1.12) |

## 5. Empirical check: how many sentences differ from variant B

transformers.js 3.8.1's generate loop keeps only the top-1 token per step even when `num_beams` > 1 (source: `src/models.js`, "TODO: Support beam search" — the loop `break`s after the first candidate). This table counts the sentences whose text differs from B, proving the point on real runs rather than trusting the code reading.

| direction | C differs on | D differs on | E differs on |
|---|---|---|---|
| eng_Latn->hrv_Latn | 38 | 0 | 0 |
| eng_Latn->hin_Deva | 27 | 0 | 0 |
| eng_Latn->vie_Latn | 31 | 0 | 0 |
| kor_Hang->eng_Latn | 24 | 0 | 0 |
| tha_Thai->eng_Latn | 14 | 0 | 0 |
| rus_Cyrl->eng_Latn | 13 | 0 | 0 |
| eng_Latn->zho_Hans | 14 | 0 | 0 |
| eng_Latn->fra_Latn | 26 | 0 | 0 |
| eng_Latn->deu_Latn | 14 | 0 | 0 |

## 6. Verdict changes

No direction changes verdict under any variant.

## 7. Recommendation (per engine kind; defaults and routing unchanged)

**Single-pair engines (Opus-MT one pair per model): keep the current settings (A).**

- The token-limit hypothesis is refuted for them: the references fit the current limit on every panel direction (0–0.5% not fitting), and the generous limit B moved chrF++ by at most +0.10 (vie) without changing a single flag or verdict. Hindi — the worst direction — was bit-for-bit unchanged: its failure is dropped clauses (27 lenRatio flags) and loops, not a short budget.
- C (no_repeat_ngram_size 3) kills real loops (hin 7→4, vie 9→7, ru 1→0) but the chrF++ gain is +0.1–0.2 on directions that miss the bar by 8–23 points, while the passing French control pays −0.32 and Croatian −0.34 vs B. Nothing crosses a verdict line; a control-visible cost for no verdict movement is a bad trade at defaults.
- D/E cannot help by construction: transformers.js 3.8.1 keeps the top-1 token per step even with `num_beams` > 1 — 0 of 200 sentences differ from B on every panel direction, while paying a small topk/softmax overhead. Beam search is simply not implemented in the library version the app ships.
- Speed: no variant trips the 3× alarm anywhere (max ×1.18); B/C ran up to ~18% slower on some directions for no quality gain.

**Group engines (Opus-MT en-mul, currently quarantined): if one is ever re-enabled, give it the generous limit B — but B does not rescue it.**

- Croatian is the one direction where the prompt's token-limit idea was right: references need ~1.7× the source tokens in tokenizer units, 29% did not fit A's limit, and A truncated 11 sentences mid-word. B removed all 11 cuts and 31 of 34 dropped final marks, and chrF++ rose 39.31 → 39.86.
- But the gap only moved from −12.9 to −12.3 against a −5.0 fail line: the group model's Croatian is too far below the bar for decoding to matter. The quarantine stands; decoding settings cannot rescue it.
- The generous limit costs no speed (×0.94 on the panel) and is the right shape for any engine serving a language that needs more tokens per English word.

**Beam search and the calibration deficit:** published baselines are beam-search numbers, but this stack cannot reproduce that: in transformers.js 3.8.1 `num_beams > 1` does not branch (source: `src/models.js`, "TODO: Support beam search" — the loop `break`s after the first candidate; empirically 0/200 differences on all 9 directions). The ~1.4-point local-vs-published offset P2b measured therefore cannot be closed with beams today; revisit only if the library gains real beam search. The failing routes are model-quality failures (clause drops, wrong content), not decoding artifacts.

**Known interaction, noted for the record:** the app's punctuation restoration (P2b) is add-only, so a genuinely truncated word can come back as "ADT Corpor." — complete-looking to a reader. The benchmark now sees the model's raw text through the benchmark-only `rawOutput` flag (the app never sets it), so truncation flags stay honest; the app-side cosmetics are unchanged by P2c.

Cell provenance: 45 fresh. Variant A cells marked "stored P2/P2b" were proven byte-identical to fresh runs of the rebuilt worker on en→fr and en→hr (0/200 outputs differ).


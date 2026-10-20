# B3 — Browser: engine switch and batch (Private Translator @ http://localhost:3000)

Profile state at start: French-to-English setup offer showing (pair FR→EN, model NOT yet saved).

## Setup

| Command | Result |
|---|---|
| `agent-browser open http://localhost:3000` | ✅ "Your words belong to you" — http://localhost:3000/ |
| `agent-browser wait --load networkidle` | ✅ Done |
| `agent-browser wait 1500` | ✅ Done |

## Step 1 — Setup offer visible

Section `section[aria-label="Translation"]` text:

```
Translation
Setting up French to English. This downloads a small model once, about 108 MB.

After that, translating works with no connection, and nothing you type is ever sent anywhere.

Set up now
```

✅ Setup offer ("Set up now") is showing. Pair is French → English, model not yet saved.

## Step 2 — Initial setup (FR→EN)

Clicked "Set up now" via `agent-browser find text "Set up now" click` (✓).

Polled `section[aria-label="Translation"]` every 3 s. Stage texts seen, in order:

1. `Setting up French to English. This downloads a small model once, about 108 MB.` + `53 of 53 MB` + `9.0 MB/s · 0:06 so far` + `Reading it into memory`
2. `64 of 108 MB` + `5.9 MB/s · about 7 s left · 0:09 so far` + `Reading it into memory`
3. `84 of 108 MB` + `5.3 MB/s · about 5 s left · 0:12 so far` + `Reading it into memory`
4. `96 of 108 MB` + `5.2 MB/s · about 2 s left · 0:15 so far` + `Reading it into memory`
5. `Reading it into memory` + `Working for 0:00` + `This can take a minute while your device unpacks the model.`
6. `Ready. Works offline now.`
7. `The translation appears here.` ✅

**Total setup time: ~28.3 s** from click until "The translation appears here." (download ~108 MB at ~5–9 MB/s, then memory-read + ready stages).

Note: first poll caught "53 of 53 MB" — appears to be a cached-then-verified progress line ("of 53 MB" = already-stored model being counted?) before the 108 MB download numbers took over.

## Step 3 — First translation

Typed into the "Text to translate" textarea (ref @e281, via `agent-browser type`):

> Bonjour. Où est la pharmacie la plus proche ?

Poll (2 s) — done on first poll (~2.1 s after typing). Section text:

```
Translation

Translated in 0.7 s

Hello. Where's the nearest pharmacy?

No voice for this language on your device.
```

**Exact English translation: `Hello. Where's the nearest pharmacy?`** ✅ (reported translate time 0.7 s; TTS unavailable notice for this output language)

## Step 4 — SWITCH TEST 1 (EN→FR, both engines saved)

**Details before the switch** (`#engine-details`, panel already open — `expanded=true`):

- Engine: **Opus-MT French to English** ✅ (expected)
- Model: `Xenova/opus-mt-fr-en`
- Precision: `8 bit quantized, about 108 MB`
- Licence: `Apache-2.0 · Helsinki NLP`
- Device: `WebAssembly`
- Files: tokenizer.json / tokenizer_config.json / config.json / encoder_model_quantized.onnx / decoder_model_merged_quantized.onnx / generation_config.json — all `saved`
- Storage: `216 MB of 10456 MB`
- Stage times: `checking: 0.1 s`, `downloading: 18.9 s`, `into memory: 0.7 s`, `check: 0.4 s`
- App version: `0.2.1`
- Recent translations: `8 characters, waited 0.0 s, translated in 0.3 s` / `36 characters, waited 0.0 s, translated in 0.3 s` — `Median translating time: 0.3 s`

**"Reported memory" line: ABSENT in Details.** Investigated why: the row only renders when the worker reports heap stats (`performance.memory` inside the worker). Verified in-page that `performance.memory` **exists on the main thread** (`used 17297687, limit 2219835392`) but **does not exist inside Workers** in this Chromium build (blob-worker probe returned "no performance.memory in worker"). So `heap.used` stays `null` and the row stays hidden in this browser. Not an app bug — an environment limitation (worker `performance.memory` API unavailable).

### The swap itself (source picker → English, pair EN→FR)

Clicked the SOURCE picker (button "Choose the source language", showed French), searched "English" in the combobox, clicked the "English, English" row → pair swapped to **English → French** (choosing the language already set on the other side swaps the pair, as designed).

First attempt (plain 500 ms eval polling) was too slow to catch transient lines — the whole swap+translate finished in ≤3.6 s and the first poll already showed the result. Re-ran the swap with an in-page MutationObserver on the section (records every innerText change with timestamps), so every distinct line was captured. Lines seen during the switch, in order:

1. `Checking your device`
2. `Switching to the faster model for this pair.` ✅ (expected)
3. `Switching to the faster model for this pair.` + `5 of 5 MB` + `0:00 so far` + `Reading it into memory`
4. `Reading it into memory` + `Working for 0:00` + `This can take a minute while your device unpacks the model.` ✅
5. `Checking that translation works` + `Working for 0:00` + … ✅
6. back to the translated output (no re-translation needed — the EN→FR result for the current text was already in the translation cache).

**Engine switch duration: ~1.0 s** (Details later confirms `Last engine switch took 1.0 s`). Whole swap from click to settled ≈ 2.5–3.6 s.

**Badge after the switch: `Translated in 2.0 s`** — stale time from the earlier EN→FR burst (the swapped pair's output came from the translation cache, so no new burst ran; the badge kept the last measured value). Output shown: `Bonjour. Que fait-on pour la laurette?` — the EN→FR engine translating the still-present French input as if it were English (garbled; expected when the pair is swapped without changing the input text — app code re-uses cached per-sentence translations keyed by pair).

Side observation: swapping also re-shows cached translations instantly (per-pair sentence cache in `use-translator.ts`), before the engine switch even starts.

**Details after the switch (settled ~5 s):**

- Engine: **Opus-MT English to French** ✅ (expected)
- Model: `Xenova/opus-mt-en-fr`, Precision `8 bit quantized, about 108 MB`, Licence `Apache-2.0 · Helsinki NLP`, Device `WebAssembly`
- Files: tokenizer/tokenizer_config/config/generation_config — `loaded from saved files`; encoder/decoder `.onnx` — `saved` (EN→FR was already stored for this profile, which is why the swap was fast)
- Storage: `216 MB of 10456 MB`
- Stage times: `checking: 0.1 s`, `downloading: 0.2 s`, `into memory: 0.7 s`, `check: 0.1 s`
- **`Last engine switch took 1.0 s`** ✅ (exact text)
- "Reported memory": still absent (same worker `performance.memory` limitation as above)
- Recent translations now lists 5 entries, `Median translating time: 0.2 s`; "Run speed test" now enabled (source is English).

## Step 5 — SWITCH TEST 2 (EN→ES, new engine download)

Clicked the TARGET picker (button "Choose the target language", showed French/Français), searched "Spanish", clicked the "Spanish, Español" row → pair became **English → Spanish**. Click epoch 1791632880.7.

Polled every 2 s AND had the in-page MutationObserver running, so the full transient sequence was captured:

1. `Translating sentence 1 of 2` (held output, old text still shown)
2. `Checking your device`
3. `Switching to the faster model for this pair.` ✅ (the expected pre-switch line)
4. Download progress under that banner: `0 of 0 MB` → `2 of 2 MB` → `6 of 6 MB` → `6 of 63 MB` → `7 of 114 MB` → … → `112 of 114 MB` (speed climbing 2.9 → 11.4 MB/s, `0:11 so far`)
5. `Reading it into memory` + `Working for 0:00` + `This can take a minute while your device unpacks the model.` ✅
6. `Checking that translation works` + `Working for 0:00` ✅
7. `Translating sentence 1 of 2` → `Translating sentence 2 of 2` (held request runs the moment the engine is ready)
8. `Translated in 13.1 s` — final state

Notes:
- The `Setting up English to Spanish. This downloads a small model once, about 114 MB.` line did **not** appear — that text belongs to the fresh-setup path; because an engine (EN→FR) was already loaded, the switch path showed `Switching to the faster model for this pair.` instead. The "X of 114 MB" progress confirmed the ~114 MB new-engine download as expected.
- **Total switch time: ~13.4 s** from click to settled (download ~11 s for 114 MB at up to 11.4 MB/s, memory read ~0.4 s, check ~0.4 s, then held translation ran). The badge itself reads `Translated in 13.1 s` (burst time from first pending sentence to completion).
- The old output text was kept on screen while pending (no blanking flash) — matches the "keep showing the last known translation" design.

Output after the switch (auto-translated held request — the still-present French input translated as if English, garbled as expected):

```
Translated in 13.1 s

Bonjour. ¿Où est la farmacocie la plus proche?
```

### Translate "Good morning. How are you?"

Filled the textarea (`agent-browser fill @e281 "Good morning. How are you?"`). Done on first poll (~2.1 s). Section text:

```
Translation

Translated in 0.3 s

Buenos días. ¿Cómo estás?

No voice for this language on your device.
```

**Exact Spanish translation: `Buenos días. ¿Cómo estás?`** ✅ (0.3 s)

## Step 6 — Details after two switches

`#engine-details` after the EN→ES switch and the "Good morning" translation:

- Engine: **Opus-MT English to Spanish** ✅
- Model: `Xenova/opus-mt-en-es`, Precision `8 bit quantized, about 114 MB`, Licence `Apache-2.0 · Helsinki NLP`, Device `WebAssembly`
- Files: all six rows — `saved` (fresh download this visit)
- Storage: **`330 MB of 10570 MB`** (was `216 MB of 10456 MB` after step 4 — grew by ~114 MB for the new EN→ES engine, as expected)
- Stage times: `checking: 0.5 s`, `downloading: 11.4 s`, `into memory: 0.4 s`, `check: 0.1 s`
- **`Last engine switch took 12.4 s`** ✅ (exact text; matches the ~13 s observed in step 5 — the 12.4 s measures switch start → engine ready, excluding the held translation that ran afterwards)
- **"Reported memory" line: still ABSENT** — same as in step 4, no change. Root cause unchanged (worker `performance.memory` unavailable in this Chromium build, so the worker reports `used: null` and the row never renders). The comparison between step 4 and step 6 is therefore "absent vs absent".
- Recent translations: 10 entries; `Median translating time: 0.2 s`; App version `0.2.1`

## Step 7 — Batch mode

Clicked the "Batch" button in the page header (`agent-browser find text "Batch" click`). Dialog opened: heading "Batch", description `Translate a longer piece of text all at once. English to Spanish.`, textarea "Paste text here", buttons "Upload a plain text file" / "Translate" (disabled until text) / "Close".

Pasted the exact 16-sentence text via `agent-browser fill`. Clicked the dialog's "Translate" at epoch 1791633061.425. Polled the dialog text every 1 s (up to 40 s):

- **First poll (t+4.9 s) already showed the completed state** — the batch finished faster than one poll cycle (each `agent-browser eval` costs ~1.5–2 s of process time):
  ```
  Batch

  Translate a longer piece of text all at once. English to Spanish.

  16 of 16 sentences

  Translation ready.

  Buenos días. ¿Cómo estás? ¿Dónde está la estación? Me gustaría un café.. …
  Copy / Download / Start over / Close
  ```
- **Progress line format: `N of M sentences`** (observed final value `16 of 16 sentences`) followed by `Translation ready.`

**Final translated text — first 300 chars (exact):**

```
Buenos días. ¿Cómo estás? ¿Dónde está la estación? Me gustaría un café.. El tiempo es agradable.. Mi hermana está de visita. Olvidé mis llaves.. Hasta mañana.o. Muchas gracias. Buenas noches.. ¿Cuánto cuesta esto? ¿Puedes ayudarme? Estoy aprendiendo español. Esto es hermoso. Feliz cumpleaños. Cuídat
```

(Full result ends `… Feliz cumpleaños. Cuídate.`)

**Total batch time: ≤ ~4.9 s wall clock** (first 1 s poll caught it done; accounting for ~1.5–2 s poll latency, the run itself completed in roughly 2–3.5 s). Engine-side numbers from Details → Recent translations: the 14 uncached sentences ran as two grouped jobs — `150 characters, waited 0.0 s, translated in 0.6 s` (group of 8) and `98 characters, waited 0.0 s, translated in 0.4 s` (group of 6); the remaining 2 sentences ("Good morning." / "How are you?") were already in the per-sentence cache from step 5 (group size is 8 per `speed-config.ts`).

**Supplementary observer run** (to capture intermediate progress values the fast first run hid — same 16-sentence structure, uncached variant text, engine already ready, MutationObserver on the dialog):

| t | Dialog progress |
|---|---|
| 0 s | `0 of 16 sentences` + Cancel |
| +0.72 s | `8 of 16 sentences` (first group of 8 done) |
| +1.77 s | `16 of 16 sentences` + `Translation ready.` |

→ A fresh 16-sentence batch with a ready engine completes in **~1.8 s**, stepping 8 sentences at a time.

Clicked "Start over" (dialog reset to the input phase), then "Close" — dialog closed (verified `[role=dialog]` gone).

Quality observation (not an app bug, but worth flagging): the batch output has punctuation artifacts from the grouped inference — doubled periods (`un café..`, `agradable..`, `llaves..`, `noches..`), a triple in the supplementary run (`taxi...`), and stray fragments (`Hasta mañana.o.`, `Por supuesto.o.o.o.`). The app's join logic only inserts spaces (`joinSentences`), so these come from the opus-mt model's own output when given grouped inputs; per-sentence calls in the main view were clean (`Buenos días. ¿Cómo estás?`).

## Step 8 — Page errors

`agent-browser errors` → **empty (no page errors).** JSON confirms `{"errors":[]}`.

Console (`agent-browser console`) shows only benign dev-mode noise: "Download the React DevTools…" info lines, `[HMR] connected`, `[Fast Refresh] rebuilding/done`. No warnings, no errors across the whole session (setup, 3 translations, 2 engine switches, 2 batch runs).

Final state at session end: pair **English → Spanish**, engine ready, output pane still showing `Translated in 0.3 s — Buenos días. ¿Cómo estás?`.

## Summary

All 8 steps completed successfully. Private Translator @ localhost:3000, app version 0.2.1:

1. **Setup offer** confirmed for French→English (108 MB).
2. **Initial setup**: ~28.3 s end-to-end (download 108 MB at 5–9 MB/s → "Reading it into memory" → "Ready. Works offline now.").
3. **FR→EN translate**: "Bonjour. Où est la pharmacie la plus proche ?" → **"Hello. Where's the nearest pharmacy?"** (0.7 s).
4. **SWITCH TEST 1 (swap to EN→FR, both engines saved)**: source picker → English swaps the pair. Full transient captured via in-page MutationObserver: "Checking your device" → **"Switching to the faster model for this pair."** → "5 of 5 MB" → **"Reading it into memory"** → **"Checking that translation works"** → ready. Switch took **1.0 s** (Details: `Last engine switch took 1.0 s`; Engine `Opus-MT English to French`). Badge read `Translated in 2.0 s` (stale burst time — swapped-pair output came from the per-sentence cache). Plain 500 ms CLI polling was too slow to catch the transient (≤3.6 s total swap) — MutationObserver was needed.
5. **SWITCH TEST 2 (target → Spanish, new engine)**: "Switching to the faster model for this pair." banner over the **114 MB** download ("7 of 114 MB" → "112 of 114 MB", up to 11.4 MB/s), then memory/check stages, then the held request auto-translated. Total **~13.4 s** click-to-settled; Details says `Last engine switch took 12.4 s`. ("Setting up English to Spanish…" text belongs to the fresh-setup path and correctly did not appear during a switch.) "Good morning. How are you?" → **"Buenos días. ¿Cómo estás?"** (0.3 s).
6. **Details after two switches**: Engine `Opus-MT English to Spanish`; `Last engine switch took 12.4 s`; Storage grew 216 → **330 MB of 10570 MB** (+114 MB, as expected).
7. **Batch mode**: 16-sentence text → progress format **`N of M sentences`** ("0 of 16" → "8 of 16" → "16 of 16" in the observer run) then **"Translation ready."**; result begins **"Buenos días. ¿Cómo estás? ¿Dónde está la estación? Me gustaría un café.."** ; total ≤ ~4.9 s wall clock (engine-side: two grouped jobs of 8+6 uncached sentences at 0.6 s + 0.4 s; fresh uncached 16-sentence run measured ~1.8 s). "Start over" + Close worked.
8. **No page errors** the entire session.

### Findings / issues worth flagging

- **"Reported memory" row never renders in this browser** — the worker has no `performance.memory` (verified: main thread has it, Workers don't in this Chromium build), so the worker stats message reports `used: null` and Details hides the row. Environment limitation, not an app bug; but if this API is expected to exist in target browsers, the row will be absent there too (Chrome ≥64 exposes it; newer Chrome versions with the deprecation may not, and the app has no fallback such as `performance.measureUserAgentSpecificMemory`).
- **Batch grouped-inference punctuation artifacts**: doubled/tripled periods and stray fragments (`un café..`, `Hasta mañana.o.`, `Por supuesto.o.o.o.`) in batch output, while per-sentence output is clean. Model-level quirk of grouped calls (app join logic adds only spaces) — may be worth a post-processing trim or reporting upstream.
- **Badge staleness after pair swap**: after a cached-hit swap the badge keeps the previous burst's "Translated in X s" (e.g. `Translated in 2.0 s`) even though no new translation ran. Cosmetic.
- Minor UX notes: swap keeps the old input text, so the new pair immediately re-translates it as if it were the new source language (garbled output like "Bonjour. Que fait-on pour la laurette?" for French input under EN→FR). Matches current design (input is never modified), but can look odd.
- Setup progress briefly showed "53 of 53 MB" (a cached-file verification pass) before the "X of 108 MB" numbers — the progress line's total switches as per-file groups complete; slightly confusing but transient.

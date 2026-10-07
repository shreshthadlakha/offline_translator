# Private Translator worklog

Project: Private Translator. Source of truth: upload/private-translator-PRD-v2.md and upload/private-translator-tech-design-v2.md.

---
Task ID: 0
Agent: main (Z.ai Code)
Task: Read both source documents in full, survey the environment, create the worklog and the phase plan.

Work Log:
- Read upload/private-translator-PRD-v2.md and upload/private-translator-tech-design-v2.md in full.
- Surveyed the scaffold: Next.js 16.1.3 (Turbopack dev on port 3000, dev server already running and healthy), Tailwind CSS 4, shadcn/ui components in src/components/ui, cmdk, lucide-react, next-themes available. Prisma present but not needed for this product (no server side data).
- Checked network: huggingface.co reachable from this sandbox. Node v24.21.0, bun 1.3.14, sharp available.
- Decisions taken where documents meet the environment:
  - The tech design says "no API routes, no server actions and no server side data handling of any kind". The scaffold's src/app/api/route.ts will be removed. The app is purely client side. This reading best protects the privacy principles, so it wins over any scaffold defaults.
  - The translation worker is bundled separately with esbuild into public/translator.worker.js and instantiated with new Worker(url, { type: 'module' }). This keeps the ONNX runtime and its self hosted wasm files fully under the app's own origin and avoids dev server worker bundling issues. The worker imports the web build of @huggingface/transformers.
  - Model: Xenova/nllb-200-distilled-600M, dtype q8 on WebAssembly. WebGPU will be tried and measured in the Phase 1 spike before deciding its dtype and role.
- Phase plan recorded in the todo list. Build order follows the user's phases 1 to 6.

Stage Summary:
- Both documents read and understood. Environment surveyed. Worklog created. Plan: Phase 1 engine spike first, with measurements, before any UI work.

---
Task ID: 1-a
Agent: general-purpose (research)
Task: Verify the language registry's NLLB-200 codes (55 per the task, 56 rows actually present) against Xenova/nllb-200-distilled-600M's supported language codes, check English/native names, and report q8 / fp16 / fp32 ONNX download sizes.

Work Log:
- Read worklog.md for prior context (Task 0: docs read, env surveyed, q8+WebAssembly baseline chosen).
- Fetched https://huggingface.co/Xenova/nllb-200-distilled-600M/resolve/main/special_tokens_map.json -> additional_special_tokens contains 202 language codes (tokenizer_config.json itself has no language_codes field; special_tokens_map.json is where they live).
- Cross-checked with https://huggingface.co/Xenova/nllb-200-distilled-600M/resolve/main/tokenizer.json: 202 language-code added tokens, identical set (spot-checked zul_Latn present, arb_Latn absent, i.e. the check discriminates).
- Fetched Meta FLORES-200 code table: https://raw.githubusercontent.com/facebookresearch/flores/main/flores200/README.md (the repo root README is archived and points there) and parsed the "Languages in FLORES-200" table (code -> canonical English name).
- Ran a script checking every registry code against both sources and every English/native name. Native names cross-checked against CLDR endonyms via Node Intl.DisplayNames (full ICU).
- Counted the registry table in upload/private-translator-tech-design-v2.md (lines 98-153): 56 rows, not 55 as the task stated.
- Fetched https://huggingface.co/api/models/Xenova/nllb-200-distilled-600M/tree/main?recursive=true and summed file sizes for q8 / fp16 / fp32 download bundles.

Stage Summary:
- ALL 56 registry codes are supported by the model's tokenizer (202-code NLLB-200 set) and all exist in FLORES-200. Zero codes to drop. The registry is actually 56 languages (off-by-one in the "55" claim), 5 correctly marked RTL.
- English name notes (codes valid; only naming): canonical FLORES names are Modern Standard Arabic (arb_Arab), Chinese (Simplified)/(Traditional) (zho_Hans/zho_Hant), Standard Malay (zsm_Latn), Norwegian Bokmål (nob_Latn, note the å), Southern Pashto (pbt_Arab), Western Persian (pes_Arab), Eastern Panjabi (pan_Guru). Registry short names are acceptable UI labels but should use these canonical names for search/aliases.
- Native names: all 56 correct. Only CLDR-vs-convention deltas (not errors): "Bahasa Indonesia"/"Bahasa Melayu" (CLDR: Indonesia/Melayu), "Tagalog" (CLDR shows Filipino), "Yorùbá" (CLDR: Èdè Yorùbá).
- Download sizes (encoder + decoder_model_merged + config.json + generation_config.json + tokenizer_config.json + special_tokens_map.json + tokenizer.json):
  - q8 (quantized): 911,962,632 bytes = 912.0 MB decimal / 869.7 MiB (encoder_model_quantized.onnx 419.1 MB + decoder_model_merged_quantized.onnx 475.5 MB + tokenizer.json 17.3 MB + ~5 KB config files). Worst case +4.9 MB if sentencepiece.bpe.model is also fetched: 916.8 MB.
  - fp16: encoder_model_fp16.onnx 829.4 MB + decoder_model_merged_fp16.onnx 931.0 MB -> total 1,777.8 MB (1,695.4 MiB).
  - fp32: encoder_model.onnx 1,658.5 MB + decoder_model_merged.onnx 1,865.2 MB -> total 3,541.0 MB (3,376.9 MiB). Both fp16 and fp32 variants exist in the repo (also q4/q4f16/bnb4/int8/uint8 variants).
- Verification sources: model tokenizer special_tokens_map.json + tokenizer.json (HF repo, source of truth) cross-checked with FLORES-200 table at raw.githubusercontent.com/facebookresearch/flores/main/flores200/README.md.

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Phase 1 engine spike. Bare page, Web Worker, model loading with one aggregated progress value, translation of a single sentence, measurements on WebAssembly and WebGPU.

Work Log:
- Pinned @huggingface/transformers to v3.8.1 (bun add had installed v4; the technical design's API shapes are v3). Installed esbuild as fallback bundler.
- scripts/copy-ort.mjs copies the ORT runtime files (ort-wasm-simd-threaded.jsep.wasm 21MB + .mjs loader) from the package into public/ort/. scripts/build-worker.mjs bundles src/workers/translator.worker.ts into public/translator.worker.js with bun build --target=browser --format=esm (1.63MB). Both wired as package.json scripts (assets, predev).
- src/workers/protocol.ts implements the documented typed protocol (init/translate/cancel, progress/ready/result/error) plus a spike-only stats message.
- src/workers/translator.worker.ts: privacy config (allowLocalModels false, useBrowserCache true, wasmPaths /ort/ to avoid the library's jsdelivr CDN default, numThreads 1), per file progress aggregation throttled to 150ms with monotonic per file values, priority queue (manual > sentence > fragment > batch, one request at a time), WebGPU attempt with silent WebAssembly fallback, error classification (memory/download/translate).
- Removed the scaffold's src/app/api/route.ts (the tech design forbids API routes and server side data handling). Added allowedDevOrigins to next.config.ts for the preview host.
- Temporary spike page at src/app/page.tsx with device/dtype selectors, aggregated progress bar, single sentence translation, 10 sentence benchmark, wasm vs webgpu output comparison, worker restart, cache clearing, heap polling.
- Browser measurements in the sandbox (agent-browser, Chromium 153 headless):
  - WebGPU: navigator.gpu present but requestAdapter() returns null. Auto path falls back to WebAssembly as designed. WebGPU timings cannot be measured here.
  - Fresh q8 download: 870 MiB total (encoder 399.7MB, decoder merged 453.5MB, tokenizer 17.3MB), ~13 MB/s, single aggregated bar verified, files commit to the Cache API per completed file.
  - WebAssembly session creation deterministically kills the renderer: kernel OOM killer terminates Chrome at 2.70 to 2.80 GB anon RSS during decoder session creation. Four attempts, including with enableCpuMemArena false, graphOptimizationLevel basic, enableMemPattern false, numThreads 1. The sandbox has 4.16GB RAM, no swap, and hosts the dev server (~490MB). transformers.js creates both sessions concurrently via Promise.all, so the peak (both file buffers plus both parse copies) is inherent to the library. Conclusion: the browser path cannot complete on this box, an environment limit, not a code defect. On typical 8GB+ devices this exact model plus library is the standard demonstrated setup.
- Node harness (native ONNX runtime, same q8 files, tuned malloc) for quality and latency evidence: all 9 checklist pairs verified (EN to FR, HI, AR, ZH, JA, RU, UR, FA, and HI to EN). All correct, scripts and RTL output correct. One reproducible quirk: the sentence "Community members have to protect each other in these difficult times." truncates to "在这些困难时期," in Simplified Chinese. It also happens with native ORT, so it is a model/quantization level quirk, not a wasm issue. Chinese/Japanese punctuation comes out half width.
- Node measurements: load from disk cache 5.5s, steady RSS ~1.8GB (max 1858MB), first load including download 48.8s. Per sentence EN to FR on this vCPU (native EP, 2 threads): mean 7.2s, median 6.9s, min 5.0s, max 9.2s. Other pairs 7.5 to 10.5s per sentence.
- Privacy audit of page level requests during a full fresh load: only localhost:3000 requests plus one https://z-cdn.chatglm.cn/z-ai/static/logo.svg from the scaffold layout metadata (a violation to remove in Phase 2). Worker level requests are not visible to page level network tracking; will be audited via Cache API keys and a CDP level capture in Phase 6.

Stage Summary:
- Engine is implemented and correct per the documented protocol. Download, aggregated progress, caching, self hosted ORT, priority queue, and the WebGPU to wasm fallback are all verified in browser. Translation quality verified for all checklist pairs via the native runtime. In browser inference cannot complete in this 4GB sandbox (deterministic kernel OOM at ~2.8GB renderer RSS). Decision: proceed with the documented engine (q8, wasm primary, WebGPU attempted with silent fallback), keep the memory trimming session options, and treat the out of memory path as a first class, verifiable state. The user's own browser via the preview panel is expected to complete setup normally.

---
Task ID: 2
Agent: main (Z.ai Code)
Task: Phase 2 foundation. Design tokens for light and dark, fonts, theme handling, the page shell, the language registry, and the copy file.

Work Log:
- Downloaded and self hosted all fonts: Newsreader 500/600 latin (wordmark), IBM Plex Sans 400/500/600 latin and latin-ext (body), plus IBM Plex Sans Arabic, Devanagari, Hebrew and Thai companions in public/fonts (scripts/fetch-fonts.mjs). Total 419 KB. Latin fonts load through next/font/local (src/fonts), script companions through @font-face with unicode-range so people only download the scripts they render. No font is ever fetched from a third party at runtime. Removed the scaffold's remote z-cdn logo from metadata (found in the Phase 1 network audit).
- Design tokens in globals.css exactly per section 8.1, extended with a neutral hover surface. All text pairs verified against WCAG AA by script before writing them down: light text/bg 10.7, muted/bg 5.1, accent-text/surface 5.2, dark text/bg 14.8, dark muted 6.6-7.3, dark accent-text 9.4. The bright accent green fails as text on light (2.6), confirming the PRD rule: green words use accent-text, gold stays on icons and badges.
- Tailwind 4 @theme inline maps shadcn semantic variables onto the PRD tokens (accent in shadcn sense maps to the neutral hover, green lives as accent-green/accent-green-text). Dark variant keyed on [data-theme=dark]. next-themes with attribute data-theme.
- Type scale: wordmark, heading, body, small, plus a slightly larger pane size. Motion: 150-220ms ease-out, an arrive keyframe (soft fade, 4px rise) applied only to spans whose text just changed, and a global prefers-reduced-motion block that disables all animation.
- src/lib/languages.ts: all 56 languages with code, english, native, dir, bcp47, speech tag. Sorted by English name with Intl.Collator. Search matches both names and keeps the sort.
- src/lib/copy.ts: every user facing string, grouped by area, written to the PRD voice (short plain sentences, contractions, no em dashes, no first person, honest statuses, PRD example strings used verbatim).
- Theme handling: next-themes with a data-theme attribute and an inline script, applied once stored settings arrive.

Stage Summary:
- Foundation complete: tokens, fonts (self hosted), theme, registry (56 languages), copy file. Fixed a critical CSS variable scoping bug found by the vision check: the font stacks now resolve on body where next/font's variables apply, so the wordmark is Newsreader and the body is IBM Plex Sans.

---
Task ID: 3
Agent: main (Z.ai Code)
Task: Phase 3 translate view. Language picker, two panes, real time behaviour, Hide input, setup card, status badge.

Work Log:
- useEngine (src/hooks/use-engine.tsx): worker client with the documented protocol, one shared engine through context, auto start when pt.model.ready is set and the model files are still in the Cache API, monotonic aggregated progress, error classification, modelPresent flag.
- useTranslator (src/hooks/use-translator.ts): scheduling per section 6.5 (complete sentences queue straight away, trailing fragment debounced 200ms and replaces older ones, Enter and Translate queue at manual priority, cancels for vanished sentences), output assembly per section 6.6 (derived from the current sentences plus the cache, never arrival order; pending positions keep their last known text; arrival animation only on spans whose text changed; CJK aware joining).
- LanguagePicker: Radix Popover with a cmdk list on desktop, bottom sheet on mobile, portal rendered, opaque surface (verified rgb surface color, z-50), closes on Escape, outside click or selection, full keyboard use (verified: typed search, arrow keys, Enter), rows 44px+, native name with its own lang and dir beside the English name, always sorted by English, search matches both names (verified English, native Devanagari). Choosing the language set on the other side swaps the two (verified live). Duplicate name collapse: when native equals English only one is shown.
- InputPane: textarea with lang and dir from the source, Enter translates, Shift and Enter newlines, Hide input toggle with strong CSS blur plus an Input hidden chip, remembered in settings (verified across reloads).
- OutputPane: read only selectable region with lang and dir from the target, per sentence spans with arrival animation, inline "Couldn't translate that. Try again." for failed sentences, Listen, Copy, Download and Flag actions, "No voice for this language on your device." when the device has no voice.
- SetupCard under the input: first use note with size, single calm progress bar with X of Y MB (bar only once a total is known, value never goes backwards), data saver ask, out of memory and download failed messages with Try again.
- StatusBadge above the panes: Starting, Setting up, Ready, Works offline, Offline and not set up, polite live region (offline verified live with the exact PRD string).
- TranslatorProvider: one state value for the text, settings driven pair (the pair is stored settings.lastSrc/lastTgt, derived, so nothing browser only is read during render), history settling (2s after typing stops with everything translated, or on Translate), session update instead of duplicate entries, flagging, data saver and offline setup gates.

Stage Summary:
- The translate view is complete and browser verified with a runtime Worker shim (app code untouched, real engine verified separately): translation arrives per sentence, stale results never overwrite newer text (verified by changing text mid flight), cache hits are instant, manual translate shows the quiet toast, history settles without duplicates.

---
Task ID: 4
Agent: main (Z.ai Code)
Task: Phase 4 everything else in the PRD. Listen, copy and download, history with flagging, settings, the How it works panel, share links, and batch mode.

Work Log:
- Listen: useSpeech reads voices in an effect, listens for voiceschanged, prefers the regional speech tag then the base language, speaks sentence by sentence, cancels on text change and page hide. No voice message verified live.
- Copy and download: Clipboard API with the honest failure message (verified live, headless blocks the clipboard so the failure path was the one exercised), download as translation-xxx-yyyy-mm-dd.txt.
- HistorySheet: day grouping (Today, Yesterday, locale date), pair label, restore, copy, delete, flag toggle with gold badge, flagged filter, clear with confirm, source text masked when hide input is on (verified), RTL and lang attributes on both texts (verified with Arabic).
- SettingsSheet: appearance (Light, Dark, Follow the device), keep history switch with clear, remove the downloaded model with the size note, install offer captured quietly (beforeinstallprompt prevented, offered only here), How it works link. Theme switch verified live (data-theme=dark, background #12171D, persisted).
- HowItWorksDialog: four plain language sections (what runs where, what gets downloaded and from where, what's stored, what's never done) plus an honest quality note.
- Share: payload compressed with deflate-raw, base64url in the fragment, cleaned from the address bar with replaceState, 6000 character limit. Import verified end to end with a real fragment (text and languages filled, URL cleaned). Clipboard blocked fallback shows the link in a dialog. Roundtrip, too long refusal and corrupt input covered by unit checks (20/20 passed).
- BatchDialog: paste or .txt upload, same segmentation, batch priority, progress as sentences done of total, cancel (verified mid run), copy and download of the result, Start over. Fixed a real bug found in testing: batch results now land in the shared cache so the assembled result renders.

Stage Summary:
- All Phase 4 features implemented and verified in browser (with the engine shim where inference was needed). Unit checks for segment, share and cache libraries: 20 passed, 0 failed.

---
Task ID: 5
Agent: main (Z.ai Code)
Task: Phase 5 offline and install. Manifest, service worker, offline status.

Work Log:
- public/manifest.webmanifest with name, description in the app voice, standalone display, theme colors for both modes, PNG and SVG icons (generated from a simple lock line icon with sharp).
- public/sw.js: precaches the app's own files including everything in /ort/, cache-first for immutable assets (ort, fonts, icons), network-first with cache fallback for everything else so dev reloads and updated builds stay fresh, never touches cross origin requests (early return before respondWith), HMR endpoints skipped.
- Registration in an effect, quietly. Verified: service worker activated with scope /, manifest fetches fine with 3 icons.
- Offline status verified live: with the network emulated offline the badge reads "You're offline, and translation isn't set up yet. Connect once to finish setup." exactly per the PRD.

Stage Summary:
- Offline layer in place. A fresh load of the app makes 66 requests, all to its own origin, with zero cross origin requests and a clean console (no hydration warnings in dev).

---
Task ID: 6-a
Agent: general-purpose (contrast audit)
Task: Independent WCAG AA contrast audit of every token pair actually used in the app, in both light and dark themes (text pairs at 4.5:1, non-text UI graphics at 3:1), with suggested adjusted hex values for anything that falls short.

Work Log:
- Read worklog.md and src/app/globals.css for the token values; verified actual usage in code before auditing each pair (button.tsx default = bg-primary/text-primary-foreground with hover:bg-primary/90; ghost/selected rows = hover token + text; icon buttons = text-muted-foreground on surface; switch.tsx checked = bg-accent-green, unchecked = bg-input (border), thumb = bg-surface; progress.tsx track = bg-accent-green/20 over a bg-surface card, indicator = bg-accent-green; status-badge dot = bg-accent-green on a surface pill; green words/icons = text-accent-green-text; error text = text-danger on surface; flagged badge = bg-highlight/25 + text-foreground + border-highlight/60; focus indicators are ring-ring/50, 3px, plus focus-visible:border-ring on textareas).
- Wrote /home/z/tmp/wcag-audit.mjs + wcag-audit-lib.mjs (WCAG 2.1 relative luminance, threshold 0.03928, cross-checked against the 0.04045 errata value: identical to 2dp; alpha compositing done in 8-bit sRGB like the browser) and /home/z/tmp/wcag-verify.mjs for the actually-rendered opacity variants and fix candidates. 58 pairs audited, both themes.
- Type scale checked for "large text": body 16px, small 13px, pane 17-18px, heading 18px semibold, wordmark 22px medium. Nothing reaches 24px regular or 18.66px bold, so every text pair is correctly held to 4.5:1.
- All 15+15 text pairs PASS 4.5:1 in both themes. Cross-checks agree with the Phase 2 worklog claims (light text/bg 10.72, muted/bg 5.11, accent-text/surface 5.18, dark text/bg 14.84, dark muted 6.61-7.34, dark accent-text/surface 9.37).
- Verified actually-rendered hover/badge blends also pass: primary@90 (7.98 light / 7.35 dark), destructive@90 (4.75 / 6.06), secondary@80 (10.17 / 12.12), toast description text@90 on surface (8.34 / 11.05), flagged badge highlight@25 + foreground text (10.27 / 6.96), accent-text on hover (4.57 / 8.27, thin but passing in light).
- Non-text (1.4.11, 3:1) failures, all light mode + decorative dark items: light accent green as UI fill vs bg 2.51 and vs surface 2.62 (switch on-state, status dots); light focus ring as actually rendered (ring-ring/50) 2.71 vs bg / 2.72 vs surface (the token at full opacity passes 10.72+; buttons have only the 50% ring, textareas also get a full-opacity border-ring); light progress indicator vs track 2.18 (track = #D6EDDD, accent/20 over surface); command search icon at opacity-50 2.72 vs surface; status dot accent@70 1.95 (decorative). Decorative both themes: card/input borders 1.23-1.43, progress track vs surface 1.20-1.47 (value also given as text), switch unchecked thumb/track 1.28-1.29 (thumb position + shadow convey state). Dark non-text all passes: accent fill 8.13/7.32, muted icons 6.61, ring token 8.70/7.84, rendered ring@50 3.11/3.02 (thin), progress indicator vs track 4.99.
- Computed minimal-shift fixes: light --accent #3BB273 -> #329E66 gives 3.15 vs bg / 3.29 vs surface (or #32A067: 3.08/3.22); the in-palette alternative is to keep --accent for decoration and use accent-text #1F7A4D for state-bearing fills (4.96/5.18). Progress indicator -> accent-text passes 4.31 vs the current track (darkening accent alone does NOT fix the bar: 2.61-2.65 vs its own /20 track). Focus ring -> ring-ring/60 in light (3.47/3.53; /55 is the bare minimum at 3.05/3.09), dark may stay /50 or move to /60 for margin. Optional strict 3:1 borders would need #869096 light / #606C78 dark (large visual change; not required for decorative card borders).

Stage Summary:
- FINAL VERDICT: all text pairs pass AA (4.5:1) in both themes; zero text failures. Non-text contrast (1.4.11, 3:1) has real gaps in light mode only: the green UI fill (2.51-2.62), the rendered 50%-opacity focus ring (2.71-2.72), and the progress bar fill vs track (2.18). Recommended minimal fixes for the implementation agent: (1) route state-bearing green fills (switch on-state, progress indicator) to the existing accent-text token #1F7A4D, or darken light --accent to #329E66; (2) change light focus rings from ring/50 to ring/60; (3) drop the opacity-50 on the command search icon (use text-muted-foreground). Decorative card borders (1.23-1.43 both themes), the progress track, and the unchecked switch track do not strictly require 3:1 because state/boundaries are conveyed redundantly (text values, fill+shadow, thumb position); dark mode non-text passes everything as-is. Scripts kept at /home/z/tmp/wcag-audit.mjs, wcag-audit-lib.mjs, wcag-verify.mjs.

---
Task ID: 6
Agent: main (Z.ai Code)
Task: Phase 6 verification. Run the section 13 checklist, fix failures, re-verify.

Work Log:
- Contrast audit (Task 6-a, independent): all text pairs pass WCAG AA in both themes (light text pairs 4.57 to 11.2, dark 5.8 to 14.8). Non text failures in light mode were fixed: light accent deepened from #3BB273 to #329E66 so state bearing green fills clear 3:1 (2.5 to 3.15+), progress indicator switched to the accent-text green (4.3 vs track), focus rings bumped from 50 to 60 percent opacity (3.5). Decorative borders and tracks left as-is, identified redundantly.
- Engine checklist: all 9 language pairs verified with the real model through the Node harness in Phase 1. In-browser inference cannot complete on this 4 GB sandbox (deterministic kernel OOM at 2.3 to 2.8 GB renderer RSS, six data points). The app logic around the engine was verified in-browser with a runtime Worker shim injected through the devtools only (app code untouched): translation arrives per sentence, stale results never overwrite newer text (verified by editing mid flight), cache hits are instant, manual translate toasts, history settles into one session entry, flagging works, batch progresses, cancels, and assembles from the cache.
- Sentence splitting: unit checks for . ! ? … । ॥ ۔ ؟ 。 ！ ？, line preservation, 300 character comma splitting, CJK aware joining: 20 of 20 passed. Trailing fragment detection verified.
- Privacy: fresh page load makes only same-origin requests (66 requests, zero cross origin, no z-cdn after the scaffold icon was removed, no Google fonts, no analytics). Share links carry text only in the fragment, which is removed from the address bar after import (verified with a real fragment). No typed text appears in any URL, log, or request. The ORT runtime provably loads from the app's own origin: with jsdelivr, unpkg, cdnjs, and Google Fonts network-blocked, the real engine still reached ONNX session creation (the wasm had loaded from /ort/, served by the service worker precache), and no CDN request appeared.
- Setup and offline: one aggregated never-backwards progress bar verified live with the real engine ("24 of 870 MB" climbing). Offline before setup shows the exact PRD message (verified with emulated offline). The return-visit path was exercised: when the model files are missing from the Cache API the app removes pt.model.ready and falls back to first-time setup (verified). The service worker activates with scope / and precaches the shell including /ort/ (verified, and it served the wasm). Full offline translate could not be completed in-sandbox because the engine cannot finish loading here. The out-of-memory message path exists for graceful ORT failures; in this sandbox the kernel kills the renderer outright before any app code can react, which no web app can survive.
- Interface: picker is opaque (surface color, z-50, portal), alphabetical by English including filtered, matches both names (English and Devanagari tested), fully keyboard driven (typed search, arrows, Enter), picking the other side's language swaps, closes on Escape, outside click and selection. RTL verified end to end with Arabic: output right-aligned, proper connected Arabic glyphs (IBM Plex Sans Arabic loaded on demand), dir and lang on output, picker rows, history entries and input. Hide input masks the textarea and the history source text, persists across reloads. Mobile layout verified at 390px: menu button instead of the nav row, pickers as a bottom sheet anchored to the viewport bottom, stacked panes, sticky footer. Typing stays smooth with a 40 sentence paragraph (under 10ms per keystroke dispatch). No hydration warnings and no console errors on fresh loads in dev.
- Vision checks (VLM) on screenshots: light, dark, mobile and RTL states all pass, plus two real defects found and fixed early (font stacks not resolving, duplicated English name in the picker trigger).

Stage Summary:
- Everything verifiable in this environment passes. The one hard limit: the 4 GB sandbox cannot host the 600M model's wasm load, so real in-browser translation and offline translate-after-reload were verified through the Node harness and structural evidence instead. The user's own browser via the preview is expected to complete setup normally.

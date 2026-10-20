# Private Translator: Technical Design Document (v2)

*Companion to the PRD (v2). This covers how the product is built. Written as if starting fresh, it replaces the earlier version.*

---

## 1. Architecture overview

- A client side web app. Everything interactive runs in the browser. There are no API routes, no server actions and no server side data handling of any kind. Whatever serves the app only serves its own files.
- Translation runs on the device through **Transformers.js**, inside a dedicated **Web Worker**, so inference never blocks typing.
- One multilingual model covers every language pair: `Xenova/nllb-200-distilled-600M` (Meta's NLLB-200, distilled, already converted to ONNX). This replaces the idea of one bilingual model per pair, which would not scale to dozens of languages.
- Model files download once from the Hugging Face Hub and are kept by the browser's Cache API, so the app works offline afterwards.
- Person data (history, settings) lives in `localStorage` only.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) with TypeScript | Interactive parts are client components. |
| Styling | Tailwind CSS with design tokens as CSS variables | Tokens defined in section 8. |
| Components | shadcn/ui (Radix) primitives for behaviour and accessibility | Fully restyled with the tokens. Do not leave the default look. |
| Language search | `cmdk` inside the picker | Handles filtering and keyboard navigation. |
| Icons | `lucide-react` | Line icons only, from the allowed set in the PRD. |
| Inference | `@huggingface/transformers` in a Web Worker | |
| Theme | `next-themes` or an equivalent inline script | Avoids a flash of the wrong theme. |
| Fonts | `next/font`, self hosted at build time | No font requests to third parties at runtime. |
| State | React hooks and context | No state library needed. |

## 3. Privacy rules for the code

These are requirements, not preferences.

- **Allowed requests:** the app's own files, and the model files from the Hugging Face Hub, once.
- **Not allowed:** analytics, error reporting services, remote fonts or icon sets, third party scripts, tracking pixels, remote images.
- **Runtime files for the ONNX engine must be self hosted.** By default the library may fetch its WebAssembly files from a public CDN. Copy them from the package into `public/ort/` with a script that runs on install and before build, and set `env.backends.onnx.wasm.wasmPaths` to `/ort/`. Confirm in the network panel that no CDN is contacted.
- Configure the library with `env.allowLocalModels = false` and `env.useBrowserCache = true`.
- The model host can see that a download happened (an address and a browser identifier) but never anything the person typed. The "How it works" panel says so plainly.
- No typed text is ever logged, placed in a query string, or sent anywhere. Share links carry text only in the URL fragment (section 9).

## 4. Project structure

```
src/
├── app/
│   ├── layout.tsx              fonts, theme, metadata
│   ├── page.tsx                translate view
│   └── globals.css             design tokens
├── components/
│   ├── translate/              TranslatorPanes, InputPane, OutputPane, LanguagePicker,
│   │                           SwapButton, HideToggle, TranslateButton, ListenButton,
│   │                           SetupCard, StatusBadge
│   ├── history/                HistorySheet, HistoryItem
│   ├── batch/                  BatchDialog
│   ├── share/                  ShareButton
│   ├── settings/               SettingsSheet
│   ├── about/                  HowItWorks
│   └── ui/                     restyled primitives
├── hooks/
│   ├── useTranslator.ts        worker client, scheduling, output assembly
│   ├── useHistory.ts
│   ├── useSettings.ts
│   ├── useOnlineStatus.ts
│   └── useSpeech.ts
├── lib/
│   ├── languages.ts            language registry
│   ├── segment.ts              sentence splitting
│   ├── cache.ts                translation cache
│   ├── storage.ts              safe localStorage wrappers
│   ├── share.ts                encode and decode share fragments
│   └── copy.ts                 every user facing string
└── workers/
    └── translator.worker.ts
public/
├── ort/                        self hosted engine runtime files
├── manifest.webmanifest
└── sw.js
```

## 5. Language registry

One typed list drives the picker, the engine and the speech and layout settings. Nothing else in the code should hard code a language.

```ts
type Language = {
  code: string;      // model code, e.g. 'fra_Latn'
  english: string;   // 'French'
  native: string;    // 'Français'
  dir: 'ltr' | 'rtl';
  bcp47: string;     // for the lang attribute, Intl.Segmenter and speech, e.g. 'fr'
  speech?: string;   // preferred speech language tag, e.g. 'fr-FR'
};
```

Starting list. The codes are the expected values for this model. Verify each against the model's tokenizer and supported language list, which is the source of truth, and drop or flag any that aren't supported.

| English | Native | Code |
|---|---|---|
| Afrikaans | Afrikaans | `afr_Latn` |
| Amharic | አማርኛ | `amh_Ethi` |
| Arabic (RTL) | العربية | `arb_Arab` |
| Assamese | অসমীয়া | `asm_Beng` |
| Bengali | বাংলা | `ben_Beng` |
| Bulgarian | Български | `bul_Cyrl` |
| Catalan | Català | `cat_Latn` |
| Chinese, Simplified | 简体中文 | `zho_Hans` |
| Chinese, Traditional | 繁體中文 | `zho_Hant` |
| Croatian | Hrvatski | `hrv_Latn` |
| Czech | Čeština | `ces_Latn` |
| Danish | Dansk | `dan_Latn` |
| Dutch | Nederlands | `nld_Latn` |
| English | English | `eng_Latn` |
| Finnish | Suomi | `fin_Latn` |
| French | Français | `fra_Latn` |
| German | Deutsch | `deu_Latn` |
| Greek | Ελληνικά | `ell_Grek` |
| Gujarati | ગુજરાતી | `guj_Gujr` |
| Hausa | Hausa | `hau_Latn` |
| Hebrew (RTL) | עברית | `heb_Hebr` |
| Hindi | हिन्दी | `hin_Deva` |
| Hungarian | Magyar | `hun_Latn` |
| Indonesian | Bahasa Indonesia | `ind_Latn` |
| Italian | Italiano | `ita_Latn` |
| Japanese | 日本語 | `jpn_Jpan` |
| Kannada | ಕನ್ನಡ | `kan_Knda` |
| Korean | 한국어 | `kor_Hang` |
| Malay | Bahasa Melayu | `zsm_Latn` |
| Malayalam | മലയാളം | `mal_Mlym` |
| Marathi | मराठी | `mar_Deva` |
| Nepali | नेपाली | `npi_Deva` |
| Norwegian Bokmål | Norsk bokmål | `nob_Latn` |
| Odia | ଓଡ଼ିଆ | `ory_Orya` |
| Pashto (RTL) | پښتو | `pbt_Arab` |
| Persian (RTL) | فارسی | `pes_Arab` |
| Polish | Polski | `pol_Latn` |
| Portuguese | Português | `por_Latn` |
| Punjabi | ਪੰਜਾਬੀ | `pan_Guru` |
| Romanian | Română | `ron_Latn` |
| Russian | Русский | `rus_Cyrl` |
| Serbian | Српски | `srp_Cyrl` |
| Sinhala | සිංහල | `sin_Sinh` |
| Spanish | Español | `spa_Latn` |
| Swahili | Kiswahili | `swh_Latn` |
| Swedish | Svenska | `swe_Latn` |
| Tagalog | Tagalog | `tgl_Latn` |
| Tamil | தமிழ் | `tam_Taml` |
| Telugu | తెలుగు | `tel_Telu` |
| Thai | ไทย | `tha_Thai` |
| Turkish | Türkçe | `tur_Latn` |
| Ukrainian | Українська | `ukr_Cyrl` |
| Urdu (RTL) | اردو | `urd_Arab` |
| Vietnamese | Tiếng Việt | `vie_Latn` |
| Yoruba | Yorùbá | `yor_Latn` |
| Zulu | isiZulu | `zul_Latn` |

The picker sorts by `english`, always, using a locale aware comparison.

## 6. Translation engine

### 6.1 Worker and messages

The model is loaded and run only inside `translator.worker.ts`. The main thread talks to it with a small typed protocol.

```ts
// main to worker
{ type: 'init' }
{ type: 'translate', id: string, text: string, src: string, tgt: string, priority: 'manual' | 'sentence' | 'fragment' | 'batch' }
{ type: 'cancel', id: string }

// worker to main
{ type: 'progress', loaded: number, total: number }
{ type: 'ready', device: 'webgpu' | 'wasm' }
{ type: 'result', id: string, text: string }
{ type: 'error', id?: string, code: 'memory' | 'download' | 'translate', message: string }
```

Pipeline creation: `pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype, device, progress_callback })`. Calls pass `{ src_lang, tgt_lang, max_new_tokens }`.

### 6.2 Device and precision

Try WebGPU when `navigator.gpu` is present and an adapter is available. Otherwise use WebAssembly with the quantized (q8) weights. If WebGPU fails to start, or its output differs noticeably from the WebAssembly output on the same sentences, fall back to WebAssembly automatically and don't surface an error. WebAssembly runs on one thread unless the page is cross origin isolated. Accept that for now, and treat WebGPU as the main route to speed.

### 6.3 Sentence splitting

- Split on line breaks first, then split each line into sentences with `Intl.Segmenter(bcp47, { granularity: 'sentence' })`. This handles Hindi, Arabic, Urdu, Chinese, Japanese and others properly.
- If `Intl.Segmenter` is missing, fall back to a regular expression that covers common terminators: `. ! ? … । ॥ ۔ ؟ 。 ！ ？`.
- Keep line breaks, so the output has the same paragraph shape as the input.
- A sentence longer than about 300 characters is split further at commas or semicolons, so it isn't cut off by the model's length limit.

### 6.4 Cache

An in memory map keyed by `src|tgt|sentence`, with a cap of around 2,000 entries and least recently used eviction. A sentence is never translated twice for the same language pair.

### 6.5 Scheduling

1. On every change to the input, split it into sentences.
2. Every sentence except the last one still being typed is treated as complete. Any complete sentence not in the cache is queued at `sentence` priority straight away.
3. The trailing fragment is debounced by about 200 milliseconds (anywhere from 150 to 250 is fine), then queued at `fragment` priority. A newer fragment request replaces any older one still waiting.
4. Enter or the Translate button queues everything not yet translated, including the fragment, at `manual` priority and cancels the pending debounce.
5. The worker handles one request at a time, in priority order: manual, sentence, fragment, batch.

### 6.6 Output assembly

The output is not built from the order results arrive in. It is derived: take the current list of sentences, look each one up in the cache, and join the results with the original line breaks. Because of this, a slow or late result can never overwrite a newer one, and stale text can't appear.

While a sentence is still pending, keep showing the last known translation for that position instead of blanking it, so the output doesn't flash. Apply the arrival animation only to sentences whose translation has just landed. Reserve space so the layout doesn't jump.

### 6.7 Errors

A failed sentence shows a small inline message ("Couldn't translate that. Try again.") and doesn't block the rest. An out of memory failure during setup shows the dedicated message from the PRD.

## 7. Setup and progress

States: `idle`, `downloading`, `initializing`, `ready`, `error`.

- Setup starts the first time the person types or presses Translate. If the browser reports data saver mode, ask first instead of starting on its own.
- The library reports progress per file, often several at once. Keep a map of file to loaded and total bytes inside the worker, add them up, and post a combined update at most about every 150 milliseconds.
- Never let the displayed value go backwards. Show the bar only once a total is known. Show "X of Y MB" beside it.
- After the first successful setup, set `pt.model.ready` in `localStorage`. On later visits, check that the model files still exist in the Cache API before starting the engine on its own. If they were cleared, treat it as a first time setup again.
- Starting the engine from cache is quick but not instant. Show a quiet "Starting" state in the status badge, not a progress bar.

## 8. UI implementation

### 8.1 Design tokens

```css
:root {
  --bg: #F8F7F2;  --surface: #FDFCF8;  --border: #E3E0D6;
  --text: #243B53;  --text-muted: #5B6B7B;
  --primary: #243B53;  --on-primary: #F8F7F2;
  --accent: #3BB273;  --accent-text: #1F7A4D;
  --highlight: #FFD166;  --danger: #A94438;
  --radius-card: 12px;  --radius-control: 8px;
  --shadow-card: 0 1px 2px rgba(36, 59, 83, 0.06);
}
[data-theme="dark"] {
  --bg: #12171D;  --surface: #1A212A;  --border: #2A3440;
  --text: #ECE9E1;  --text-muted: #9AA7B4;
  --primary: #9DB7D3;  --on-primary: #12171D;
  --accent: #4CC38A;  --accent-text: #6FD9A4;
  --highlight: #FFD166;  --danger: #E58A7E;
}
```

Dark values are starting points. Check every text and background pair for WCAG AA and adjust. Spacing uses a 4px scale. Type has four sizes: wordmark, heading, body, small. The panes use body at a slightly larger responsive size for comfortable reading.

### 8.2 Fonts

Load with `next/font` so files are served from the app's own origin. Use a humanist serif for the wordmark only, for example Newsreader or Source Serif. Use a clean sans for everything else, for example IBM Plex Sans along with its Arabic, Devanagari, Hebrew and Thai companions. For the remaining scripts, including Bengali, Tamil, Telugu, Ethiopic and the CJK scripts, build a fallback stack that prefers installed system fonts and Noto families. Shipping every script's font would be far too heavy. Check actual rendering on Windows, macOS, Android and iOS for every language in the registry, and self host an extra script font only where system rendering is poor.

Set `lang` and `dir` on every element showing text in a given language, including each native name in the picker and history. This is what makes browsers choose the right font and shaping, for example for Chinese against Japanese.

### 8.3 Language picker

- Desktop: a Radix popover with a `cmdk` list. Mobile: a bottom sheet.
- Rendered in a portal, with an opaque surface and a z-index above everything else. Nothing underneath may show through. Closes on Escape, outside click or selection.
- Each row shows the native name and the English name. Sorted by English name always, including filtered results. Search matches both names.
- Choosing the language already set on the other side swaps the two.
- Full keyboard support. Rows at least 44px tall.

### 8.4 Panes

- Input: a textarea with `lang` and `dir` from the source language. Enter translates. Shift and Enter inserts a line break.
- Output: a read only region with `lang` and `dir` from the target language, `white-space: pre-wrap`, and selectable text.
- Equal height on desktop with internal scrolling. Natural height on mobile up to a sensible maximum.
- The page keeps the text in a single state value. Memoize the output pane and everything outside the panes so a keystroke doesn't re-render the whole page.

### 8.5 Hide input

A data attribute on the input pane applies a strong CSS blur to the textarea's text, enough that it can't be read at a glance, while focus, the caret and typing keep working. A small "Input hidden" chip appears in the pane so the state is obvious. The same masking applies to source text in history. The preference is stored in settings.

### 8.6 Status badge

One small badge in one place. States: Starting, Setting up (with the single progress bar), Ready, Works offline, Offline and not set up. Copy comes from `copy.ts`.

### 8.7 Motion

CSS transitions of about 150 to 220 milliseconds with an ease out curve. Newly arrived text fades in with a rise of a few pixels. Wrap all of it so `prefers-reduced-motion` turns it off.

## 9. Feature notes

**Listen.** Use `speechSynthesis`. Read the voice list in an effect, and listen for `voiceschanged`, because voices often load late. Pick a voice matching the target language's speech tag. If none exists, disable the control with the message from the PRD. Speak sentence by sentence rather than as one long utterance, since some browsers cut long ones off. Cancel speech when the text changes or the person navigates away.

**Copy and download.** Use the Clipboard API for copy. Download a `.txt` named like `translation-fra-2026-10-07.txt`.

**History.** Save an entry once a translation has settled, meaning about two seconds without typing and every sentence translated, or when the person presses Translate. If new text extends or replaces the entry from the same input session, update that entry instead of adding a near duplicate. Clear, or a change of language pair, starts a new session. Cap at 200 entries and trim the oldest. Wrap every write in try/catch in case storage is full or blocked. Honour the "keep history" setting.

**Share.** Build a payload `{ s: text, src, tgt }` as JSON, compress it with `CompressionStream('deflate-raw')` if available, encode as base64url, and place it in the fragment, for example `#s=v1.<payload>`. The fragment is never sent to a server. On load, read it, fill in the text and languages, then remove it from the address bar with `history.replaceState`. If the resulting link would be longer than about 6,000 characters, refuse and show the "too long" message.

**Batch.** A dialog accepting pasted text or a `.txt` file. Split with the same segmentation, queue at `batch` priority so live typing is never starved, show progress as sentences completed out of total, allow cancelling, and offer copy and download of the result.

**Offline and install.** `useOnlineStatus` reads `navigator.onLine` and listens for the online and offline events, but only inside an effect. A small service worker precaches the app's own files, including everything in `/ort/`, and must not touch requests to other origins. The model files are kept by the library in the Cache API. Provide a web app manifest. Offer install from settings, quietly, with no pop ups.

**Settings.** Theme, keep history, clear history, remove downloaded model (delete the library's cache with `caches.delete`, then reset `pt.model.ready`), link to How it works.

**How it works.** Static content, written in the voice from the PRD, covering what runs where, what is downloaded from where, what is stored locally, and what is never done.

## 10. Data model

```ts
// localStorage key: pt.history.v1
type HistoryEntry = {
  id: string;
  src: string; tgt: string;       // registry codes
  sourceText: string; targetText: string;
  createdAt: number;
  flagged: boolean;
};

// localStorage key: pt.settings.v1
type Settings = {
  theme: 'system' | 'light' | 'dark';
  hideInput: boolean;
  keepHistory: boolean;
  lastSrc: string; lastTgt: string;
};

// localStorage key: pt.model.ready  ->  '1'
```

All storage access goes through `storage.ts`, which catches errors and falls back gracefully when storage is unavailable.

## 11. Accessibility implementation

- Icon only buttons get an `aria-label` from `copy.ts`.
- The status badge uses a polite live region. The output text itself is not announced on every update.
- Visible focus rings on every interactive element.
- Escape closes any open layer and returns focus to what opened it.
- Contrast checks on every token pair, both themes.
- Right to left layout verified in the input, output, picker and history.

## 12. Copy management

Every user facing string lives in `lib/copy.ts`, grouped by area. No string is written inline in a component. This makes the voice rules from the PRD easy to review in one pass.

## 13. Verification checklist

**Engine**
- Translate a sample sentence for English to French, Hindi, Arabic, Simplified Chinese, Japanese, Russian, Urdu and Persian, and back from Hindi to English.
- Type quickly, then change the text. The final output must match the final input, with no stale text.
- Paste a long paragraph. Typing must stay smooth while it translates.
- Sentences ending in `।`, `۔`, `؟` and `。` are split correctly.

**Privacy**
- In the network panel during normal use, the only cross origin requests are model file downloads. No CDN for the runtime files, no remote fonts, no analytics.
- Typed text never appears in any request, URL or log.

**Setup and offline**
- Setup shows one smooth, never backwards progress bar with no flicker.
- After setup, turn the network off, reload, and translate.
- Offline before setup shows the correct message.
- Out of memory during setup shows the dedicated message.

**Interface**
- The picker is fully opaque, sits above everything, is alphabetical by English name (also when filtered), searches both names, and works by keyboard.
- Right to left languages display correctly end to end.
- Every language in the registry renders legibly in the picker and the output on at least two platforms.
- Hide input masks the input and the history source text.
- Light and dark modes both pass contrast checks.
- Reduced motion turns off animation.
- No hydration warnings, in development and in a production build.

## 14. Risks and constraints

| Risk | Handling |
|---|---|
| The model is large and needs a lot of memory, which may fail on phones and older devices | Show the size up front, handle the failure with a clear message, and measure early in a spike (section 15) |
| Quality varies by language and is weaker for less widely used ones | Be honest about it in the PRD and the How it works panel |
| Translation is slow on weak hardware | Sentence ahead translation, a worker thread, WebGPU where it works, and honest status states |
| Voices for Listen depend on the device | Detect and disable with a clear message |
| `Intl.Segmenter` missing in older browsers | Regular expression fallback |
| localStorage may be unavailable or full | Safe wrappers and graceful fallback |
| Single threaded WebAssembly by default | Accept for now, rely on WebGPU where available |

## 15. Questions to settle first

Before building the interface, run a small spike with a bare page and the worker. Measure on a mid range laptop and a phone: download size, time to load from cache, memory used, and time per sentence on both WebAssembly and WebGPU. Confirm WebGPU output matches WebAssembly output for this model. If the model can't run acceptably on typical devices, stop and decide on a fallback before going further. One option is smaller bilingual models for the most used pairs.

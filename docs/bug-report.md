# Private Translator — P15 bug scan report

Scan of everything we wrote: `src/`, `scripts/`, the worker/service-worker build
generators, config files, `.github/`, and the docs. Generated files, downloaded
models and third-party code (vendored `src/components/ui/*`, `node_modules`)
were skipped except to check how our code uses them. This task changed no app
code — findings only.

**Method.** Seven read-only passes plus fresh-copy and browser verification:
strict `tsc --noEmit` and `eslint .` (both clean); `npm audit`; `ts-prune`,
`madge --circular`, `depcheck`, and an extra `eslint` pass with `jsx-a11y` +
`react-hooks/exhaustive-deps` (scratch install in `/tmp`, project manifests
untouched); targeted grep batteries (network call sites, XSS sinks, unsafe
types, leftovers, cleanup sites); hand-reads of the worker/engines/protocol,
the state/lib layer, the UI components, the build/deploy/SW scripts, and the
data/docs; live browser tests over the dev server (unusual input, cancel,
reload-mid-download, switching, offline/blocked-storage overrides, hostile
share fragments, mobile/dark) including live verification of the top
code-read candidates; and a fresh-copy `git archive` → `npm ci` → drift →
lint → typecheck → `npm run build` (all green, first visit 308,639 B over 11
requests, matching the README claims).

**Verified** = reproduced in the browser, proven by tool output, or traced
line-by-line through the code with a concrete trigger (re-checked by the
coordinating agent for every HIGH/MEDIUM). **Suspected** = plausible, not
fully proven. No suspicion is marked verified.

## Counts

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 2 |
| Medium | 23 |
| Low | 34 |
| **Total** | **59** |

**The privacy red line holds.** Every network path in the shipped code was
enumerated: the only fetches are pinned model/runtime downloads (GET, no
request bodies) from the three worker engines, same-origin shell assets in the
service worker, and Transformers.js model fetches. The share link puts text
only into a same-origin URL **fragment**, written to the clipboard by an
explicit user action; hostile fragments were live-tested and degrade safely.
No `sendBeacon`/`XMLHttpRequest`/`WebSocket`/`EventSource` in `src/`, no src
import of `z-ai-web-dev-sdk` or `next-auth`, and netlog strips query strings
and records sizes only. Nothing typed or translated can leave the device.

## High

| ID | Area | File:line | What is wrong | How known | Suggested fix | Effort | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-1 | Engine lifecycle | `src/hooks/use-engine.tsx:598-601, 630-641` (early returns), `:685, 706-722` (start guard + worker creation), `src/components/translate/setup-card.tsx:152-165` | Early load failures inside `beginLoad` (quota too small; the hide-switch backstop) return **before** any `terminate()` — but `start()` already created the worker, took the Web Lock and set `workerRef.current`. The quota card has no action button; every later `start()` is a silent no-op (`if (workerRef.current) return`), the desired-engine effect cannot recover (no `activeSpecRef`, status `error`), and the zombie worker still holds the tab lock. The app is bricked until reload. | Reproduced live twice: quota overridden to 1 B → error card "This window can only store 1 B…" → Translate silent no-op, no heavy ask for Pashto, Settings remove does not un-brick, only reload recovers | On any `beginLoad` false-return after the worker exists, terminate it and reset status; or make `start()` terminate a worker that has no `activeSpecRef` | S | **Verified** |
| H-2 | Supply chain | `package.json:76` (`next` 16.1.3), `:77` (`next-auth`); `.github/workflows/ci.yml` (no audit step) | `npm audit`: 41 advisories (2 critical / 24 high / 13 moderate / 2 low), 29 of them with `--omit=dev`. Critical #1: `next` 16.1.3 runtime advisories incl. unauth RCE-class issues (Image Optimization API, request deserialization). Critical #2: `next-auth` — dormant (never imported by src, never in the standalone bundle) but installed. No audit gate in CI. Advisory preconditions look unmet today (static single page, no image optimization, no Windows hosting, no attacker-controlled RSC input). | `npm audit --json` (raw logs: `scripts/scan/logs/npm-audit*.json`) | Bump `next` when patched; remove the unused `next-auth` (see M-10); decide an audit policy for CI | S/M | **Verified** (presence); impact suspected |

## Medium

| ID | Area | File:line | What is wrong | How known | Suggested fix | Effort | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M-1 | Settings restore | `src/lib/engines.ts:620-647` (`restoredPair`) | With "Use faster models" off, `engineForPair` routes every pair to the large model, so `restoredPair` marks both the last pair and `lastSmall` large and falls back to the hardcoded default — the saved pair is discarded on **every reload**, contradicting the file's own rule that an explicit global ask "stays offered" | Reproduced live (saved `tur_Latn` pair → pickers opened on English→French after reload) + executed in node + code read | Treat `useFastModels === false` as deliberate in `restoredPair` (the no-auto-start rule already protects page load) | S | **Verified** |
| M-2 | Honesty panel | `src/lib/netlog.ts:257-272` | The legacy `observer.observe({ entryTypes: [...] })` is registered unconditionally **in addition to** the typed observers; every browser that supports both (Chrome/Firefox/Safari) records each resource twice — the "Check for yourself" panel doubles its own-file counts and bytes | Reproduced live: panel showed 48 requests / 1.5 MB vs 42 real; 5 paths listed twice; one synthetic fetch incremented both observers | Register the `entryTypes` observer only when the typed form threw | S | **Verified** |
| M-3 | Docs | `README.md:48` | The "Languages and honest quality" table (55 rows) has no header row and no `\|---\|` delimiter row — dropped in commit 2d125b4; GitHub renders the whole table as literal pipe-text | Read + git history (header existed at 7054457) | Re-add the two header lines | S | **Verified** |
| M-4 | Worker watchdog | `src/hooks/use-engine.tsx:437-440` vs `:546-547`, `src/lib/speed-config.ts:62` | Requests typed during setup are held and flushed on ready **without** extending `busyUntilRef` — while the first flushed sentence's wasm inference blocks the worker's message loop, the 15 s heartbeat declares the healthy engine dead and terminates it (results lost) | Code traced line-by-line; the >15 s first-inference timing needs slow hardware (not measurable here) | Set `busyUntilRef = max(busyUntilRef, now + busyGraceMs)` in the flush loop | S | **Verified** (code) / suspected (timing) |
| M-5 | Model cache identity | `src/lib/model-cache.ts:35-60` (`modelIdOf` drops the revision), `src/lib/bergamot/bundles.ts:424-425` | Cache keys include the pinned revision but "is this model saved" matches any revision: after a pin bump the UI claims saved/works-offline while the engine re-downloads everything, old-revision entries are orphaned forever, and Settings double-counts both revisions | Code read (no live pin bump possible); transformers.js key shape cross-checked in `node_modules` | Include the revision in `modelIdOf` and drop same-model entries whose revision ≠ the pin after a successful load | M | **Verified** (code) |
| M-6 | Single-tab lock | `src/hooks/use-engine.tsx:564` | When `navigator.locks` is missing (Safari < 16.4) the fallback reports the lock as free: two tabs can each run a full engine (2 × ~2.5 GB for the large model) with no honest notice that single-tab mode is unavailable | Code read; no Safari < 16.4 available | Quiet note when the API is absent (like `notes.storageDisabled`), or a localStorage lease fallback | S/M | **Verified** (code) / suspected (impact) |
| M-7 | Service worker | `scripts/sw-template.js:30-36` | `/bergamot/` (the 5.3 MB sha-pinned runtime) is in neither `PRECACHE` nor `CACHE_FIRST` — the ORT engines' runtime is precached but Bergamot's is not; after an app update an unset-up Bergamot pair re-fetches the runtime from the network while ORT pairs do not | Code read + fresh-copy build inspection | Add the two bergamot runtime paths to `PRECACHE` and `"/bergamot/"` to `CACHE_FIRST` | S | **Verified** |
| M-8 | Service worker | `scripts/sw-template.js:45, 53-58` | `skipWaiting()` + activation deletes every other `pt-shell-*` cache while an already-open tab still runs the old build — its later `/_next/*` fetches 404 and the cache that could satisfy them is gone; no update-ready messaging exists | Code read; needs a two-build deployment to reproduce end-to-end | Message-driven "update ready → reload", or keep the previous shell cache one generation | S/M | **Suspected** |
| M-9 | Build gate | `next.config.ts:5-7` | `typescript.ignoreBuildErrors: true` — `npm run build` can never fail on type errors; only the explicit `npm run typecheck` (CI, local gates) catches them. Any deploy path that runs only the build ships type-broken code silently | Config read; CI compensates today (typecheck is a separate step) | Remove the flag, or make typecheck mandatory in every deploy path | S | **Verified** |
| M-10 | Dead dependency surface | `package.json:29-97`, `src/lib/db.ts`, `prisma/schema.prisma` | 18+ unused dependencies (`next-auth`, `z-ai-web-dev-sdk`, `prisma`/`@prisma/client`, `zustand`, `zod`, `uuid`, `date-fns`, `framer-motion`, `next-intl`, `@mdxeditor/editor`, `@dnd-kit/*`, `@tanstack/*`, `react-markdown`, `react-syntax-highlighter`, `@reactuses/core`, `@hookform/resolvers`, …), dead `src/lib/db.ts` + `prisma/` boilerplate, and 33 of the 48 vendored `src/components/ui/*` files never imported — inflating install size, the audit surface (H-2) and review noise | depcheck + grep cross-check (every hit searched in `src/`) | One dedicated removal commit | S/M | **Verified** |
| M-11 | Phantom dependency | `src/workers/nllb-lean-engine.ts`, `src/workers/indictrans2-engine.ts` (import `onnxruntime-web`), `package.json` | `onnxruntime-web` is imported directly by both worker engines but never declared — it resolves only transitively through `@huggingface/transformers`, so a major bump there silently breaks the worker build | depcheck `missing` + import grep | Declare it as a direct dependency pinned to the version Transformers ships | S | **Verified** |
| M-12 | Sentence splitting | `src/lib/segment.ts:52` | The fallback (browsers without `Intl.Segmenter`, e.g. Firefox < 125) splits after any terminator: decimals, abbreviations and URLs are cut mid-token and each fragment is translated as its own sentence — `"Pi is 3.14 rounded. Ok!"` → `"Pi is 3."` + `"14 rounded."` + `"Ok!"`, `"Mr. Smith…"` and `"example.com."` likewise | Executed in node on the real function (3 repro cases) | Only split when the terminator is followed by whitespace + a plausible sentence start (not digit/lowercase); add a small abbreviation guard | S/M | **Verified** |
| M-13 | Accessibility | `src/components/history/history-sheet.tsx:180`, `settings/settings-sheet.tsx:145`, `batch/batch-dialog.tsx:190`, `translate/language-picker.tsx:253-255`, `translate/setup-card.tsx:109` | Every state-opened overlay (no `DialogTrigger`/`SheetTrigger` wiring) drops keyboard focus to `<body>` on close — Radix restores focus to a trigger ref that does not exist | Reproduced live (History and Settings: `document.activeElement === BODY` after Escape) | Wire the existing trigger buttons with `asChild` triggers or `onCloseAutoFocus` | M | **Verified** |
| M-14 | HTML validity / a11y | `src/components/app-header.tsx:81-85` | The mobile overflow menu's Share item renders `<button>` inside `<button>` (`DropdownMenuItem asChild` wrapping a button that itself renders ShareAction's `<Button>`) — invalid nesting, a console hydration error, a double tab stop, and an unnamed outer control | Reproduced live (console error + a11y tree at 375 px) | Lift `onShare` out of `ShareAction` so the menu item calls it directly | S | **Verified** |
| M-15 | RTL (P14 miss) | `src/components/translate/output-pane.tsx:150-154` | The English failed-sentence line ("Couldn't translate that. Try again.") sits inside the `dir`-inherited RTL output container without its own `dir="ltr"` — the one English line P14's isolation pass missed; the trailing period lands at the wrong end | Code read (the P14 pattern was applied to every other English line in the pane) | Add `dir="ltr"` to that span | S | **Verified** |
| M-16 | Re-render churn / stale fragments | `src/hooks/use-engine.tsx:488-490` (new heap object every stats reply), `src/hooks/use-translator.ts:196-197, 227`, `src/hooks/use-history.ts:96-99` | Every 5 s heartbeat reply changes the engine context identity → the fragment-reschedule effect re-runs, cancelling the in-flight trailing fragment and discarding its result (`dropFragmentRequest` deletes the pending entry), so a fragment whose inference outlasts ~5 s is re-requested in a loop; the whole translator tree also re-renders every 5 s while any engine is loaded (history actions object is rebuilt every render too) | Mechanism traced line-by-line; user-visible impact needs >5 s inference (not measurable here) | Bail out of `setHeap` when used/limit are unchanged; stabilize the `useHistory` actions object | S/M | **Verified** (mechanism) / suspected (impact) |
| M-17 | Details panel | `src/components/translate/details-panel.tsx:194-219` | If the engine is unloaded (Free memory now) mid speed test, no message ever completes the test — the button stays "Running the speed test…" forever and reopening Details does not reset it | Reproduced live (stuck 55+ s, engine back to Ready, no reset without reload) | Reset the test when `engine.status !== "ready"` or add a timeout | S | **Verified** |
| M-18 | Size copy honesty | `src/lib/copy.ts:12, 298, 308`; `src/lib/format.ts:16-18`; `README.md` size mentions | In-app copy under-reports the real maximum fast download ("20 to 130 MB" vs the actual 148 MB English→Hebrew; "115 MB" vs the displayed 114; "20 to 50 MB" vs 52), and the app mixes binary MiB labelled "MB" (the 912 MB bundle shows as "870 MB" in progress totals but "about 900 MB" in the offer) while the README uses decimal MB for the same bytes | Computed from the pinned byte sizes (all pins exact) | Pick one convention (the app's displayed numbers) and sweep copy + README + `generate-notices.mjs` | S | **Verified** |
| M-19 | Screen-reader announcements | `src/components/translate/status-badge.tsx:57`, `translate/setup-card.tsx:262-268`, `translate/output-pane.tsx:232-233` | The status badge's `aria-live` container unmounts when content is empty (transitions into a state are not announced), the P13 "unloaded to free memory" quiet line is never announced, and failed sentences are not announced while the progress line switches to "Translated in Xs" | Structure verified by code read; no screen reader in the sandbox | Keep the live region mounted with empty content; `role="status"` on the idle-offer card; surface `failedCount` in the completion line | M | **Verified** (structure) / suspected (SR behavior) |
| M-20 | Engine switching race | `src/hooks/use-engine.tsx` (desired-engine effect vs status transitions) | Changing the target language while a model download is in flight leaves a transiently wrong setup card — "Setting up English to French… Set up now" for an already-saved pair — which self-heals after 3-5 s (or instantly on click) | Reproduced live with a clean repro (saved en→fr ready → Greek download → switch back within ~2 s) | Derive the card from the engine spec + status atomically, or flush the desired-engine effect on pair change during `loading` | S/M | **Verified** |
| M-21 | CI reality | `.github/workflows/ci.yml:25`, `package.json` (no `engines`) | The workflow matches the local gates (npm ci → drift → lint → typecheck → build, node 24) but the repo has **no git remote** — CI has never run; and `check-drift.mjs` imports `engines.ts` directly, which needs Node ≥ 22.18 type stripping while nothing but the yml pins that | Read + `git remote -v` empty; local node is v24.21.0 | Add `"engines": { "node": ">=24" }`; run CI once a remote exists | S | **Verified** |
| M-22 | Drift gate blind spots | `scripts/check-drift.mjs` | Green today, but it silently does not verify: `public/ort` contents (a truncated copy ships silently — `copy-ort.mjs` has no checksum), the worker bundle vs its sources (a stale `translator.worker.js` passes because the BUILD_ID stamp only changes when the bundler re-runs), or the SW precache list vs `public/` | Read + fresh-copy build observation | Extend drift with ort/bergamot existence+size checks and a worker-source hash stamp | M | **Verified** (gaps) |
| M-23 | Dev staleness trap | `scripts/build-worker.mjs` (no watch), `scripts/dev-relaunch.sh` | While `next dev` runs, edits to `src/workers/**` (or any `src/lib/**` file the worker pulls in) are **not** rebundled — `public/translator.worker.js` is outside the Next dev graph, and the hello handshake cannot detect it (both stamps come from the same stale build) | Read; the repo even carries `dev-relaunch.sh` for exactly this | Document loudly, or fs.watch the worker sources and re-bundle | S/M | **Verified** (design gap) |

## Low

| ID | Area | File:line | What is wrong | How known | Suggested fix | Effort | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-1 | Protocol | `src/workers/protocol.ts:111` vs `use-engine.tsx:427` | `ready.engineId` is sent but never verified — the main thread labels the engine from `desiredRef`, trusting the worker loaded what was asked (reachable mismatches are covered by the stale hold; defense-in-depth missing) | Code read | Assert `message.engineId === activeSpecRef.current?.id` | S | **Verified** |
| L-2 | Worker | `src/workers/translator.worker.ts:428` | `load()` silently swallows an `init` that arrives while another load runs; the main thread believes the new engine is loading (unreachable today, fragile) | Code read | Queue the latest init or post an error | S | **Verified** |
| L-3 | Batch | `src/components/batch/batch-dialog.tsx:126` | Results are cached under the closure's *current* pair, not the pair at queue time (unlike `use-translator.ts:91`) — a mid-run pair change writes old-pair translations into the new pair's cache | Code read | Store the pair in `pendingRef` alongside the sentences | S | **Suspected** |
| L-4 | Cache integrity | `src/workers/bergamot-engine.ts:118`, `src/workers/indictrans2-engine.ts:101` | Cache reads verify size only (NLLB re-hashes) — a same-size corrupt entry would be used; entries are only written post-verification so exposure is disk-level corruption | Code read | Hash on read, or accept and document | S | **Verified** |
| L-5 | Late messages | `src/hooks/use-engine.tsx:332` | `handleWorkerMessage` has no `workerRef.current` guard — a message already posted can be delivered after `terminate()`: a late `ready` would set status "ready" with no worker | Spec + code read | `if (!workerRef.current) return;` at the top of the handler | S | **Suspected** |
| L-6 | Netlog | `src/hooks/use-engine.tsx:437-440` | Flushed held requests bypass `netlog.markTranslateSent` — requests during that window aren't flagged in "Check for yourself" | Code read | Call `markTranslateSent(heldId)` in the flush | S | **Verified** |
| L-7 | Locks | `src/hooks/use-engine.tsx:567` | `void navigator.locks!.request(...)` — a rejection escapes the try/catch and becomes an unhandled rejection | Code read | `.catch()` it | S | **Verified** |
| L-8 | Notes | `src/hooks/use-engine.tsx:894` | `webgpuFellBack` is true for engines that never attempt WebGPU (Bergamot, the lean NLLB engine) when the WebGPU toggle is on | Code read | Only set it for engines that tried | S | **Verified** |
| L-9 | Watchdog | `use-engine.tsx:547`; `bergamot-engine.ts:128`, `nllb-lean-engine.ts:122` | The 90 s load-state heartbeat cap can false-kill a very slow session creation (no measurement); progress totals use gzipped `content-length` while the reader yields decompressed bytes, so `loaded > total` is cosmetically possible (fraction is capped) | Code read | Raise the cap for session-creation stages; use pinned bytes as the total | S | **Suspected** |
| L-10 | History validation | `src/hooks/use-history.ts:33`, `history-sheet.tsx:44` | `createdAt` is unvalidated — a corrupt entry survives the filter and `Intl.DateTimeFormat.format(new Date(undefined))` throws, breaking the sheet render | Code read (no natural corruption path found) | Require `typeof e.createdAt === "number"` | S | **Verified** |
| L-11 | Crash flag | `use-engine.tsx:656, 415, 997`; `speed-config.ts:88-90` | A >10 min legitimate download makes a later real crash "stale" (notice suppressed); a deliberate tab close mid-setup still shows the "ran out of memory" guess; setup errors don't clear the flag | Code read | Refresh the timestamp on progress; clear on `pagehide` | S | **Verified** |
| L-12 | Quality data | `src/lib/quality.ts:878` | `languageQuality` is dead code **and** `swh_Latn` violates the function's own tier rule (language tier "good" while the weaker direction is full-model-only) | Executed in node + grep (no importer) | Delete it (or regenerate correctly if adopted) | S | **Verified** |
| L-13 | Stale flash | `src/hooks/use-translator.ts:266` | `lastShownRef` is positional — inserting/deleting a sentence before a pending one briefly shows a different sentence's previous translation under the shifted sentence | Code read | Key by sentence id where cheap | S | **Suspected** |
| L-14 | Netlog growth | `src/lib/netlog.ts:163-179` | Entry arrays grow without cap for the visit's lifetime (only the intervals map is capped at 500) | Code read | Cap like the intervals map | S | **Verified** |
| L-15 | Listeners | `src/hooks/use-install-prompt.ts:20-29` | `beforeinstallprompt`/`appinstalled` listeners never removed (double-registered in dev strict mode; production registers once) | Code read | Return a cleanup from the effect | S | **Verified** |
| L-16 | Dead exports | `src/generated/worker-build.ts` (misleading "shown in Details" comment; the real id is `src/workers/build-id.ts`), `engines.ts:672`, `model-cache.ts:101`, `quality.ts:878`, `bergamot/bundles.ts:375` (plus "pt-bergamot" hardcoded 4×), `indictrans2/bundles.ts:85`, `copy.ts:442` | Seven dead exports after grep cross-check (282 ts-prune candidates, the rest false positives) | ts-prune + grep | Delete them; route the bergamot cache name through one constant | S | **Verified** |
| L-17 | Batch | `src/components/batch/batch-dialog.tsx:58-61, 66, 89` | Unused `sentences` memo; the batch text is segmented 3× per run | Code read + grep | Delete the memo; segment once | S | **Verified** |
| L-18 | Batch (latent) | `src/components/batch/batch-dialog.tsx:109-110` | `queued === 0` conflates "all cached" with "all cached-or-pending" — in-flight results would be missed from the copy/download; live today only because batch translates are posted synchronously up front | Code read + message-ordering analysis | `if (queued === 0 && pendingRef.current.size === 0)` | S | **Verified** (latent) |
| L-19 | Touch targets | `output-pane.tsx:186-227`, `swap-button.tsx:10-19`, `history-sheet.tsx:92-132`, `app-header.tsx:48-66` | Icon action buttons are 36 px (nav 32 px) — pass WCAG 2.5.8 (24 px) but miss the 44 px mobile guideline; pickers/grid rows are correctly 44-56 px | Tailwind size audit | Enlarge on touch viewports | M | **Verified** |
| L-20 | Contrast | `src/components/translate/details-panel.tsx:342` | Details file names at `text-muted-foreground/80` 11 px ≈ 3.5:1 in light mode (AA needs 4.5:1 for small text; dark mode passes) | Token math | Drop the `/80` | S | **Verified** |
| L-21 | Long-word overflow | `output-pane.tsx:246`, `batch-dialog.tsx:268` | `whitespace-pre-wrap` with no `overflow-wrap` — a 10k-char unbroken word gets an inner horizontal scrollbar instead of wrapping (the textarea wraps by UA default) | Code read + live input test (no crash, layout holds) | `overflow-wrap: anywhere` on the result boxes | S | **Verified** |
| L-22 | Focus steal | `src/components/translate/input-pane.tsx:34-36` | The hide-input effect focuses the textarea on mount too — a stored `hideInput: true` yanks focus after page load, and toggling by keyboard moves focus off the switch | Code read | Only focus on a real toggle change | S | **Verified** |
| L-23 | History UX | `src/components/history/history-sheet.tsx:123-132` | One tap on the trash icon permanently deletes an entry with no confirmation (clear-all does confirm) | Code read | Inline confirm or undo toast | S | **Verified** |
| L-24 | Object URLs | `output-pane.tsx:30-35`, `batch-dialog.tsx:165-173` | `URL.revokeObjectURL(url)` runs synchronously after `anchor.click()` — older WebKit can abort the blob fetch | Code read; current engines fine | Revoke after a tick | S | **Suspected** |
| L-25 | Type/lint safety net | `tsconfig.json:13, 44`; `eslint.config.mjs:12-13, 20, 50` | Thinner than "strict" reads: `noImplicitAny: false`, `react-hooks/exhaustive-deps` off, `no-explicit-any`/`no-unused-vars` off, `scripts/**` excluded from both lint and typecheck | Config read | Re-enable incrementally; cover scripts/ | S/M | **Verified** |
| L-26 | Stale comments | `scripts/sw-template.js:8` ("pt-model-debug" no longer exists — ships inside sw.js), `scripts/copy-bergamot.mjs:6` (points at `runtime.ts`), `scripts/build-worker.mjs:13-14` ("shown in the Details panel" — it is not) | Read | Fix the three comments | S | **Verified** |
| L-27 | Dead config | `tailwind.config.ts:7-9`, `components.json` | Tailwind config content globs point at `./pages`, `./components`, `./app` — none exist (source is `src/`); the project is Tailwind v4 CSS-first so the whole file is inert scaffold | Read + globals.css check | Delete it (keep `components.json` for the shadcn CLI if used) | S | **Verified** |
| L-28 | Tracked `.env` | `.env` | Contains only `DATABASE_URL=file:...custom.db` (no secret) but is tracked while `.gitignore` ignores `.env*` for new files — a future real secret there would be committed | Read + gitignore check | `git rm --cached .env` | S | **Verified** |
| L-29 | Exec-bit noise | all tracked files | **All 490 tracked files are mode 100755** (json/md/tsx/fonts included) with `core.fileMode=true` — the root cause of the recurring "mode changes" churn in `git status` noted since P13 | `git ls-files -s` count | Normalize to 644 except real scripts (`git update-index --chmod=-x`) | S | **Verified** |
| L-30 | Translate button | `translate-view.tsx` / `input-pane.tsx` | After a first translation, Translate stays enabled on empty input but the click is inert (cold load disables it) — minor inconsistency | Live test | Disable when input is empty after any run | S | **Verified** |
| L-31 | Fonts docs | `THIRD_PARTY_NOTICES.md` (self-hosted fonts sentence), `scripts/generate-notices.mjs:174`, `scripts/fetch-fonts.mjs` | The notices claim all fonts live in `public/fonts/` fetched by `fetch-fonts.mjs` — the 8 Latin faces actually live in `src/fonts/` via `next/font/local`, and `fetch-fonts.mjs` writes a `fonts.css` that does not exist in the tree (re-running it would change `public/fonts/`) | Read + tree diff check | Update the sentence; reconcile the script | S | **Verified** |
| L-32 | Wording | `src/lib/copy.ts:399` | `webgpu: "Try the faster graphics device (experimental)"` — the only remaining user-facing "(experimental)" (labels the WebGPU toggle, not the removed feature; appears intentional but is flagged per the brief) | Grep | Keep or reword | S | **Verified** |
| L-33 | Download lifecycle | worker fetch layer | An en→tr download "cancelled" by a page reload still completed and saved (likely finished inside the unload window) — benign, but Cancel tests should know downloads can outrun the navigation | Live observation (once) | None needed; worth a code comment | S | **Verified** (observed once) |
| L-34 | Hook deps | `src/hooks/use-engine.tsx:874` | The desired-engine effect's deps omit `start`/`switchTo`/`terminate` (adjacent to H-1's recovery gaps); `react-hooks/exhaustive-deps` is disabled so nothing guards it | eslint extra pass + hand read | Fold into H-1's fix; re-enable the rule | S | **Suspected** |

## Clean areas (checked, sound)

- **Privacy end-to-end** (see the bolded paragraph above). Hostile share
  fragments (`#s=AAAA`, script payloads, 60k chars) load safely with zero
  console errors; the fragment is scrubbed from the address bar.
- **Static gates:** strict typecheck exit 0; `eslint .` exit 0; no circular
  dependencies (madge, 111 files); import-case audit clean (186 files, 307
  specifiers, 33 asset URLs, 17 SW precache entries — 0 mismatches,
  `scripts/scan/check-import-case.mjs`); no `console.log`/TODO/FIXME in
  `src/`; XSS sinks are exactly two: a fully static inline script constant
  (`layout.tsx:74`) and the unimported vendored `ui/chart.tsx`.
- **Pins and data:** all 235 pinned model URLs resolve over the network
  (48/48 HF repos, 46/46 quantized encoders, 22/22 IndicTrans2 files, 7/7
  NLLB bundle files, 112/112 Bergamot files — zero dead pins); pinned byte
  sizes exact everywhere checked; every pin entry carries a sha256; the
  self-hosted Bergamot runtime matches its pin locally (both files); counts
  all verified (56 languages, 95 fast routes, 71 engines = 71 notice rows,
  70 best / 25 good / 0 limited / 15 full, 7 large-only languages, 13 Indic);
  drift green in both the main tree and the fresh copy; license notices match
  the models and runtimes actually shipped.
- **Fresh-copy clean build:** `git archive` → `npm ci` (postinstall
  regenerates `/ort/`, `/bergamot/`, the 1,761,788 B worker bundle and sw.js
  by itself) → drift / lint / typecheck / build all exit 0; first visit
  **308,639 B over 11 requests** (README: ~298 KB over 11 — within band);
  deferred loads measured: ORT 5,426,978 B, Bergamot runtime 5,322,358 B,
  worker 1.76 MB — all matching README claims.
- **Worker correctness (traced):** all 10 worker→main message types handled
  and all 6 main→worker types handled; PROTOCOL_VERSION + BUILD_ID handshake
  both directions; stale/cancelled results dropped by request id with the
  pair recorded at queue time (a late result can only land in the correct
  pair's cache); cancelled jobs dropped and queued cancels purge the queue;
  verify-then-cache on every custom engine download (a cancelled download
  leaves no half-written cache entry); quota checked before every download;
  the monotonic progress latch resets when the announced total grows; timers
  and watchers cleaned in `terminate()`; the deliberate-unload hold has no
  auto-restart leak; the Web Lock is released on every termination path.
- **Share link round-trip:** deflate-raw + base64url fragment survives emoji
  ZWJ/flags/skin tones, RTL, surrogate pairs (both schema versions);
  malformed/garbage/oversized inputs all return `null` safely.
- **Storage safety:** every localStorage access guarded; Safari-private-mode
  and blocked-storage fall back to an in-memory map; settings reads validate
  every field; erase removes all keys and caches.
- **Unusual input (live, en→fr):** 10/10 pass — 20k chars, 10k-char word,
  emoji families/flags/skin tones, mixed scripts, RTL paragraphs, 200×
  repeated sentences, tabs/CRLF/U+200B/U+00A0, no-punctuation and
  punctuation-only text: all complete without crash or hang (emoji becoming
  dashes is model GIGO, not an app bug).
- **Flows (live):** Cancel returns to the offer and retry works; reload
  mid-download recovers honestly (crash-flag card, retryable); rapid typing
  reflects the final text; target switch mid-translation re-translates into
  the new language; offline override shows the honest lines and cached
  translation still works; page-level blocked storage degrades gracefully;
  mobile 375×667 has no horizontal scroll and dark-mode contrast measures
  13-15:1; speech buttons show the honest "No voice" fallback.
- **Language data:** all 56 codes genuine NLLB-200 codes; native names
  spot-checked across scripts; RTL flags exactly right (arb/heb/pbt/pes/urd,
  none missing, none extra); speech tags valid BCP-47 with a robust voice
  fallback; sort order matches the claim.

## Could not be checked (and why)

- **Two-tab single-tab lock, live** — the browser tooling creates isolated
  contexts per tab (the second tab even got a different storage bucket), so
  the lock could not be exercised end-to-end; mechanics were traced by hand
  instead (sound, modulo M-6's Safari fallback).
- **Model file sha256s beyond the locally shipped Bergamot runtime** —
  verifying them needs 20 MB-912 MB downloads per model; every pin entry was
  confirmed to *have* a checksum and all URLs were confirmed to resolve.
- **Real Safari / Firefox / iPhone Safari behavior** — Web Locks fallback
  (M-6), `Intl.Segmenter` fallback (M-12), `speechSynthesis` quality:
  code-level analysis only, no such device in the sandbox.
- **Service worker update race end-to-end (M-8)** — needs two consecutive
  deployed builds; dev mode registers no SW (documented since P13;
  offline-from-cache was verified against the production build instead).
- **GitHub Actions run** — the repository has no git remote, so ci.yml has
  never executed (M-21).
- **Screen-reader announcements (M-19)** — structure verified, no SR here.
- **Slow-network throttling** — no CDP throttling in the tooling; the honest
  progress/elapsed lines were verified live at full speed instead.
- **Exploitability of the Next.js criticals (H-2)** — advisory preconditions
  appear unmet (static single page, no image optimization use, no Windows
  hosting, no attacker-controlled RSC input); no live self-hosted attack test
  was run.
- **The >15 s / >5 s inference timings** that would make M-4 and M-16
  user-visible on slow hardware — no slow device here.
- **Voice output quality** — headless has no voices (the honest fallback was
  verified instead).

## Scan scripts

Kept in `scripts/scan/` with a README describing how to run each:
`static-tools.sh` (typecheck, lint, npm audit dev+prod, ts-prune, madge,
depcheck), `a11y-lint.sh` + `eslint-a11y.config.mjs` (jsx-a11y +
react-hooks rules via a scratch install in `/tmp/scan-tools`, project
manifests untouched), `check-import-case.mjs` (case-sensitive import audit),
`targeted-grep.sh` (network/XSS/types/leftovers/cleanup/storage batteries),
and the raw outputs under `scripts/scan/logs/`. All are read-only against the
repo.

## Severity scale used

critical = privacy leak, data loss, or crash on a common path · high = broken
core flow under plausible conditions or a shipped critical advisory ·
medium = broken edge case with real user impact, a11y blocker, or a doc/data
inconsistency that misleads · low = polish, hygiene, defense-in-depth.

*Report-only: no app code, models or quality bars were changed. Findings are
inputs for a fix task, not fixes.*

# B4a — Browser: two tabs and crash (Private Translator @ http://localhost:3000)

Test plan: Part A verifies the Web Locks "one tab at a time" behavior on a second tab;
Part B verifies the leftover crash-flag (`pt.setup.crash`) is cleared after a reload
that auto-starts the engine from the saved model.

Start state (given): two tabs open on http://localhost:3000 — t1 (engine tab, holds the
lock) and t2 (active, "just loaded"). App pair at last session end: English → Spanish,
engine ready, EN→ES model saved (330 MB of ~10.5 GB used).

## ⚠️ BLOCKER ENCOUNTERED BEFORE STEP 1 — BOTH TABS COMPLETELY UNRESPONSIVE

Every attempt to read the page failed BEFORE any app-level text could be recorded:

| Command | Result |
|---|---|
| `agent-browser tab` | ✅ lists `[t1]`, `→ [t2]` both "Your words belong to you" @ http://localhost:3000/ |
| `agent-browser wait 3000` | ✅ Done |
| `agent-browser eval 'document.querySelector("section[aria-label=Translation]").textContent.slice(0,300)'` | ✗ `CDP command timed out: Runtime.evaluate` (30 s) |
| `agent-browser eval 'document.title'` (simplest possible probe) | ✗ `CDP command timed out: Runtime.evaluate` (30 s) |
| `agent-browser get url` | ✗ `CDP command timed out: Runtime.evaluate` |
| `agent-browser screenshot /tmp/b4a-tab2.png` | ✗ `CDP error (Page.captureScreenshot): Internal error` |
| `agent-browser tab t1` (switch attempt) | ✗ `Cannot switch to tab t1: tab is not responding and did not recover after activation` |
| `agent-browser dialog dismiss` | ✗ `No dialog is showing` (rules out a blocking JS dialog) |
| `agent-browser errors` | ✅ runs, empty output |
| `agent-browser console` | ✅ runs (buffered): only React-DevTools info lines, `[HMR] connected`, `[Fast Refresh] rebuilding` / `done in 168ms` — no errors |

Raw-CDP diagnosis (bypassing agent-browser, direct WebSocket to each page target,
script `scripts/browser-tests/tmp/cdp-probe.mjs`, DevTools port 40463):

- target `F744CAE2A1E4EDD9BDAF100F0F9C28DC` (localhost:3000): `Runtime.evaluate` → timeout; `DOM.getFlattenedDocument` → timeout
- target `C8B125FF3524C0DA88EE0CCA9A34B46A` (localhost:3000): `Runtime.evaluate` → timeout; `DOM.getFlattenedDocument` → timeout
- Sanity check: `chrome://newtab` target evaluates fine (`"New Tab"`), and a fresh `about:blank` tab evaluated `1+1 → 2` and was closed again. So the agent-browser daemon and the browser itself are healthy — **only the two localhost:3000 renderers are wedged.**
- Domain probe (`tmp/cdp-domains.mjs`): on BOTH localhost:3000 targets, `Runtime.enable`, `Page.enable`, `Page.getFrameTree`, `Log.enable`, `Runtime.runIfWaitingForDebugger`, `Emulation.setFocusEmulationEnabled` ALL time out; only browser-process-side commands (`Target.setAutoAttach`, `Page.setWebLifecycleState`) respond.
- `Page.setWebLifecycleState("active" → "frozen" → "active")` on both targets: accepted, but does NOT revive them (eval still times out) — so this is not ordinary tab freezing.
- Renderer processes: alive, `Sl` state, parked in `futex_wait_queue_me`, **0.0 % CPU**, ~45–80 MB RSS each. Not crashed, not spinning — the main threads are blocked waiting on something that never arrives.
- System: load average 0.00, 2.4 GB RAM free; `next dev` (v16.1.3, Turbopack) healthy; dev server log shows only normal `GET / 200` entries. No JS dialog open. No page errors captured.

Interpretation: this is a **hard main-thread hang in both tabs of the app**, present
when this session started (before any of my commands touched the pages — first command
was a read-only `tab` listing, second a client-side `wait`). It is not an
agent-browser/daemon issue and not a busy loop; both renderers are idle-blocked.
Because no text could be read, **Part A step 1's expected message could not be observed
in the original t2** — recording the hang itself as the step-1 result, per the
"record what appeared instead" instruction.

Recovery attempt (to still exercise the intended code paths): reload t2 (fresh load
while t1 still holds the lock, since a hung-but-alive renderer keeps its Web Lock),
re-check the section text, then continue the plan; t1 likewise needs a revive before
step 3 can type into it. Details below.

---

## PART A — SECOND TAB (Web Locks)

### Step 1 — Active tab (t2) output section text after 3 s wait

**Original t2: UNREADABLE — renderer main thread hung (see blocker above).**
`agent-browser eval 'document.querySelector("section[aria-label=Translation]").textContent.slice(0,300)'`
→ `✗ CDP command timed out: Runtime.evaluate`. No section text could be captured.
Expected text was: `Translation is open in another tab. Use that one, or close it and reload this one.`

### Recovery of t2 — reload (fresh load of the second tab while t1 exists)

`agent-browser reload` on t2 → ✅ returned `http://localhost:3000/` (reload is browser-process
side, so it recovers a wedged tab). After `wait 3000`:

- `eval 'document.title'` → `"Your words belong to you"` — tab is alive again.
- Section text (slice 300): **`"TranslationThe translation appears here."`** — i.e. `Translation` + `The translation appears here.`
- **The expected "open in another tab" message did NOT appear.** Instead t2 came up as a
  normal, working tab: `pt.model.ready = "1"`, `pt.setup.crash = null`.
- Reason: **t1 no longer holds the engine lock.** t2's engine auto-started from the saved
  model and reached READY (it acquired the Web Lock unopposed). Evidence — `#engine-details`
  after setup settled:

  ```
  Engine: Opus-MT English to Spanish · Model: Xenova/opus-mt-en-es · Precision: 8 bit quantized, about 114 MB
  Licence: Apache-2.0 · Helsinki NLP · Device: WebAssembly
  Files: tokenizer.json / tokenizer_config.json / config.json / generation_config.json — loaded from saved files
         onnx/encoder_model_quantized.onnx — saved · onnx/decoder_model_merged_quantized.onnx — saved
  Storage: 330 MB of 10570 MB
  Stage times: checking: 0.1 s · downloading: 0.2 s · into memory: 2.9 s · check: 0.6 s
  App version 0.2.1 · Recent translations: Nothing translated yet this visit.
  ```

- Section text stayed `"TranslationThe translation appears here."` on re-polls at +5 s and
  +10 s — engine ready, no lock error, no crash notice.

So the lock-message behavior could not be observed on t2 against t1 (t1's hang evidently
took its lock with it — the lock is only held while the engine runs, and the hung t1 no
longer participates). To still exercise the exact Web Locks code path, the roles are
swapped: **t2 now holds the engine/lock; t1 gets reloaded as the "second tab"** and should
show the lock message. Documented below as "Step 1 (role-swapped reproduction)".

### Step 1 (role-swapped reproduction) — reload t1 while t2 holds the engine lock

Attempted: `agent-browser tab t1 && agent-browser reload` → ✗ `Cannot switch to tab t1:
tab is not responding and did not recover after activation` (the daemon's tab switch
does a health ping and refuses to attach to the wedged tab). Raw-CDP fallback
(`tmp/cdp-reload-t1.mjs`): sent `Page.reload` directly to t1's target
(`C8B125FF3524C0DA88EE0CCA9A34B46A`) → accepted.

What happened next showed the hang is **recurring and not a one-off stale state**:

- `agent-browser tab t1` (retry, 58 s) → ✗ same "not responding" failure.
- Raw-CDP responsiveness probe then showed **BOTH localhost:3000 targets hung again —
  including t2 (F744CAE2…), which had been fully healthy 4 minutes earlier** (engine
  ready, details readable). `Page.setWebLifecycleState("active")` did not revive it.
- Meanwhile the process table showed the daemon's failed switches/reloads had spawned
  two fresh renderer processes, and the old wedged ones were still parked:

  | renderer | started | state | CPU | RSS | reading |
  |---|---|---|---|---|---|
  | 12509 | 11:24:46 | Sl (idle, futex) | 0 % | ~70 MB | original t1 doc, wedged |
  | 12533 | 11:24:46 | Sl (idle, futex) | 0 % | ~45 MB | older doc, wedged |
  | 18955 | 12:38:03 | Sl (idle, futex) | 0 % | ~68 MB | original t2 doc (renderer reused by my t2 reload), wedged |
  | **19396** | **12:44:59** | **Rl (running)** | **35–44 %** | 487 → 734 MB | fresh t2 doc from the daemon's recovery reload — running engine setup, never became CDP-responsive |
  | **19627** | **12:48:05** | **Rl (running)** | **73 %** | 643 → 910 MB | fresh t1 doc from the raw-CDP reload — running engine setup |

- One long-timeout (60 s) probe did land on t1's fresh doc and read:
  `document.readyState = "complete"`, section text = **`"TranslationChecking that translation works"`**
  — i.e. t1's fresh load got PAST the Web Locks check (no "another tab" error) and was
  stuck in the final setup stage, while a 90 s follow-up probe timed out again.
- Both fresh renderers kept burning CPU and growing RSS (910 MB + 734 MB on a 4 GB
  machine, available memory down to ~1.3 GB, no swap) — the setup appears to never
  complete ("Checking that translation works" is normally a 0.6 s stage; it sat there
  for minutes).

Conclusions so far:

1. **Recurring renderer main-thread wedge**: every load of the app eventually becomes
   CDP-unresponsive (first observed on both inherited tabs; then t2-after-recovery hung
   again ~5 min after reaching "Ready"; then the fresh replacement docs hung while still
   in setup). Renderers stay alive at 0 % CPU (futex-parked) or busy (35–73 % CPU) but
   in both cases stop answering `Runtime.evaluate` / `Page.enable` / screenshots.
2. **Web Locks arbitration was bypassed by the hang/reload sequence**: after the reload
   churn, two tabs ended up simultaneously running engine setups (both fresh renderers
   loading models at the same time, driving the box toward OOM), instead of the second
   tab showing the lock message. The lock message itself was never observable on the
   inherited tabs because neither tab could be read at all.

To still verify the app's intended behavior, the tabs were reset and the scenario was
re-run cleanly (below).

### Clean re-run of the two-tab scenario

(done after closing the wedged tabs — see "Reset & clean re-run" section)


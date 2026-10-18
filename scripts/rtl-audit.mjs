// P14 Step 5 — the RTL audit, the check that stays.
//
// Two parts, one script, no new dependencies:
//
//   Part 1 (always runs, no browser): a static scan of src/components (minus
//   the unused stock shadcn files, plus the ui files the app actually imports)
//   for physical direction utilities — text-left/right, ml-/mr-/pl-/pr-,
//   left-*/right-*, border-l/r, rounded-l/r-, space-x-, float/clear-left/right,
//   inset-l/r — and for raw left/right in inline style objects. Every hit is
//   checked against the ALLOWLIST below, which is data (file + class + reason)
//   so a future edit that touches an intentional utility shows up as a NEW
//   hit and has to be a deliberate decision, not an accident.
//
//   Part 2 (needs the dev server on http://localhost:3000): drives the real
//   UI in a real headless Chromium over raw CDP — the same WebSocket approach
//   as scripts/nllb-lean/browser-measure.mjs, but launching its own browser
//   with a throwaway profile so every run starts cold and deterministic.
//   States audited, all through the real UI:
//     1. the default LTR page (English -> French): the baseline;
//     2. the RTL grid route: Pashto picked from the "Every language, in its
//        own script" grid -> the experimental notice inside the output pane's
//        dir=rtl container, plus the target picker popover with its RTL rows;
//     3. a real small-model RTL pair downloading: English -> Persian (Bergamot
//        en-fa — see the note next to AUDIT_PAIR), through Set up now /
//        progress / Cancel, ending back at the offer state.
//   In every state the DOM is walked for English text (3+ consecutive ASCII
//   letters) and number+unit runs that sit under an rtl element without an
//   isolating element (dir="ltr", <bdi>, or unicode-bidi: isolate*) between
//   the text and the rtl ancestor.
//
// Usage:   npm run audit:rtl
// Exit:    0 clean · 1 flags found (or the audit could not complete) ·
//          2 the dev server is not reachable (Part 1 still ran and reported).
// Deliberately NOT wired into any CI/build/lint pipeline: this is a standalone
// check a human runs when touching RTL surfaces.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = "http://localhost:3000";

// ---------------------------------------------------------------------------
// Part 1 — static scan
// ---------------------------------------------------------------------------

/** The ui files the app actually imports — verified by grepping non-ui code
 * for `@/components/ui/...`: exactly these fifteen. Everything else under
 * src/components/ui/ is unused stock shadcn and is not scanned. */
const KNOWN_USED_UI = [
  "alert-dialog.tsx", "button.tsx", "dialog.tsx", "dropdown-menu.tsx", "input.tsx",
  "label.tsx", "popover.tsx", "progress.tsx", "radio-group.tsx", "separator.tsx",
  "sheet.tsx", "switch.tsx", "textarea.tsx", "toast.tsx", "toaster.tsx",
];

/** Physical utilities that should be logical (ms-/me-, ps-/pe-,
 * text-start/end, border-s/e, start-/end-...) wherever layout mirrors. */
const CLASS_PATTERNS = [
  { re: /\btext-(?:left|right)\b/g, why: "physical text alignment — use text-start / text-end" },
  { re: /\b(?:ml|mr|pl|pr)-/g, why: "physical margin/padding on the inline axis — use ms-/me-/ps-/pe-" },
  { re: /\b(?:left|right)-\d/g, why: "physical left/right inset — use start-/end-" },
  { re: /\b(?:left|right)-\[/g, why: "physical left/right inset (arbitrary value) — use start-/end-" },
  { re: /\bborder-[lr]\b/g, why: "physical border side — use border-s / border-e" },
  { re: /\brounded-[lr]-/g, why: "physical corner rounding — use rounded-s/e" },
  { re: /\bspace-x-/g, why: "physical inline-axis spacing — use gap on a flex container" },
  { re: /\b(?:float|clear)-(?:left|right)\b/g, why: "physical float/clear side" },
  { re: /\binset-[lr]\b/g, why: "physical inline inset — use inset-s/e (or start-/end-)" },
];

/** Raw physical direction in inline style objects (or CSS-in-JS keys). */
const STYLE_PATTERNS = [
  { re: /text-align\s*:\s*["'`](?:left|right)["'`]/g, why: "raw text-align: left/right in a style object" },
  { re: /\b(?:margin|padding)-(?:left|right)\b/g, why: "raw margin/padding left/right in a style object" },
  { re: /\b(?:margin|padding)(?:Left|Right)\s*:/g, why: "raw marginLeft/Right or paddingLeft/Right in a style object" },
  { re: /(?:^|[^.\w"'`-])(?:left|right)\s*:\s*["'`]?[-\w.]/g, why: "raw left:/right: key in a style object" },
];

/** Intentionally physical utilities, as data. A hit is suppressed only when
 * both the file and the class match (exact, or behind a variant prefix like
 * sm: or data-[side=left]:). Add entries deliberately, with a reason that
 * says WHY the physical choice is correct — future edits to these lines show
 * up as new hits and force the decision again. */
const ALLOWLIST = [
  // Dialog centering: top 50% / left 50% with a -50% translate is symmetric
  // viewport centering, not a direction choice. Identical under RTL.
  { file: "src/components/ui/dialog.tsx", klass: "left-[50%]", reason: "symmetric viewport centering (top/left 50% + translate -50%)" },
  { file: "src/components/ui/alert-dialog.tsx", klass: "left-[50%]", reason: "same symmetric centering as dialog.tsx" },
  // A sheet's side is an explicit physical choice: the right variant pins to
  // the right edge with a border on its inner (left) side, and vice versa.
  { file: "src/components/ui/sheet.tsx", klass: "right-0", reason: "sheet side variant: the side is an explicit physical choice" },
  { file: "src/components/ui/sheet.tsx", klass: "left-0", reason: "sheet side variant: the side is an explicit physical choice" },
  { file: "src/components/ui/sheet.tsx", klass: "border-l", reason: "sheet side variant: border on the inner edge of a right sheet" },
  { file: "src/components/ui/sheet.tsx", klass: "border-r", reason: "sheet side variant: border on the inner edge of a left sheet" },
  { file: "src/components/ui/sheet.tsx", klass: "slide-in-from-right", reason: "sheet side variant: slides from the chosen physical side" },
  { file: "src/components/ui/sheet.tsx", klass: "slide-in-from-left", reason: "sheet side variant: slides from the chosen physical side" },
  { file: "src/components/ui/sheet.tsx", klass: "slide-out-to-right", reason: "sheet side variant: slides out to the chosen physical side" },
  { file: "src/components/ui/sheet.tsx", klass: "slide-out-to-left", reason: "sheet side variant: slides out to the chosen physical side" },
  // Toasts live in a portal under the document root, which is always LTR.
  { file: "src/components/ui/toast.tsx", klass: "slide-out-to-right-full", reason: "toast corner animation; the document root is always LTR" },
  { file: "src/components/ui/toast.tsx", klass: "slide-in-from-top-full", reason: "toast corner animation; the document root is always LTR" },
  { file: "src/components/ui/toast.tsx", klass: "slide-in-from-bottom-full", reason: "toast corner animation; the document root is always LTR" },
  // The mobile bottom sheet pins to both edges at once: a symmetric
  // full-width pin, not a direction choice.
  { file: "src/components/translate/language-picker.tsx", klass: "left-0", reason: "mobile bottom sheet: symmetric full-width pin (left-0 right-0 bottom-0)" },
  { file: "src/components/translate/language-picker.tsx", klass: "right-0", reason: "mobile bottom sheet: symmetric full-width pin (left-0 right-0 bottom-0)" },
  // Safe-area padding, not direction. Not matched by any pattern today; the
  // entry documents the decision so a future pattern that does match it is
  // already covered.
  { file: "src/components/app-footer.tsx", klass: "pb-[max(1rem,env(safe-area-inset-bottom))]", reason: "safe-area inset padding, not a direction choice" },
  // Dropdown menus and popovers render in portals under the always-LTR body:
  // the indicator dot's left-2, the ml-auto shortcut chevron and the
  // slide-in-from-* entry animations (per side, relative to the menu's own
  // anchor) are physically correct there. Recorded by the 19-b sweep.
  { file: "src/components/ui/dropdown-menu.tsx", klass: "left-2", reason: "indicator dot in a menu item; the portal renders under the always-LTR body" },
  { file: "src/components/ui/dropdown-menu.tsx", klass: "ml-auto", reason: "shortcut chevron pushed to the line end inside an always-LTR portal menu" },
  { file: "src/components/ui/dropdown-menu.tsx", klass: "slide-in-from-right-2", reason: "per-side entry animation of a portal menu; the anchor side is physical" },
  { file: "src/components/ui/dropdown-menu.tsx", klass: "slide-in-from-left-2", reason: "per-side entry animation of a portal menu; the anchor side is physical" },
  { file: "src/components/ui/dropdown-menu.tsx", klass: "slide-in-from-top-2", reason: "per-side entry animation of a portal menu; the anchor side is physical" },
  { file: "src/components/ui/dropdown-menu.tsx", klass: "slide-in-from-bottom-2", reason: "per-side entry animation of a portal menu; the anchor side is physical" },
  { file: "src/components/ui/popover.tsx", klass: "slide-in-from-right-2", reason: "per-side entry animation of a portal popover; the anchor side is physical" },
  { file: "src/components/ui/popover.tsx", klass: "slide-in-from-left-2", reason: "per-side entry animation of a portal popover; the anchor side is physical" },
  { file: "src/components/ui/popover.tsx", klass: "slide-in-from-top-2", reason: "per-side entry animation of a portal popover; the anchor side is physical" },
  { file: "src/components/ui/popover.tsx", klass: "slide-in-from-bottom-2", reason: "per-side entry animation of a portal popover; the anchor side is physical" },
  // The radio indicator dot is centered in the item: top-1/2 left-1/2 with a
  // -50% translate — symmetric centering, like the dialog.
  { file: "src/components/ui/radio-group.tsx", klass: "left-1/2", reason: "symmetric centering of the indicator dot (top/left 50% + translate -50%)" },
];

/** Files to scan: everything under src/components except ui/, plus the
 * known-used ui files. Sorted for a deterministic report. */
function scanFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (resolve(p) === resolve(ROOT, "src/components/ui")) continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(relative(ROOT, p));
      }
    }
  };
  walk(join(ROOT, "src/components"));
  for (const f of KNOWN_USED_UI) {
    const p = `src/components/ui/${f}`;
    if (existsSync(join(ROOT, p)) && !files.includes(p)) files.push(p);
  }
  return files.sort();
}

/** The maximal className-ish token around a match, so the report shows the
 * full utility ("sm:ml-2", "data-[side=left]:slide-in-from-right-2"), not a
 * fragment of it. */
function classAround(line, idx) {
  let s = idx;
  let e = idx;
  while (s > 0 && !/[\s"'`]/.test(line[s - 1])) s -= 1;
  while (e < line.length && !/[\s"'`]/.test(line[e])) e += 1;
  return line.slice(s, e);
}

function isCommentOnly(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/");
}

function staticScan() {
  const hits = [];
  const allowed = [];
  const seen = new Set();
  for (const file of scanFiles()) {
    const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isCommentOnly(line)) return;
      for (const { re, why } of [...CLASS_PATTERNS, ...STYLE_PATTERNS]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const klass = classAround(line, m.index);
          const key = `${file}:${i + 1}:${klass}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const entry = ALLOWLIST.find(
            (a) => a.file === file && (a.klass === klass || klass.endsWith(":" + a.klass)),
          );
          if (entry) allowed.push({ file, line: i + 1, klass, why, reason: entry.reason });
          else hits.push({ file, line: i + 1, klass, why });
        }
      }
    });
  }
  return { hits, allowed };
}

// ---------------------------------------------------------------------------
// Part 2 — rendered audit (own throwaway Chromium, CDP over WebSocket)
// ---------------------------------------------------------------------------

/** The RTL pair the download state audits. Chosen from src/lib/engines.ts by
 * grep: from English, pes_Arab routes to Bergamot "en-fa" (~22 MB — the
 * smallest RTL route), urd_Arab to IndicTrans2 (~295 MB), heb_Hebr to a
 * 148 MB opus conversion and arb_Arab to a 112 MB opus model. Persian via
 * Bergamot is the smallest download and the fastest state to sample. */
const AUDIT_PAIR = { english: "Persian", native: "فارسی", gridNative: "پښتو" };

/** Find a Chromium to launch: the Playwright cache first (what agent-browser
 * installs on this machine), then the headless shell, then system installs. */
function findChromeBin() {
  const cands = [];
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    const entries = readdirSync(cache).sort().reverse();
    for (const e of entries) {
      if (e.startsWith("chromium-")) {
        for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
          if (existsSync(join(cache, e, sub))) cands.push(join(cache, e, sub));
        }
      }
    }
    for (const e of entries) {
      if (e.startsWith("chromium_headless_shell-")) {
        for (const sub of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-headless-shell-linux/chrome-headless-shell"]) {
          if (existsSync(join(cache, e, sub))) cands.push(join(cache, e, sub));
        }
      }
    }
  }
  for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium"]) {
    if (existsSync(p)) cands.push(p);
  }
  return cands[0] ?? null;
}

/** Raw CDP over WebSocket — the same helper browser-measure.mjs uses. */
function cdp(wsUrl, callTimeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          const timer = setTimeout(() => { pending.delete(mid); rej(new Error(`TIMEOUT ${method}`)); }, callTimeoutMs);
          pending.set(mid, { res, rej, timer });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error("ws error"));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code ?? ""})`));
        else res(msg.result);
      }
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The in-page DOM walk: every text node with an English run (3+ consecutive
 * ASCII letters) or a number+unit run, checked against the effective
 * direction chain — the nearest ancestor establishing rtl (a dir="rtl"
 * attribute or a computed direction: rtl), and whether anything isolates the
 * text from it (dir="ltr", <bdi>, or unicode-bidi: isolate* in between). */
const WALK = String.raw`
(rootSelector) => {
  const root = document.querySelector(rootSelector);
  if (!root) return { error: 'no root for ' + rootSelector };
  const flags = [];
  let rtlElements = 0;
  const isoBidi = /isolate|plaintext/;
  const numUnit = /(\d[\d.,]*)\s*(MB|GB|KB|B\b|s\b|min\b|seconds|minutes|MB\/s)/;
  const englishRun = /[A-Za-z]{3}/;
  const dirOf = (el) => (el.getAttribute && el.getAttribute('dir')) || null;
  function selectorOf(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.body && parts.length < 4) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (n.parentElement) {
        const same = Array.from(n.parentElement.children).filter((c) => c.tagName === n.tagName);
        if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }
  function rtlLeak(node) {
    const chain = [];
    for (let el = node.parentElement; el && el.nodeType === 1; el = el.parentElement) {
      chain.push(el);
      if (chain.length > 64) break;
    }
    let rtlIdx = -1;
    for (let i = 0; i < chain.length; i++) {
      if (dirOf(chain[i]) === 'rtl' || getComputedStyle(chain[i]).direction === 'rtl') { rtlIdx = i; break; }
    }
    if (rtlIdx === -1) return null;
    for (let i = 0; i < rtlIdx; i++) {
      const el = chain[i];
      if (dirOf(el) === 'ltr') return null;
      if (el.tagName === 'BDI') return null;
      if (isoBidi.test(getComputedStyle(el).unicodeBidi || '')) return null;
    }
    return chain[rtlIdx];
  }
  for (const el of root.querySelectorAll('*')) {
    if (dirOf(el) === 'rtl' || getComputedStyle(el).direction === 'rtl') rtlElements++;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue;
    if (!t || !t.trim()) continue;
    const isEnglish = englishRun.test(t);
    const isNumberUnit = numUnit.test(t);
    if (!isEnglish && !isNumberUnit) continue;
    if (!rtlLeak(n)) continue;
    flags.push({
      kind: isEnglish ? 'english-under-rtl' : 'number-unit-under-rtl',
      text: t.trim().replace(/\s+/g, ' ').slice(0, 80),
      selector: selectorOf(n.parentElement),
      parentTag: n.parentElement ? n.parentElement.tagName.toLowerCase() : null,
    });
  }
  return { flags, rtlElements };
}`;

/** Rendered-scope allowlist: walk hits that are recorded as intentional,
 * applied in Node after the walk returns so the walk itself stays exactly
 * the strict spec. */
const RENDERED_ALLOWLIST = [
  {
    test: (f) => f.parentTag === "button" && /^[A-Za-z][A-Za-z\s]*$/.test(f.text),
    reason:
      "setup-card button labels inside the rtl pane: pure-English runs with no digits or " +
      "punctuation render identically under rtl (a single LTR bidi run); kept physical by " +
      'the P14 plan (19-a: "buttons ... deliberately untouched")',
  },
];

/** One sample of the setup card (scoped to the output pane's scroll
 * container, where the card lives) while a pair sets up. An arrow function
 * expression, NOT an IIFE — so callers embed it as `(${SNAPSHOT})()`. */
const SNAPSHOT = String.raw`
(() => {
  const pane = document.querySelector('#tool div[aria-label="Translation"]');
  if (!pane) return { pane: false };
  const ps = Array.from(pane.querySelectorAll('p'));
  const progressLine = ps.find((p) => /\d[\d.,]*\s*MB of \d[\d.,]*\s*MB/.test(p.textContent)) || null;
  const numbersLine = ps.find((p) => /elapsed\s*$/.test(p.textContent.trim())) || null;
  const indicator = pane.querySelector('[data-slot="progress-indicator"]');
  const track = pane.querySelector('[data-slot="progress"]');
  let ratio = null;
  if (indicator && track) {
    const i = indicator.getBoundingClientRect();
    const t = track.getBoundingClientRect();
    if (t.width > 0) ratio = i.width / t.width;
  }
  const buttons = Array.from(pane.querySelectorAll('button')).map((b) => b.textContent.trim());
  const h3 = pane.querySelector('h3');
  const danger = ps.find((p) => (p.className || '').includes('text-danger'));
  return {
    pane: true,
    progressText: progressLine ? progressLine.textContent : null,
    progressBdis: progressLine ? Array.from(progressLine.querySelectorAll('bdi')).map((b) => b.textContent) : [],
    numbersText: numbersLine ? numbersLine.textContent : null,
    numbersBdis: numbersLine ? Array.from(numbersLine.querySelectorAll('bdi')).map((b) => b.textContent) : [],
    indicatorRatio: ratio,
    heading: h3 ? h3.textContent : null,
    setupButton: buttons.includes('Set up now'),
    cancelButton: buttons.includes('Cancel'),
    errorText: danger ? danger.textContent : null,
  };
})`;

async function evalPage(conn, expression, timeoutMs = 30_000) {
  const r = await conn.send("Runtime.evaluate", { expression, returnByValue: true }, timeoutMs);
  if (r.exceptionDetails) {
    throw new Error(`page eval failed: ${String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 300)}`);
  }
  return r.result?.value;
}

async function waitFor(conn, expression, label, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const v = await evalPage(conn, expression, 10_000);
      if (v) return v;
    } catch (e) {
      lastError = e;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timeout waiting for ${label}${lastError ? ` (last error: ${lastError.message.slice(0, 120)})` : ""}`);
}

// ---------------------------------------------------------------------------
// The audit itself
// ---------------------------------------------------------------------------

const flags = [];
const notes = [];
const statesAudited = [];
const flag = (category, detail) => flags.push({ category, detail });
const note = (text) => notes.push(text);

function recordWalk(label, result) {
  if (!result || result.error) {
    flag("walk-failed", `${label}: ${result ? result.error : "no result"}`);
    return;
  }
  let real = 0;
  for (const f of result.flags) {
    const allowed = RENDERED_ALLOWLIST.find((a) => a.test(f));
    if (allowed) {
      note(`${label}: allowlisted hit "${f.text}" @ ${f.selector} — ${allowed.reason}`);
    } else {
      flag(f.kind, `${label}: "${f.text}" @ ${f.selector}`);
      real += 1;
    }
  }
  statesAudited.push(`${label} — ${result.rtlElements} rtl element(s), ${result.flags.length} raw walk hit(s)`);
}

async function runRenderedAudit() {
  const bin = findChromeBin();
  if (!bin) throw new Error("no Chromium found (looked in ~/.cache/ms-playwright and /usr/bin)");

  const userDataDir = mkdtempSync(join(tmpdir(), "rtl-audit-"));
  const proc = spawn(
    bin,
    [
      "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      `--user-data-dir=${userDataDir}`, "--remote-debugging-port=0", "about:blank",
    ],
    { stdio: "ignore" },
  );
  let browserConn = null;
  let pageConn = null;
  try {
    const port = await waitForFile(join(userDataDir, "DevToolsActivePort"), 20_000);
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    browserConn = await cdp(version.webSocketDebuggerUrl);
    const { targetId } = await browserConn.send("Target.createTarget", { url: "about:blank" });
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = list.find((t) => t.id === targetId);
    if (!target) throw new Error("created target not found in /json/list");
    pageConn = await cdp(target.webSocketDebuggerUrl);
    const conn = pageConn;

    await conn.send("Page.enable");
    await conn.send("Runtime.enable");
    // A desktop viewport, so the target picker uses the popover (not the
    // mobile bottom sheet) — the surface this audit walks.
    await conn.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await conn.send("Page.navigate", { url: APP });
    const $ = (expr, timeout) => evalPage(conn, expr, timeout);

    // ---- Step 1: the LTR baseline (default English -> French) --------------
    await waitFor(conn, `!!document.querySelector('#tool') && !!document.querySelector('#source-input')`, "#tool hydrated", 60_000, 300);
    await sleep(1200); // let hydration settle
    const ltrWalk = await $(`(${WALK})('body')`);
    recordWalk("LTR baseline: / (English to French)", ltrWalk);
    // Baseline sanity: no English or number+unit text may sit under rtl on
    // the default page. (The page is not free of rtl elements by design —
    // the language grid's native-name spans carry their own dir — so the
    // invariant is zero raw walk hits, not zero rtl elements.)
    if (ltrWalk.flags.length > 0) {
      flag("ltr-baseline", `the default LTR page produced ${ltrWalk.flags.length} raw walk hit(s); see the walk flags above`);
    }
    // Informational (the 19-c question): the input textarea's computed
    // line-height with English as the source.
    const taInfo = await $(String.raw`
      (() => {
        const ta = document.getElementById('source-input');
        if (!ta) return null;
        const cs = getComputedStyle(ta);
        const fs = parseFloat(cs.fontSize) || 1;
        return {
          lineHeight: cs.lineHeight,
          fontSize: cs.fontSize,
          ratio: cs.lineHeight === 'normal' ? null : Math.round((parseFloat(cs.lineHeight) / fs) * 1000) / 1000,
          hasLeadingClass: /\bleading-/.test(ta.className || ''),
          classes: (ta.className || '').trim(),
        };
      })()`);
    if (taInfo) {
      notes.push(
        `input textarea (English source): computed line-height ${taInfo.lineHeight} at font-size ${taInfo.fontSize} (ratio ${taInfo.ratio}); ` +
        `leading-* class on it: ${taInfo.hasLeadingClass}; classes: "${taInfo.classes}"`,
      );
    }

    // ---- Step 2: the RTL grid route to Pashto ------------------------------
    const clickedPashto = await $(String.raw`
      (() => {
        for (const b of document.querySelectorAll('#languages button')) {
          const native = b.querySelector('span[lang][dir]');
          if (native && native.textContent.trim() === ${JSON.stringify(AUDIT_PAIR.gridNative)}) {
            b.scrollIntoView({ block: 'center' });
            b.click();
            return true;
          }
        }
        return false;
      })()`);
    if (!clickedPashto) throw new Error("Pashto cell not found in the language grid");
    await waitFor(
      conn,
      `!!document.querySelector('#tool div[dir="rtl"]') && !!Array.from(document.querySelectorAll('#tool h3')).find((h) => h.textContent.includes('needs the full model'))`,
      "experimental notice inside the rtl output pane",
      30_000,
    );
    await sleep(400);
    // The notice's English lines must each be isolated — dir="ltr" on their
    // own elements, the 19-a fix. (Buttons are the recorded exception.)
    const notice = await $(String.raw`
      (() => {
        const rtl = document.querySelector('#tool div[dir="rtl"]');
        if (!rtl) return null;
        return Array.from(rtl.querySelectorAll('h3, p')).map((el) => ({
          tag: el.tagName, dir: el.getAttribute('dir'), text: el.textContent.trim().slice(0, 60),
        }));
      })()`);
    if (!notice) {
      flag("notice-isolation", "no rtl output pane found after picking Pashto");
    } else {
      for (const el of notice) {
        if (el.dir !== "ltr") flag("notice-isolation", `experimental notice ${el.tag} "${el.text}" has dir="${el.dir}", expected dir="ltr"`);
      }
    }
    // The grid cell: the native span carries lang+dir; the English name and
    // the cost note next to it must NOT inherit rtl.
    const grid = await $(String.raw`
      (() => {
        for (const b of document.querySelectorAll('#languages button')) {
          const native = b.querySelector('span[lang][dir]');
          if (!native || native.textContent.trim() !== ${JSON.stringify(AUDIT_PAIR.gridNative)}) continue;
          const spans = Array.from(b.querySelectorAll('span'));
          const english = spans.find((s) => s !== native && s.textContent.trim() === 'Pashto') || null;
          const note = spans.find((s) => s !== native && s !== english && s.className.includes('type-small')) || null;
          const underRtl = (el) => {
            for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
              const d = a.getAttribute('dir');
              if (d === 'rtl') return true;
              if (d === 'ltr' || a.tagName === 'BDI') return false;
            }
            return false;
          };
          return {
            nativeLang: native.getAttribute('lang'), nativeDir: native.getAttribute('dir'),
            buttonDir: b.getAttribute('dir'),
            englishDir: english ? english.getAttribute('dir') : 'missing',
            englishUnderRtl: english ? underRtl(english) : null,
            noteUnderRtl: note ? underRtl(note) : null,
            noteText: note ? note.textContent.trim().slice(0, 60) : null,
          };
        }
        return null;
      })()`);
    if (!grid) {
      flag("grid-structure", "Pashto grid cell not found for the structure check");
    } else {
      if (grid.nativeDir !== "rtl" || !grid.nativeLang) flag("grid-structure", `Pashto native span lang=${grid.nativeLang} dir=${grid.nativeDir}, expected lang present + dir="rtl"`);
      if (grid.buttonDir !== null) flag("grid-structure", `grid cell button carries dir="${grid.buttonDir}"; only the native name span should`);
      if (grid.englishDir !== null) flag("grid-structure", `English name span carries dir="${grid.englishDir}" (the grid cell must stay LTR)`);
      if (grid.englishUnderRtl) flag("grid-structure", "English name inherits rtl from an ancestor");
      if (grid.noteUnderRtl) flag("grid-structure", `cost note "${grid.noteText}" inherits rtl from an ancestor`);
    }
    recordWalk("RTL grid route: Pashto experimental notice", await $(`(${WALK})('body')`));

    // The target picker popover, with its RTL rows.
    await $(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Choose the target language"]'); if (!b) return false; b.click(); return true; })()`);
    await waitFor(conn, `!!document.querySelector('[cmdk-root]')`, "target picker popover", 15_000);
    await sleep(500);
    const rows = await $(String.raw`
      (() => {
        const wanted = ['Arabic', 'Hebrew', 'Persian', 'Urdu'];
        const out = [];
        for (const item of document.querySelectorAll('[cmdk-item]')) {
          const label = item.getAttribute('aria-label') || '';
          const english = label.split(',')[0];
          if (!wanted.includes(english)) continue;
          const native = item.querySelector('span[lang][dir]');
          const englishSpan = Array.from(item.querySelectorAll('span')).find((s) => s.textContent.trim() === english) || null;
          out.push({
            english,
            nativeLang: native ? native.getAttribute('lang') : null,
            nativeDir: native ? native.getAttribute('dir') : null,
            itemDir: item.getAttribute('dir'),
            englishDir: englishSpan ? englishSpan.getAttribute('dir') : 'missing',
          });
        }
        return out;
      })()`);
    if (!rows || rows.length === 0) {
      flag("picker-structure", "no RTL rows found in the target picker popover");
    } else {
      for (const row of rows) {
        if (row.nativeDir !== "rtl" || !row.nativeLang) flag("picker-structure", `${row.english} row: native span lang=${row.nativeLang} dir=${row.nativeDir}`);
        if (row.itemDir !== null) flag("picker-structure", `${row.english} row: the row itself carries dir="${row.itemDir}"`);
        if (row.englishDir !== null) flag("picker-structure", `${row.english} row: English name span carries dir="${row.englishDir}"`);
      }
    }
    recordWalk("RTL target picker popover", await $(`(${WALK})('[cmdk-root]')`));

    // ---- Step 3: a real small-model RTL pair, downloading ------------------
    // Persian through the picker UI (the picker is still open from step 2).
    const clickedPersian = await $(String.raw`
      (() => {
        for (const item of document.querySelectorAll('[cmdk-item]')) {
          if ((item.getAttribute('aria-label') || '').startsWith(${JSON.stringify(AUDIT_PAIR.english + ",")})) {
            item.click();
            return true;
          }
        }
        return false;
      })()`);
    if (!clickedPersian) throw new Error("Persian row not found in the target picker");
    await waitFor(
      conn,
      `(() => { const s = (${SNAPSHOT})(); return s.pane && s.setupButton && /English to Persian/.test(s.heading || ''); })()`,
      "Persian offer state (Set up now)",
      30_000,
    );
    await sleep(300);
    recordWalk("RTL offer state: English to Persian", await $(`(${WALK})('#tool')`));

    // Set up now, then sample while it downloads.
    await $(String.raw`
      (() => { const b = Array.from(document.querySelectorAll('#tool button')).find((x) => x.textContent.trim() === 'Set up now'); if (!b) return false; b.click(); return true; })()`);

    const stepDeadline = Date.now() + 120_000;
    let sample = null;            // the progress-line sample the assertions run on
    let numbersSample = null;     // the numbers-line sample (prefer 2+ parts)
    let walkedDuringDownload = false;
    let hadProgress = false;
    let completedNote = null;
    while (Date.now() < stepDeadline) {
      const s = await $(`(${SNAPSHOT})()`);
      if (!s || !s.pane) throw new Error("the output pane disappeared before any sample");
      const progressValid = !!s.progressText && /^\s*[\d.,]+ MB of [\d.,]+ MB\s*$/.test(s.progressText);
      if (progressValid) {
        hadProgress = true;
        if (!walkedDuringDownload) {
          recordWalk("RTL downloading state: English to Persian", await $(`(${WALK})('#tool')`));
          walkedDuringDownload = true;
        }
        // Prefer a sample with bytes still missing: it exercises the ratio
        // and the not-full-while-incomplete assertions.
        const m = s.progressText.match(/([\d.,]+) MB of ([\d.,]+) MB/);
        const loaded = m ? Number(m[1].replace(/,/g, "")) : 0;
        const total = m ? Number(m[2].replace(/,/g, "")) : 0;
        if (!sample || (loaded > 0 && total - loaded >= 1)) sample = s;
        if (s.numbersText && /elapsed\s*$/.test(s.numbersText) && (!numbersSample || (s.numbersBdis || []).length >= 2)) {
          numbersSample = s;
        }
        if (numbersSample && (numbersSample.numbersBdis || []).length >= 2) break;
      } else if (hadProgress) {
        // The downloading stage ended (initializing/ready/error) — sample
        // whatever was captured.
        completedNote = "the downloading stage ended before a full numbers-line sample";
        break;
      }
      if (!s.setupButton && !s.cancelButton && !s.progressText) {
        completedNote = `setup left the card early (error text: ${s.errorText ? JSON.stringify(s.errorText.slice(0, 80)) : "none"})`;
        break;
      }
      if (s.errorText && !s.cancelButton && !s.progressText) {
        completedNote = `setup errored: ${JSON.stringify(s.errorText.slice(0, 80))}`;
        break;
      }
      await sleep(400);
    }

    if (sample) {
      // The progress line: logical order, built from isolated parts.
      if (!/^\s*[\d.,]+ MB of [\d.,]+ MB\s*$/.test(sample.progressText)) {
        flag("progress-line-order", `progress line "${sample.progressText}" does not match /^[\\d.,]+ MB of [\\d.,]+ MB$/`);
      }
      if ((sample.progressBdis || []).length !== 2) {
        flag("progress-line-order", `progress line has ${(sample.progressBdis || []).length} bdi parts, expected 2 (loaded MB, total MB)`);
      }
      // The numbers line: ", " separators, the elapsed clock at the end.
      const n = numbersSample ?? (sample.numbersText ? sample : null);
      if (!n || !n.numbersText) {
        note("the numbers line never appeared while sampling (download too fast or its parts were empty)");
      } else {
        if (!/elapsed\s*$/.test(n.numbersText)) {
          flag("numbers-line-order", `numbers line "${n.numbersText}" does not end with the elapsed clock`);
        }
        const bdis = n.numbersBdis || [];
        if (bdis.length >= 2) {
          if (!n.numbersText.includes(", ")) {
            flag("numbers-line-order", `numbers line "${n.numbersText}" has ${bdis.length} parts but no ", " separators`);
          }
          if (!/elapsed\s*$/.test(bdis[bdis.length - 1] || "")) {
            flag("numbers-line-order", `the last numbers part is "${bdis[bdis.length - 1]}", expected the elapsed clock`);
          }
        } else {
          note(`the numbers line had a single part while sampling: "${n.numbersText.trim()}"`);
        }
      }
      // The progress indicator: the fill must match loaded/total and must
      // not read full while bytes are still missing.
      const m = sample.progressText.match(/([\d.,]+) MB of ([\d.,]+) MB/);
      if (m && sample.indicatorRatio != null) {
        const loaded = Number(m[1].replace(/,/g, ""));
        const total = Number(m[2].replace(/,/g, ""));
        const ratio = sample.indicatorRatio;
        if (total > 0 && Math.abs(ratio - loaded / total) > 0.12) {
          flag("progress-ratio", `indicator fills ${(ratio * 100).toFixed(1)}% of the track but loaded/total is ${loaded}/${total} MB (${((loaded / total) * 100).toFixed(1)}%)`);
        }
        if (total - loaded >= 1 && ratio >= 0.995) {
          flag("progress-latch", `indicator is at ${(ratio * 100).toFixed(1)}% while only ${loaded} of ${total} MB are loaded`);
        }
        notes.push(
          `progress sample: "${sample.progressText.trim()}"${sample.numbersText ? ` / "${sample.numbersText.trim()}"` : ""} — ` +
          `indicator at ${(ratio * 100).toFixed(1)}% of the track`,
        );
      } else if (sample.indicatorRatio == null) {
        flag("progress-ratio", "the progress indicator or its track was not measurable in the downloading state");
      }
    } else if (completedNote) {
      note(`download stage not sampled: ${completedNote}`);
    } else {
      note("download stage not sampled within 120 s (no progress line appeared)");
    }
    if (!walkedDuringDownload && sample) {
      recordWalk("RTL downloading state: English to Persian", await $(`(${WALK})('#tool')`));
    }

    // Cancel, and confirm the card returns to the offer state.
    const cancelled = await $(String.raw`
      (() => { const b = Array.from(document.querySelectorAll('#tool button')).find((x) => x.textContent.trim() === 'Cancel'); if (!b) return false; b.click(); return true; })()`);
    if (!cancelled) {
      note("no Cancel button found after the download step (setup may have completed); skipping the cancel check");
    } else {
      await waitFor(
        conn,
        `(() => { const s = (${SNAPSHOT})(); return s.pane && s.setupButton && /English to Persian/.test(s.heading || ''); })()`,
        "offer state after Cancel",
        30_000,
      );
      statesAudited.push("RTL offer state after Cancel — English to Persian");
    }
  } finally {
    try { pageConn?.close(); } catch {}
    try { browserConn?.close(); } catch {}
    try { proc.kill("SIGTERM"); } catch {}
    await sleep(500);
    try { if (proc.exitCode === null) proc.kill("SIGKILL"); } catch {}
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const port = Number(readFileSync(path, "utf8").toString().split("\n")[0]);
        if (Number.isFinite(port)) return resolve(port);
      } catch {}
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${path}`));
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function devServerUp() {
  try {
    const res = await fetch(APP, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const staticResult = staticScan();

console.log("== Part 1: static scan (physical direction utilities) ==");
console.log(`scanned ${scanFiles().length} files under src/components (ui/ excluded except the ${KNOWN_USED_UI.length} known-used files)`);
if (staticResult.hits.length === 0) {
  console.log("no unallowlisted physical utilities found");
} else {
  for (const h of staticResult.hits) console.log(`  FLAG ${h.file}:${h.line}: ${h.klass} — ${h.why}`);
}
if (staticResult.allowed.length > 0) {
  console.log(`allowlisted (${staticResult.allowed.length}, documented intentional):`);
  for (const h of staticResult.allowed) console.log(`  ok   ${h.file}:${h.line}: ${h.klass} — ${h.reason}`);
}

let exitCode = staticResult.hits.length > 0 ? 1 : 0;

if (!(await devServerUp())) {
  console.log("\n== Part 2: rendered audit — SKIPPED ==");
  console.log(`cannot reach ${APP} — start the dev server first: npm run dev`);
  process.exit(2);
}

console.log("\n== Part 2: rendered audit (headless Chromium over CDP) ==");
let auditError = null;
try {
  await runRenderedAudit();
} catch (e) {
  auditError = e;
}

console.log("\n== Summary ==");
if (statesAudited.length > 0) {
  console.log("states audited:");
  for (const s of statesAudited) console.log(`  - ${s}`);
}
if (flags.length === 0) {
  console.log("flags: none");
} else {
  const byCategory = new Map();
  for (const f of flags) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f.detail]);
  console.log(`flags: ${flags.length}`);
  for (const [category, details] of byCategory) {
    console.log(`  [${category}]`);
    for (const d of details) console.log(`    - ${d}`);
  }
}
if (notes.length > 0) {
  console.log("notes:");
  for (const n of notes) console.log(`  - ${n}`);
}
if (auditError) console.log(`\nAUDIT ERROR (could not complete): ${auditError.message}`);

if (auditError) exitCode = 1;
else if (flags.length > 0) exitCode = 1;

console.log(`\n${flags.length === 0 && !auditError ? "PASS" : "FAIL"}`);
process.exit(exitCode);

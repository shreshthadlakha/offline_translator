// P12 browser measurement: drives the REAL app worker (public/translator.worker.js)
// on the app's own origin through CDP, with the full-model (nllb) engine spec,
// recording a per-stage timeline that survives a renderer OOM crash (every
// event is appended to localStorage before the next one, so the log can be
// read back from a reloaded page).
//
// Usage: node scripts/nllb-lean/browser-measure.mjs <disabled|basic> [sentences]
// Requires: agent-browser open http://localhost:3000/robots.txt
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const level = process.argv[2] ?? "disabled";
const SENTENCES = Number(process.argv[3] ?? 3);

const SPEC = {
  id: "nllb-200-distilled-600M",
  kind: "nllb",
  modelId: "Xenova/nllb-200-distilled-600M",
};

function findDebugPort() {
  const dirs = readdirSync("/tmp").filter((d) => d.startsWith("agent-browser-chrome-"));
  for (const dir of dirs) {
    try {
      const port = Number(readFileSync(`/tmp/${dir}/DevToolsActivePort`, "utf8").toString().split("\n")[0]);
      if (Number.isFinite(port)) return port;
    } catch {}
  }
  throw new Error("no DevToolsActivePort found; is agent-browser running?");
}

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

async function getPageTarget(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === "page" && t.url.includes("robots.txt"));
  if (!page) page = list.find((t) => t.type === "page" && t.url.startsWith("http://localhost:3000"));
  if (!page) throw new Error("no page target; run: agent-browser open http://localhost:3000/robots.txt");
  return page;
}

// The in-page driver. Every worker message appends to localStorage BEFORE any
// further work, so a renderer crash loses at most the in-flight event.
const DRIVER = `
async (spec, level, sentenceCount) => {
  const KEY = 'pt-measure-log';
  const log = [];
  localStorage.setItem(KEY, JSON.stringify({ startedAt: new Date().toISOString(), level, spec, log: [] }));
  const append = (entry) => {
    entry.t = Math.round(performance.now());
    log.push(entry);
    try { localStorage.setItem(KEY, JSON.stringify({ startedAt: new Date().toISOString(), level, spec, log })); } catch (e) {}
  };
  append({ ev: 'driver-start' });
  try { await caches.delete('transformers-cache'); append({ ev: 'cache-cleared' }); } catch (e) { append({ ev: 'cache-clear-failed', error: String(e) }); }
  const worker = new Worker('/translator.worker.js', { type: 'module' });
  let readyResolve, readyReject;
  const readyP = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  const outcomes = new Map();
  worker.onmessage = (event) => {
    const m = event.data;
    if (m.type === 'stage') append({ ev: 'stage', stage: m.stage });
    else if (m.type === 'file') append({ ev: 'file', file: m.file, status: m.status, loaded: m.loaded, total: m.total });
    else if (m.type === 'progress') append({ ev: 'progress', loaded: m.loaded, total: m.total });
    else if (m.type === 'hello') append({ ev: 'hello', protocolVersion: m.protocolVersion });
    else if (m.type === 'ready') { append({ ev: 'ready', device: m.device }); readyResolve(m); }
    else if (m.type === 'result') { append({ ev: 'result', id: m.id, ms: m.ms, texts: m.texts }); const o = outcomes.get(m.id); if (o) { outcomes.delete(m.id); o.resolve(m); } }
    else if (m.type === 'error') { append({ ev: 'error', code: m.code, message: m.message, id: m.id }); if (m.id === undefined) { try { readyReject(new Error(m.code + ': ' + m.message)); } catch (e) {} } else { const o = outcomes.get(m.id); if (o) { outcomes.delete(m.id); o.resolve(m); } } }
    else if (m.type === 'stats') append({ ev: 'stats', used: m.used, limit: m.limit });
  };
  worker.onerror = (e) => { append({ ev: 'worker-error', message: String(e.message || 'unknown') }); try { readyReject(new Error('worker error: ' + (e.message || 'unknown'))); } catch (err) {} };
  const post = (msg) => worker.postMessage(msg);
  post({ type: 'hello' });
  post({ type: 'init', engine: spec, src: 'eng_Latn', tgt: 'zul_Latn', device: 'wasm', ...(level ? { graphOptimizationLevel: level } : {}) });
  const sentences = [
    'Good morning.',
    'Where is the nearest pharmacy?',
    'The weather is nice today.',
    'Could you help me carry this upstairs?',
  ].slice(0, sentenceCount);
  const perSentenceMs = [];
  const outputs = [];
  try {
    const ready = await Promise.race([readyP, new Promise((_, rej) => setTimeout(() => rej(new Error('READY TIMEOUT after 420s')), 420000))]);
    append({ ev: 'driver-ready' });
    for (let i = 0; i < sentences.length; i++) {
      const id = 's' + i;
      const o = new Promise((resolve) => outcomes.set(id, { resolve }));
      post({ type: 'translate', id, text: sentences[i], src: 'eng_Latn', tgt: 'zul_Latn', priority: 'manual' });
      const r = await Promise.race([o, new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 300000))]);
      if (r && r.texts) { perSentenceMs.push(r.ms); outputs.push(r.texts[0]); }
      else { perSentenceMs.push(null); outputs.push(null); append({ ev: 'sentence-failed', id, r: String(JSON.stringify(r)).slice(0, 200) }); }
    }
  } catch (e) {
    append({ ev: 'driver-failed', error: String(e && e.message || e) });
  } finally {
    try { worker.terminate(); } catch (e) {}
  }
  const done = { level, perSentenceMs, outputs, logLength: log.length };
  localStorage.setItem('pt-measure-done', JSON.stringify(done));
  return done;
}
`;

const port = findDebugPort();
const page = await getPageTarget(port);
const conn = await cdp(page.webSocketDebuggerUrl);
console.log(`CDP on port ${port}, target ${page.url}`);

const t0 = Date.now();
let result = null;
try {
  const r = await conn.send("Runtime.evaluate", {
    expression: `(${DRIVER})(${JSON.stringify(SPEC)}, ${JSON.stringify(level)}, ${SENTENCES})`,
    awaitPromise: true,
    returnByValue: true,
  }, 600_000);
  if (r.exceptionDetails) {
    console.log("DRIVER EXCEPTION:", String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 400));
  } else {
    result = r.result.value;
  }
} catch (e) {
  console.log("CDP call failed (renderer may have died):", String(e.message).slice(0, 200));
}

const outPath = `scripts/nllb-lean/cache/measure-${level}.json`;
const timelinePath = `scripts/nllb-lean/cache/measure-${level}-timeline.json`;

if (result) {
  console.log(`\nRESULT (${level}):`, JSON.stringify(result, null, 2).slice(0, 1200));
  writeFileSync(outPath, JSON.stringify({ ...result, wallMs: Date.now() - t0 }, null, 2) + "\n");
} else {
  // The renderer died mid-run: read the localStorage log from the (reloaded) page.
  console.log("\nRenderer appears dead — recovering the timeline from localStorage...");
  try {
    const reload = await conn.send("Page.reload", {}, 30_000).catch(() => null);
    await new Promise((r) => setTimeout(r, 4000));
    const read = await conn.send("Runtime.evaluate", {
      expression: `localStorage.getItem('pt-measure-log')`,
      returnByValue: true,
    }, 30_000);
    const timeline = read.result?.value ? JSON.parse(read.result.value) : null;
    if (timeline) {
      writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + "\n");
      console.log(`Recovered ${timeline.log.length} timeline events -> ${timelinePath}`);
      const last = timeline.log.slice(-8);
      for (const e of last) console.log(" ", JSON.stringify(e).slice(0, 160));
    } else {
      console.log("No localStorage timeline recovered (profile may have been reset).");
    }
  } catch (e) {
    console.log("Recovery failed:", String(e.message).slice(0, 200));
  }
}

// Always try to dump the full timeline when the run succeeded, too.
try {
  const read = await conn.send("Runtime.evaluate", {
    expression: `localStorage.getItem('pt-measure-log')`,
    returnByValue: true,
  }, 30_000);
  if (read.result?.value) {
    const timeline = JSON.parse(read.result.value);
    writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + "\n");
    console.log(`Full timeline (${timeline.log.length} events) -> ${timelinePath}`);
    const stageEvents = timeline.log.filter((e) => e.ev === "stage" || e.ev === "ready" || e.ev === "error" || e.ev === "driver-failed");
    for (const e of stageEvents) console.log(" ", JSON.stringify(e));
  }
} catch (e) {
  console.log("Timeline dump failed:", String(e.message).slice(0, 120));
}

conn.close();
process.exit(0);

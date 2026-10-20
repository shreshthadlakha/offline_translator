// Browser driver: runs small/group engines through the REAL app worker bundle
// in the real browser via CDP, so every speed and load number comes from the
// exact code path users get. Requires the dev server on :3000 and an
// agent-browser Chrome with a page open (any page on localhost:3000 works;
// robots.txt is preferred because it runs no app JS).
//
// Resumable in batches of 25 sentences: each CDP call translates one batch and
// returns, the driver merges into the run state and writes it after every
// batch. The worker itself is kept on window.__bmWorker across batches so the
// model is loaded once per chunk (warm loads on later chunks reuse the
// browser's model cache).
//
// Usage: node scripts/benchmark/browser-driver.mjs <statePath> [budgetMs]
import { writeFileSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
const ROOT = (f) => join(__dirname, '..', '..', f);

const statePath = process.argv[2];
const budgetMs = Number(process.argv[3] ?? 480_000);
if (!statePath) { console.error('usage: browser-driver.mjs <statePath> [budgetMs]'); process.exit(2); }
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const { src, tgt, ids, engine } = state;

const sample = JSON.parse(readFileSync(HERE('sample.json'), 'utf8'));
const flores = (code) => readFileSync(ROOT(`scripts/benchmark/data/flores200_dataset/devtest/${code}.devtest`), 'utf8').replace(/\n$/, '').split('\n');
const srcLines = flores(src);

const pending = ids.filter((id) => state.outputs[id] === undefined && state.errors?.[id] === undefined);
console.log(`[browser] ${src}->${tgt} via ${engine.id}: ${pending.length} pending of ${ids.length}`);
if (pending.length === 0) { console.log('[browser] nothing to do'); process.exit(0); }

// --- find the browser's CDP endpoint -------------------------------------------
function findDebugPort() {
  const dirs = readdirSync('/tmp').filter((d) => d.startsWith('agent-browser-chrome-'));
  for (const dir of dirs) {
    try {
      const port = Number(readFileSync(`/tmp/${dir}/DevToolsActivePort`, 'utf8').toString().split('\n')[0]);
      if (Number.isFinite(port)) return port;
    } catch {}
  }
  throw new Error('no DevToolsActivePort found; start agent-browser and open http://localhost:3000/robots.txt');
}

function cdp(wsUrl, callTimeoutMs = 590_000) {
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
    ws.onerror = () => reject(new Error('ws error'));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code ?? ''})`));
        else res(msg.result);
      }
    };
  });
}

async function getPageTarget(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === 'page' && t.url.includes('robots.txt'));
  if (!page) page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:3000'));
  if (!page) throw new Error('no page target; run: agent-browser open http://localhost:3000/robots.txt');
  return page;
}

// --- the in-page driver -----------------------------------------------------------
// Ensures a live worker initialised for THIS engine (kept on window between
// calls), then translates one batch of sentences and returns the results.
const DRIVER = `
async (engineSpec, srcCode, tgtCode, batch, fresh) => {
  if (fresh) {
    try { await caches.delete('transformers-cache'); } catch (e) {}
    try { await caches.delete('pt-indictrans2'); } catch (e) {}
    try { await caches.delete('pt-bergamot'); } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
    // A fresh RUN must not reuse a worker left on the page by an earlier run.
    if (window.__bmCtx) {
      try { window.__bmCtx.worker.terminate(); } catch (e) {}
      window.__bmCtx = null;
    }
  }
  let ctx = window.__bmCtx;
  if (ctx && ctx.worker && (ctx.engineId !== engineSpec.id || ctx.langTag !== (engineSpec.langTag ?? null) || ctx.src !== srcCode || ctx.tgt !== tgtCode)) {
    try { ctx.worker.terminate(); } catch (e) {}
    ctx = null;
    window.__bmCtx = null;
  }
  if (!ctx) {
    const worker = new Worker('/translator.worker.js', { type: 'module' });
    ctx = { worker, engineId: engineSpec.id, langTag: engineSpec.langTag ?? null, src: srcCode, tgt: tgtCode, ready: false, filesBytes: 0, initT0: 0 };
    window.__bmCtx = ctx;
    ctx.waiters = [];
    ctx.outcomes = new Map();
    ctx.timers = new Map();
    ctx.crashed = null;
    const settleReady = () => { const w = ctx.waiters.splice(0); for (const {res, rej} of w) (ctx.ready ? res : rej)(ctx.ready || ctx.crashed); };
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === 'hello') { ctx.hello = m; }
      else if (m.type === 'file' && m.status === 'done') { ctx.filesBytes += (m.total || 0); }
      else if (m.type === 'ready') { ctx.ready = true; settleReady(); }
      else if (m.type === 'result') {
        const o = ctx.outcomes.get(m.id);
        if (o) { clearTimeout(ctx.timers.get(m.id)); ctx.outcomes.delete(m.id); o({ texts: m.texts, ms: m.ms }); }
      } else if (m.type === 'error') {
        if (m.id !== undefined) {
          const o = ctx.outcomes.get(m.id);
          if (o) { clearTimeout(ctx.timers.get(m.id)); ctx.outcomes.delete(m.id); o({ texts: null, error: m.code + ': ' + m.message }); }
        } else if (!ctx.ready) { ctx.crashed = new Error(m.code + ': ' + m.message); settleReady(); }
      }
    };
    worker.onerror = (e) => {
      ctx.crashed = new Error('worker error: ' + (e.message || 'unknown'));
      if (!ctx.ready) settleReady();
      const o = ctx.outcomes.get('__current');
    };
    worker.postMessage({ type: 'hello' });
    const helloOk = await new Promise((res) => {
      const t = setTimeout(() => res(false), 8000);
      const check = () => { if (ctx.hello) { clearTimeout(t); res(ctx.hello.protocolVersion === 7); } else setTimeout(check, 50); };
      check();
    });
    if (!helloOk) throw new Error('protocol handshake failed (rebuild the worker bundle)');
    ctx.initT0 = performance.now();
    worker.postMessage({ type: 'init', engine: engineSpec, src: srcCode, tgt: tgtCode, device: 'wasm' });
    await new Promise((res, rej) => {
      const t = setTimeout(() => { ctx.crashed = ctx.crashed || new Error('ready timeout after 300s'); settleReady(); }, 300000);
      ctx.waiters.push({ res, rej });
      const check = () => { if (ctx.ready || ctx.crashed) { clearTimeout(t); ctx.ready ? res() : rej(ctx.crashed); } else setTimeout(check, 100); };
      check();
    });
    ctx.loadMs = Math.round(performance.now() - ctx.initT0);
    ctx.warm = !fresh;
    ctx.justLoaded = true;
  } else {
    ctx.justLoaded = false; // reusing the live worker: no load happened
  }
  const results = [];
  for (const item of batch) {
    const p = new Promise((resolve) => {
      ctx.outcomes.set(item.id, resolve);
      ctx.timers.set(item.id, setTimeout(() => {
        if (ctx.outcomes.has(item.id)) { ctx.outcomes.delete(item.id); resolve({ texts: null, error: 'sentence timeout 240s' }); }
      }, 240000));
    });
    ctx.worker.postMessage({ type: 'translate', id: item.id, text: item.text, src: srcCode, tgt: tgtCode, priority: 'manual' });
    const r = await p;
    results.push({ id: item.id, text: r.texts ? r.texts[0] : null, ms: r.ms ?? null, error: r.error ?? null });
  }
  return { results, loadMs: ctx.justLoaded ? ctx.loadMs : null, warm: !!ctx.warm, filesBytes: ctx.filesBytes };
}
`;

const port = findDebugPort();
const page = await getPageTarget(port);
const conn = await cdp(page.webSocketDebuggerUrl);
console.log(`[browser] CDP on port ${port}, target ${page.url}`);

async function evalDriver(engineSpec, batch, fresh) {
  const expression = `(${DRIVER})(${JSON.stringify(engineSpec)}, ${JSON.stringify(src)}, ${JSON.stringify(tgt)}, ${JSON.stringify(batch)}, ${fresh ? 'true' : 'false'})`;
  const r = await conn.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}

const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const tStart = Date.now();
const BATCH = 25;
let translated = 0;
const freshRun = Object.keys(state.outputs).length === 0; // first chunk: cold, clear the model cache

const engineSpec = { id: engine.id, kind: engine.kind, modelId: engine.modelId };
if (engine.langTag) engineSpec.langTag = engine.langTag;

for (let i = 0; i < pending.length; i += BATCH) {
  if (Date.now() - tStart > budgetMs) { console.log(`[browser] budget spent after ${translated} sentences`); break; }
  const batch = pending.slice(i, i + BATCH).map((id) => ({ id, text: srcLines[id] }));
  const fresh = freshRun && i === 0;
  let out;
  try {
    out = await evalDriver(engineSpec, batch, fresh);
  } catch (e) {
    console.error(`[browser] BATCH FAILED: ${e.message}`);
    state.updatedAt = new Date().toISOString();
    persist();
    conn.close();
    process.exit(1);
  }
  for (const r of out.results) {
    state.outputs[r.id] = r.text;
    if (r.error) state.errors[r.id] = r.error;
    if (r.ms != null) state.perSentenceMs[r.id] = r.ms;
  }
  if (out.loadMs != null) {
    if (fresh) state.loadMsCold = out.loadMs;
    else state.loadMsWarm = [...(state.loadMsWarm ?? []), out.loadMs];
  }
  if (out.loadMs != null) console.log(`[browser] worker load ${out.loadMs}ms (${fresh ? 'cold' : 'warm'})`);
  if (fresh && out.filesBytes) state.filesBytes = out.filesBytes;
  translated += out.results.length;
  state.updatedAt = new Date().toISOString();
  persist();
  console.log(`[browser] ${translated}/${pending.length} (batch loadMs=${out.loadMs}, filesBytes=${state.filesBytes ?? 0})`);
}

const complete = ids.every((id) => state.outputs[id] !== undefined);
state.complete = complete;
state.updatedAt = new Date().toISOString();
persist();
conn.close();
console.log(`[browser] chunk done: ${translated} translated, complete=${complete}`);
process.exit(0);

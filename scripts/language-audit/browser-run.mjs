// Language audit: run the real app worker bundle in the real browser (CDP),
// one model at a time, and record download size, load time, warm load time,
// per sentence times and outputs for the quality gate.
//
// Usage: node scripts/language-audit/browser-run.mjs <plan.json> [modelIdFilter]
// Resumable: results land in scripts/language-audit/browser-runs.json after
// every model; already-done models are skipped.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const planPath = process.argv[2];
const filter = process.argv[3] ?? null;
if (!planPath) { console.error('usage: browser-run.mjs <plan.json> [modelIdFilter]'); process.exit(2); }
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

// --- find the browser's CDP endpoint ------------------------------------------
function findDebugPort() {
  const dirs = readdirSync('/tmp').filter((d) => d.startsWith('agent-browser-chrome-'));
  for (const dir of dirs) {
    try {
      const port = Number(readFileSync(`/tmp/${dir}/DevToolsActivePort`, 'utf8').toString().split('\n')[0]);
      if (Number.isFinite(port)) return port;
    } catch {}
  }
  throw new Error('no DevToolsActivePort found; is agent-browser running?');
}

function cdp(wsUrl, callTimeoutMs = 900_000) {
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
  // Prefer the robots.txt doc page (no app JS, same origin as the worker).
  let page = list.find((t) => t.type === 'page' && t.url.includes('robots.txt'));
  if (!page) page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:3000'));
  if (!page) throw new Error('no page target; run: agent-browser open http://localhost:3000/robots.txt');
  return page;
}

// --- the in-page test driver ----------------------------------------------------
// Runs inside the page: creates the real worker bundle, drives the protocol,
// returns one JSON result. Group models: the first pair loads the model, the
// rest switch the language tag through init (which must not re-download).
const DRIVER = `
async (test, warmup) => {
  const log = [];
  const result = { id: test.id, modelId: test.modelId, pairs: [], notes: log };
  const clearCache = warmup ? false : true;
  if (clearCache) {
    try { await caches.delete('transformers-cache'); } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
  }
  const worker = new Worker('/translator.worker.js', { type: 'module' });
  result.workerBytesStart = null;
  let readyResolve, readyReject;
  let helloResolve, helloReject;
  const readyPromise = () => new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  const helloPromise = () => new Promise((res, rej) => { helloResolve = res; helloReject = rej; });
  let readyP = readyPromise();
  let helloP = helloPromise();
  let filesBytes = 0;
  let stageTimes = {};
  let stageAt = {};
  const outcomes = new Map(); // id -> {resolve, texts, ms}
  const timers = new Map();
  worker.onmessage = (event) => {
    const m = event.data;
    if (m.type === 'hello') helloResolve(m);
    else if (m.type === 'stage') { stageAt[m.stage] = performance.now(); }
    else if (m.type === 'file' && m.status === 'done') { filesBytes += (m.total || 0); }
    else if (m.type === 'ready') readyResolve(m);
    else if (m.type === 'result') {
      const o = outcomes.get(m.id);
      if (o) { clearTimeout(timers.get(m.id)); outcomes.delete(m.id); o.resolve({ texts: m.texts, ms: m.ms, engineId: m.engineId }); }
    } else if (m.type === 'error' && m.id !== undefined) {
      const o = outcomes.get(m.id);
      if (o) { clearTimeout(timers.get(m.id)); outcomes.delete(m.id); o.resolve({ texts: null, error: m.code + ': ' + m.message }); }
    }
  };
  worker.onerror = (e) => { try { readyReject(new Error('worker error: ' + (e.message || 'unknown'))); } catch (err) {} };
  const post = (msg) => worker.postMessage(msg);
  try {
    post({ type: 'hello' });
    const hello = await Promise.race([helloP, new Promise((_, rej) => setTimeout(() => rej(new Error('hello timeout')), 8000))]);
    if (hello.protocolVersion !== 5) throw new Error('protocol mismatch: ' + hello.protocolVersion + ' (rebuild the worker bundle)');

    for (const pair of test.pairs) {
      const initT0 = performance.now();
      const pReady = readyPromise();
      readyP = pReady;
      post({ type: 'init', engine: { id: test.id, kind: 'opus', modelId: test.modelId, langTag: pair.tag ?? undefined }, src: pair.src, tgt: pair.tgt, device: 'wasm' });
      let ready;
      try {
        ready = await Promise.race([pReady, new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout after 300s')), 300000))]);
      } catch (e) {
        result.pairs.push({ key: pair.key, error: String(e.message || e) });
        continue;
      }
      const loadMs = Math.round(performance.now() - initT0);
      const perSentenceMs = [];
      const outputs = [];
      const errors = [];
      for (let i = 0; i < pair.sentences.length; i++) {
        const id = 't' + i;
        const o = new Promise((resolve) => outcomes.set(id, { resolve }));
        timers.set(id, setTimeout(() => { if (outcomes.has(id)) { outcomes.delete(id); outcomes.get(id); } }, 240000));
        post({ type: 'translate', id, text: pair.sentences[i], src: pair.src, tgt: pair.tgt, priority: 'manual' });
        const r = await o;
        if (r.texts) { outputs.push(r.texts[0]); perSentenceMs.push(r.ms); }
        else { outputs.push(null); errors.push(r.error); perSentenceMs.push(null); }
      }
      result.pairs.push({ key: pair.key, tag: pair.tag ?? null, loadMs, warmup: !!warmup, outputs, errors, perSentenceMs });
      result.filesBytes = filesBytes;
    }
  } catch (e) {
    result.error = String(e.message || e);
  } finally {
    worker.terminate();
  }
  return result;
}
`;

// --- runner ---------------------------------------------------------------------
const outPath = 'scripts/language-audit/browser-runs.json';
const state = existsSync(outPath)
  ? JSON.parse(readFileSync(outPath, 'utf8'))
  : { generatedAt: new Date().toISOString(), models: {} };

const port = findDebugPort();
const page = await getPageTarget(port);
const conn = await cdp(page.webSocketDebuggerUrl);
console.log(`CDP on port ${port}, target ${page.url}`);

async function evalDriver(test, warmup) {
  const expression = `(${DRIVER})(${JSON.stringify(test)}, ${warmup ? 'true' : 'false'})`;
  const r = await conn.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}

for (const test of plan.tests) {
  if (filter && test.modelId !== filter) continue;
  if (state.models[test.id]?.complete && !filter) {
    console.log(`skip ${test.id} (done)`);
    continue;
  }
  console.log(`\n=== ${test.id} (${test.modelId}), ${test.pairs.length} pair(s)`);
  // Cold: fresh download (cache cleared inside the driver).
  const cold = await evalDriver(test, false);
  state.models[test.id] = { ...cold, complete: !cold.error };
  writeFileSync(outPath, JSON.stringify(state, null, 2));
  const okPairs = cold.pairs?.filter((p) => !p.error && !p.errors?.some(Boolean)) ?? [];
  const failedPairs = cold.pairs?.filter((p) => p.error || p.errors?.some(Boolean)) ?? [];
  console.log(`cold: filesBytes=${cold.filesBytes}, pairs ok=${okPairs.length} failed=${failedPairs.length}${cold.error ? ' MODEL ERROR: ' + cold.error : ''}`);
  for (const p of okPairs.slice(0, 3)) {
    const median = p.perSentenceMs.filter(Boolean).sort((a, b) => a - b);
    const med = median.length ? median[Math.floor(median.length / 2)] : null;
    console.log(`  ${p.key}: load ${p.loadMs}ms, median ${med}ms/sentence, out[0]=${JSON.stringify((p.outputs[0] ?? '').slice(0, 60))}`);
  }
  for (const p of failedPairs) console.log(`  FAILED ${p.key}: ${p.error ?? p.errors?.join('; ')}`);

  // Warm load in a fresh worker from the saved files (single-pair models and
  // the first pair of group models measure a real reload).
  if (!cold.error) {
    const warmupTest = { ...test, pairs: [test.pairs[0]] };
    const warm = await evalDriver(warmupTest, true);
    state.models[test.id].warmLoadMs = warm.pairs?.[0]?.loadMs ?? null;
    writeFileSync(outPath, JSON.stringify(state, null, 2));
    console.log(`warm load: ${state.models[test.id].warmLoadMs}ms`);
  }
}

conn.close();
console.log('\nDone. Results in scripts/language-audit/browser-runs.json');
process.exit(0);

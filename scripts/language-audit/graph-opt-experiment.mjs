// B.5 experiment: does the graph optimization level change session creation
// time or peak memory? Runs the real worker bundle in the browser with each
// level, on a small model, twice per level, from the same saved files.
// Usage: node scripts/language-audit/graph-opt-experiment.mjs
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';

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

function cdp(wsUrl, callTimeoutMs = 300_000) {
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
        if (msg.error) rej(new Error(`${msg.error.message}`));
        else res(msg.result);
      }
    };
  });
}

const DRIVER = `
async (level, modelId) => {
  // Fresh worker; the model files are already saved (first call downloads).
  const worker = new Worker('/translator.worker.js', { type: 'module' });
  const result = { level, modelId };
  let readyResolve;
  const readyP = new Promise((res) => { readyResolve = res; });
  const stages = {};
  let stats = null;
  worker.onmessage = (event) => {
    const m = event.data;
    if (m.type === 'stage') stages[m.stage] = performance.now();
    else if (m.type === 'ready') readyResolve(m);
    else if (m.type === 'stats') { result.heapUsed = m.used; result.heapLimit = m.limit; }
  };
  const t0 = performance.now();
  worker.postMessage({ type: 'hello' });
  worker.postMessage({
    type: 'init',
    engine: { id: 'exp', kind: 'opus', modelId },
    src: 'eng_Latn', tgt: 'afr_Latn', device: 'wasm',
    graphOptimizationLevel: level,
  });
  await readyP;
  result.totalMs = Math.round(performance.now() - t0);
  result.stageStarts = Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Math.round(v - t0)]));
  // Session creation window: all files done (initializing) -> testing start.
  if (stages.initializing != null && stages.testing != null) {
    result.sessionCreationMs = Math.round(stages.testing - stages.initializing);
  }
  if (stages.downloading != null && stages.initializing != null) {
    result.filesMs = Math.round(stages.initializing - stages.downloading);
  }
  worker.terminate();
  return result;
}
`;

const port = findDebugPort();
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let page = list.find((t) => t.type === 'page' && t.url.includes('robots.txt')) ?? list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:3000'));
if (!page) throw new Error('open http://localhost:3000/robots.txt first');
const conn = await cdp(page.webSocketDebuggerUrl);

const MODEL = 'Xenova/opus-mt-en-af';
const LEVELS = ['disabled', 'basic', 'all'];
const runs = [];
for (const level of LEVELS) {
  for (let i = 0; i < 2; i++) {
    const expression = `(${DRIVER})(${JSON.stringify(level)}, ${JSON.stringify(MODEL)})`;
    const r = await conn.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? 'eval failed'));
    runs.push(r.result.value);
    const v = r.result.value;
    console.log(`${level} #${i + 1}: total ${v.totalMs}ms, files ${v.filesMs ?? '-'}ms, session creation ${v.sessionCreationMs ?? '-'}ms, heap ${v.heapUsed ? Math.round(v.heapUsed / 1048576) + 'MB' : '-'}`);
  }
}
conn.close();
writeFileSync('scripts/language-audit/graph-opt-results.json', JSON.stringify({ model: MODEL, runs }, null, 2));
console.log('saved scripts/language-audit/graph-opt-results.json');
process.exit(0);

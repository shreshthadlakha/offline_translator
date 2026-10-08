// Query the responsive localhost:3000 target for app + Web Locks state.
const DEBUG_PORT = 40463;

function cdp(wsUrl, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          const timer = setTimeout(() => { pending.delete(mid); rej(new Error(`TIMEOUT ${method}`)); }, timeoutMs);
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
        if (msg.error) rej(new Error(`${msg.error.message}`));
        else res(msg.result);
      }
    };
  });
}

const EXPR = `
(async () => {
  const sec = document.querySelector("section[aria-label=Translation]");
  let locks = "n/a";
  try {
    if (navigator.locks?.query) {
      const s = await navigator.locks.query();
      locks = JSON.stringify(s);
    }
  } catch (e) { locks = "err: " + e.message; }
  return JSON.stringify({
    href: location.href,
    section: sec ? sec.textContent.slice(0, 400) : "NO SECTION",
    crashFlag: localStorage.getItem("pt.setup.crash"),
    modelReady: localStorage.getItem("pt.model.ready"),
    locks,
  });
})()
`;

async function main() {
  const targetId = process.argv[2];
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const t = list.find((x) => x.id.startsWith(targetId));
  if (!t) { console.log("target not found"); process.exit(1); }
  const c = await cdp(t.webSocketDebuggerUrl);
  try {
    const v = await c.send("Runtime.evaluate", { expression: EXPR, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(JSON.parse(v.result.value), null, 2));
  } catch (e) {
    console.log("FAILED:", e.message);
  }
  c.close();
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });

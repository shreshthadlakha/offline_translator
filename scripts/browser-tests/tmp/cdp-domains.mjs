// Probe which CDP domains still respond on the two page targets.
const DEBUG_PORT = 40463;

function cdp(wsUrl, timeoutMs = 6000) {
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

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pages = list.filter((t) => t.type === "page" && t.url.startsWith("http://localhost:3000"));
  for (const t of pages) {
    console.log(`\n=== target ${t.id} ===`);
    const c = await cdp(t.webSocketDebuggerUrl);
    const probes = [
      ["Runtime.enable", {}],
      ["Page.enable", {}],
      ["Page.getFrameTree", {}],
      ["Log.enable", {}],
      ["Runtime.runIfWaitingForDebugger", {}],
      ["Emulation.setFocusEmulationEnabled", { enabled: true }],
      ["Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: false }],
    ];
    for (const [m, p] of probes) {
      try { await c.send(m, p); console.log(`ok    ${m}`); }
      catch (e) { console.log(`FAIL  ${m}: ${e.message}`); }
    }
    c.close();
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });

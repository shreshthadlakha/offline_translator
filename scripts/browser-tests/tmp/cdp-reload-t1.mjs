// Reload the still-hung localhost:3000 target via raw CDP Page.reload.
const DEBUG_PORT = 40463;

function cdp(wsUrl, timeoutMs = 20000) {
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
    let alive = "?";
    try {
      const c = await cdp(t.webSocketDebuggerUrl, 4000);
      try { await c.send("Runtime.evaluate", { expression: "1", returnByValue: true }); alive = "responsive"; }
      catch { alive = "HUNG"; }
      c.close();
    } catch { alive = "connect-fail"; }
    console.log(`target ${t.id}: ${alive}`);
    if (alive === "HUNG") {
      const c = await cdp(t.webSocketDebuggerUrl, 25000);
      try {
        await c.send("Page.reload", { ignoreCache: false });
        console.log(`  -> Page.reload sent OK`);
      } catch (e) {
        console.log(`  -> Page.reload FAILED: ${e.message}`);
      }
      c.close();
    }
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });

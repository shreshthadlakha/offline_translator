// Diagnostic: talk raw CDP to the two localhost:3000 page targets.
const DEBUG_PORT = 40463;

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          const timer = setTimeout(() => { pending.delete(mid); rej(new Error(`timeout: ${method}`)); }, 8000);
          pending.set(mid, { res, rej, timer });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
      events,
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
      } else if (msg.method) {
        events.push(msg.method);
      }
    };
  });
}

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pages = list.filter((t) => t.type === "page" && t.url.startsWith("http://localhost:3000"));
  for (const t of pages) {
    console.log(`\n=== target ${t.id} (${t.url}) ===`);
    try {
      const c = await cdp(t.webSocketDebuggerUrl);
      try {
        const v = await c.send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
        console.log("eval ok:", JSON.stringify(v.result?.value));
      } catch (e) {
        console.log("eval FAILED:", e.message);
      }
      try {
        const tree = await c.send("DOM.getFlattenedDocument", { depth: -1, pierce: false });
        console.log("DOM ok, nodes:", tree.nodes ? "yes" : "?");
      } catch (e) {
        console.log("DOM FAILED:", e.message);
      }
      c.close();
    } catch (e) {
      console.log("connect FAILED:", e.message);
    }
  }
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });

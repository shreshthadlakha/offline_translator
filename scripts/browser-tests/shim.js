(() => {
  const RANK = { manual: 0, sentence: 1, fragment: 2, batch: 3 };
  window.__shimStats = { jobs: [], started: 0, completed: 0, interrupted: 0 };
  class ShimWorker {
    constructor(url, opts) { this.onmessage = null; this.onerror = null; this.queue = []; this.running = null; }
    postMessage(msg) { setTimeout(() => this.handle(msg), 5); }
    handle(msg) {
      if (msg.type === "init") {
        this.onmessage({ data: { type: "ready", device: "wasm" } });
      } else if (msg.type === "translate") {
        this.queue.push({ id: msg.id, text: msg.text, prio: msg.priority, queuedAt: performance.now(), cancelled: false });
        this.pump();
      } else if (msg.type === "cancel") {
        for (const j of this.queue) { if (j.id === msg.id) j.cancelled = true; }
        if (this.running && this.running.id === msg.id) this.running.cancelled = true;
        this.queue = this.queue.filter(j => !j.cancelled);
      }
    }
    pump() {
      if (this.running || this.queue.length === 0) return;
      let best = -1;
      for (let i = 0; i < this.queue.length; i++) {
        const j = this.queue[i];
        if (best === -1 || RANK[j.prio] < RANK[this.queue[best].prio]) best = i;
      }
      const job = this.queue.splice(best, 1)[0];
      job.startedAt = performance.now();
      job.waitedMs = job.startedAt - job.queuedAt;
      this.running = job;
      window.__shimStats.jobs.push(job);
      window.__shimStats.started++;
      const d = window.__shimDelay || 300;
      const finish = () => {
        job.finishedAt = performance.now();
        this.running = null;
        if (job.cancelled) {
          window.__shimStats.interrupted++;
        } else {
          window.__shimStats.completed++;
          this.onmessage({ data: { type: "result", id: job.id, text: "fake: " + job.text, ms: d, queueMs: Math.round(job.waitedMs) } });
        }
        this.pump();
      };
      job.timer = setTimeout(finish, d);
      job.abort = () => { clearTimeout(job.timer); finish(); };
    }
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
  }
  window.Worker = ShimWorker;
  window.__shim = ShimWorker;
  return "serial shim installed";
})()

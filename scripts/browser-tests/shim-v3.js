(() => {
  const BUILD_ID = "202610100906-f99zye";
  const RANK = { manual: 0, sentence: 1, fragment: 2, batch: 3 };
  window.__shimStats = { jobs: [], started: 0, completed: 0, interrupted: 0, inits: [] };
  class ShimWorker {
    constructor(url, opts) {
      this.onmessage = null; this.onerror = null;
      this.queue = []; this.running = null;
      this.engineId = null;
      this.loadTimer = null;
    }
    postMessage(msg) { setTimeout(() => this.handle(msg), 5); }
    handle(msg) {
      if (msg.type === "hello") {
        this.onmessage({ data: { type: "hello", protocolVersion: 3, buildId: BUILD_ID } });
      } else if (msg.type === "init") {
        window.__shimStats.inits.push({ engineId: msg.engine.id, modelId: msg.engine.modelId, at: performance.now() });
        // Simulate a quick load from saved files: stages, file rows, progress.
        const files = [
          { name: "onnx/encoder_model_quantized.onnx", bytes: 60000000 },
          { name: "onnx/decoder_model_merged_quantized.onnx", bytes: 50000000 },
          { name: "tokenizer.json", bytes: 17000000 },
        ];
        this.onmessage({ data: { type: "stage", stage: "downloading" } });
        let loaded = 0;
        const total = files.reduce((s, f) => s + f.bytes, 0);
        files.forEach((f) => this.onmessage({ data: { type: "file", file: f.name, status: "waiting", loaded: 0, total: f.bytes } }));
        let step = 0;
        this.loadTimer = setInterval(() => {
          step += 1;
          const chunk = total / 6;
          loaded = Math.min(total, loaded + chunk);
          files.forEach((f) => this.onmessage({ data: { type: "file", file: f.name, status: loaded >= total ? "done" : "downloading", loaded: Math.min(f.bytes, Math.max(0, loaded - (total - f.bytes))), total: f.bytes } }));
          this.onmessage({ data: { type: "progress", loaded, total } });
          if (loaded >= total) {
            clearInterval(this.loadTimer);
            this.onmessage({ data: { type: "stage", stage: "initializing" } });
            setTimeout(() => {
              this.onmessage({ data: { type: "stage", stage: "testing" } });
              setTimeout(() => {
                this.engineId = msg.engine.id;
                this.onmessage({ data: { type: "ready", device: "wasm", engineId: msg.engine.id } });
                this.pump();
              }, 120);
            }, 200);
          }
        }, 60);
      } else if (msg.type === "translate") {
        const texts = msg.texts ?? (msg.text !== undefined ? [msg.text] : []);
        this.queue.push({ id: msg.id, texts, prio: msg.priority, queuedAt: performance.now(), cancelled: false });
        this.pump();
      } else if (msg.type === "cancel") {
        for (const j of this.queue) { if (j.id === msg.id) j.cancelled = true; }
        if (this.running && this.running.id === msg.id) { this.running.cancelled = true; if (this.running.abort) this.running.abort(); }
        this.queue = this.queue.filter(j => !j.cancelled);
      } else if (msg.type === "ping") {
        this.onmessage({ data: { type: "pong" } });
      } else if (msg.type === "stats") {
        this.onmessage({ data: { type: "stats", used: 900000000, limit: 4000000000, device: "wasm" } });
      }
    }
    pump() {
      if (this.running || this.queue.length === 0 || !this.engineId) return;
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
      const chars = job.texts.reduce((s, t) => s + t.length, 0);
      const finish = () => {
        job.finishedAt = performance.now();
        this.running = null;
        if (job.cancelled) {
          window.__shimStats.interrupted++;
        } else {
          window.__shimStats.completed++;
          this.onmessage({ data: { type: "result", id: job.id, texts: job.texts.map(t => "fake: " + t), ms: d, queueMs: Math.round(job.waitedMs), chars, engineId: this.engineId } });
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
  return "v3 shim installed";
})()

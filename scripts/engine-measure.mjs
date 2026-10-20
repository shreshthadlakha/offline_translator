// Engine measurements outside the browser, on this sandbox's vCPU:
//  - NLLB q8: load time from disk cache, per sentence time on the five built
//    in speed test sentences, with the OLD token budget (min(512, max(80, len)))
//    and the NEW one (1.6 * source tokens + 8, capped at 200).
//  - opus-mt-en-fr q8: load time, per sentence time, and batch throughput at
//    1, 4 and 8 sentences per call.
// Usage: MALLOC_ARENA_MAX=2 node scripts/engine-measure.mjs
// Run alone: the NLLB load peaks near 2.8 GB RSS here.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);
env.cacheDir = HERE("quality-gate/.cache");
try {
  writeFileSync("/proc/self/oom_score_adj", "1000");
} catch {}

const SPEED_SENTENCES = [
  "Good morning.",
  "The train leaves at ten past noon.",
  "Could you help me carry this upstairs?",
  "I would like to book a table for two tonight.",
  "The children were playing in the garden while their grandmother watched from the window.",
];

function rssMB() {
  return Math.round(process.memoryUsage().rss / 1e6);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = { generatedAt: new Date().toISOString(), machine: "sandbox 4GB, wasm/numa vCPU" };

async function measureNllb() {
  console.error("[nllb] loading (q8, from disk cache)...");
  const t0 = performance.now();
  const translator = await pipeline("translation", "Xenova/nllb-200-distilled-600M", {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, graphOptimizationLevel: "basic", enableMemPattern: false },
  });
  const loadTime = (performance.now() - t0) / 1000;
  console.error(`[nllb] loaded in ${loadTime.toFixed(1)}s, rss=${rssMB()}MB`);
  results.nllb = { loadFromCacheSeconds: Number(loadTime.toFixed(2)), rssAfterLoadMB: rssMB() };

  // Warm up with one short sentence so the first measured sentence isn't
  // paying one time costs.
  await translator("Hello.", { src_lang: "eng_Latn", tgt_lang: "fra_Latn", max_new_tokens: 24 });

  const budgets = {
    old: (text) => Math.min(512, Math.max(80, text.length)),
    new: (text) => {
      const tokens = translator.tokenizer.encode(text, { add_special_tokens: false }).length;
      return Math.min(200, Math.max(12, Math.round(1.6 * tokens + 8)));
    },
  };
  for (const [label, budgetOf] of Object.entries(budgets)) {
    const times = [];
    for (const text of SPEED_SENTENCES) {
      const started = performance.now();
      await translator(text, { src_lang: "eng_Latn", tgt_lang: "fra_Latn", max_new_tokens: budgetOf(text) });
      times.push((performance.now() - started) / 1000);
    }
    results.nllb[label] = {
      perSentenceSeconds: times.map((t) => Number(t.toFixed(2))),
      medianSecondsPerSentence: Number(median(times).toFixed(2)),
    };
    console.error(`[nllb] ${label} budget: median ${median(times).toFixed(2)}s/sentence`);
  }
  await translator.dispose();
  await sleep(500);
  console.error(`[nllb] disposed, rss=${rssMB()}MB`);
  results.nllb.rssAfterDisposeMB = rssMB();
}

async function measureOpus() {
  console.error("[opus-en-fr] loading (q8)...");
  const t0 = performance.now();
  const translator = await pipeline("translation", "Xenova/opus-mt-en-fr", {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, graphOptimizationLevel: "basic", enableMemPattern: false },
  });
  const coldLoad = (performance.now() - t0) / 1000;
  console.error(`[opus-en-fr] loaded in ${coldLoad.toFixed(1)}s, rss=${rssMB()}MB`);

  await translator("Hello.", { max_new_tokens: 24 });

  // One sentence per call.
  const one = [];
  for (const text of SPEED_SENTENCES) {
    const started = performance.now();
    await translator(text, { max_new_tokens: 40 });
    one.push((performance.now() - started) / 1000);
  }

  // Batches of 4 and 8: the same 8 sentences, grouped. Timing is per call,
  // divided by the group size for a per sentence figure.
  const batchTexts = [...SPEED_SENTENCES, "Where is the nearest pharmacy?", "I forgot my umbrella at the office."];
  const tokenBudget = (texts) => {
    let max = 12;
    for (const text of texts) {
      const tokens = translator.tokenizer.encode(text, { add_special_tokens: false }).length;
      max = Math.max(max, Math.min(200, Math.round(1.6 * tokens + 8)));
    }
    return max;
  };
  const batchMeasure = async (size) => {
    const perCall = [];
    for (let i = 0; i < batchTexts.length; i += size) {
      const group = batchTexts.slice(i, i + size);
      const started = performance.now();
      await translator(group, { max_new_tokens: tokenBudget(group) });
      perCall.push((performance.now() - started) / 1000);
    }
    const total = perCall.reduce((a, b) => a + b, 0);
    return { perCallSeconds: perCall.map((t) => Number(t.toFixed(2))), perSentenceSeconds: Number((total / batchTexts.length).toFixed(3)) };
  };
  const four = await batchMeasure(4);
  const eight = await batchMeasure(8);

  results.opusEnFr = {
    loadSeconds: Number(coldLoad.toFixed(2)),
    rssAfterLoadMB: rssMB(),
    one: { perSentenceSeconds: one.map((t) => Number(t.toFixed(2))), medianSecondsPerSentence: Number(median(one).toFixed(2)) },
    batch4: four,
    batch8: eight,
  };
  console.error(`[opus-en-fr] 1/call median ${median(one).toFixed(2)}s, 4/call ${four.perSentenceSeconds}s/sentence, 8/call ${eight.perSentenceSeconds}s/sentence`);
  await translator.dispose();
  await sleep(500);
  results.opusEnFr.rssAfterDisposeMB = rssMB();
}

await measureOpus();
await measureNllb();

writeFileSync(HERE("engine-measurements.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
process.exit(0);

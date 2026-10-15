/**
 * p5a proof: run the IndicTrans2 int8 bundles on the P1 benchmark sample
 * (200 FLORES-200 devtest sentences) for six directions, score chrF++
 * against the professional human references, compare with the published
 * NLLB-200 distilled 600M baseline using the P2 quality bar, and write
 * proof-results.json.
 *
 * Resumable per direction: state after every sentence.
 * Usage: bun run proof.ts <en-indic|indic-en> [budgetMs]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { IndicTransOnnx, type BundleKey } from "./engine";
import { chrfppCorpus, chrfppCorpusLower, chrfppSentence } from "../benchmark/chrfpp.mjs";
import { sanityFlags } from "../benchmark/sanity.mjs";
import { verdictFor } from "../benchmark/quality-bar.mjs";

const BENCH = path.join(import.meta.dir, "..", "benchmark");
const RUNS = path.join(import.meta.dir, "runs");
mkdirSync(RUNS, { recursive: true });

const DIRECTIONS: Record<BundleKey, Array<{ src: string; tgt: string }>> = {
  "en-indic": [
    { src: "eng_Latn", tgt: "urd_Arab" },
    { src: "eng_Latn", tgt: "tam_Taml" },
    { src: "eng_Latn", tgt: "ben_Beng" },
  ],
  "indic-en": [
    { src: "urd_Arab", tgt: "eng_Latn" },
    { src: "tam_Taml", tgt: "eng_Latn" },
    { src: "ben_Beng", tgt: "eng_Latn" },
  ],
};

function floresLines(code: string): string[] {
  return readFileSync(path.join(BENCH, "data", "flores200_dataset", "devtest", `${code}.devtest`), "utf8")
    .split("\n")
    .filter((_, i, arr) => i < arr.length - 1 || arr[arr.length - 1] !== "");
}

const bundle = (process.argv[2] ?? "en-indic") as BundleKey;
const budgetMs = Number(process.argv[3] ?? 480_000);
const sampleIds: number[] = JSON.parse(readFileSync(path.join(BENCH, "sample.json"), "utf8")).ids;
const baselines = JSON.parse(
  readFileSync(path.join(BENCH, "published-baseline.json"), "utf8"),
).languages;

console.log(`\n########## p5a proof: ${bundle} ##########`);
const engine = new IndicTransOnnx();
const loadStart = performance.now();
await engine.load(bundle);
const loadMs = performance.now() - loadStart;
console.log(`engine loaded in ${(loadMs / 1000).toFixed(1)} s`);

const results: Record<string, unknown>[] = [];
const startedAt = Date.now();

for (const { src, tgt } of DIRECTIONS[bundle]) {
  const key = `${src}-${tgt}`;
  const statePath = path.join(RUNS, `proof-${key}.json`);
  const srcLines = floresLines(src);
  const tgtLines = floresLines(tgt);
  const state = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : { src, tgt, ids: sampleIds, outputs: [], done: 0, errors: [] };
  if (state.done >= state.ids.length) {
    console.log(`  ${key}: already complete (${state.done})`);
  } else {
    console.log(`  ${key}: ${state.done}/${state.ids.length} done, translating ...`);
  }

  let sentenceMs: number[] = [];
  while (state.done < state.ids.length) {
    if (Date.now() - startedAt > budgetMs) {
      console.log(`    time budget spent at ${state.done}/${state.ids.length}; rerun to resume`);
      process.exit(0);
    }
    const idx = state.ids[state.done]!;
    const text = srcLines[idx]!;
    const ref = tgtLines[idx]!;
    try {
      const t0 = performance.now();
      const out = await engine.translate(text, src, tgt);
      const ms = performance.now() - t0;
      sentenceMs.push(ms);
      state.outputs.push(out.text);
    } catch (err) {
      state.outputs.push("");
      state.errors.push({ idx, message: String(err).slice(0, 300) });
    }
    state.done += 1;
    if (state.done % 25 === 0) {
      writeFileSync(statePath, JSON.stringify(state));
      console.log(`    ${state.done}/${state.ids.length}`);
    }
  }
  writeFileSync(statePath, JSON.stringify(state));

  const refs = state.ids.map((i: number) => tgtLines[i]!);
  const hyps = state.outputs as string[];
  const score = chrfppCorpus(hyps, refs);
  const scoreLower = chrfppCorpusLower(hyps, refs);
  const baseline = src === "eng_Latn" ? baselines[tgt].engToX : baselines[src].xToEn;
  const flags = hyps.map((h, i) => sanityFlags(h, refs[i]!, tgt));
  const isFlagged = (f: unknown) => (Array.isArray(f) ? f.length > 0 : Boolean(f));
  const flagRate = flags.filter(isFlagged).length / Math.max(1, hyps.length);
  const gap = score - baseline;
  const verdict = verdictFor(gap, flagRate);
  const perSentence = hyps.map((h, i) => chrfppSentence(h, refs[i]!));
  results.push({
    direction: key,
    engine: `IndicTrans2-distilled-200M-int8 (${bundle}, node harness)`,
    n: hyps.length,
    chrfpp: Number(score.toFixed(2)),
    chrfppLower: Number(scoreLower.toFixed(2)),
    baselineChrfpp: baseline,
    gap: Number(gap.toFixed(2)),
    flagRate: Number(flagRate.toFixed(4)),
    flagged: flags.filter(isFlagged).length,
    verdict,
    errors: state.errors.length,
    sentenceMs: sentenceMs.length
      ? {
          median: Number(sentenceMs.sort((a, b) => a - b)[Math.floor(sentenceMs.length / 2)]!.toFixed(0)),
          p90: Number(sentenceMs[Math.floor(sentenceMs.length * 0.9)]!.toFixed(0)),
          mean: Number((sentenceMs.reduce((a, b) => a + b, 0) / sentenceMs.length).toFixed(0)),
        }
      : null,
    worst: perSentence
      .map((s, i) => ({ s: Number(s.toFixed(1)), i }))
      .sort((a, b) => a.s - b.s)
      .slice(0, 5)
      .map((w) => ({ chrf: w.s, src: srcLines[state.ids[w.i]!]!.slice(0, 90), hyp: hyps[w.i]!.slice(0, 90), ref: refs[w.i]!.slice(0, 90) })),
  });
  console.log(
    `  ${key}: chrF++ ${score.toFixed(2)} vs baseline ${baseline} (gap ${gap.toFixed(2)}), flags ${(flagRate * 100).toFixed(1)}%, verdict ${verdict}`,
  );
}

const outPath = path.join(import.meta.dir, `proof-results-${bundle}.json`);
const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), loadMs: Math.round(loadMs), results }, null, 2),
);
console.log(`\nresults -> ${outPath}`);
void previous;

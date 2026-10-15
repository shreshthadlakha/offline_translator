// P2c report: the variant x direction table, verdict changes, speed cost and
// the per-engine-kind recommendation. Reads benchmark-results.json (the 45
// panel cells), p2c-token-fit.json (task 1) and quality-bar.mjs (the same
// verdict rule as the P2 table). Writes p2c-variant-report.md.
//
// Usage: bun scripts/benchmark/p2c-report.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verdictFor } from './quality-bar.mjs';
import { PANEL, VARIANT_KEYS, VARIANT_LABELS } from './variants.mjs';
import { ENGINE_TABLE } from '../../src/lib/engines.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = (f) => join(__dirname, f);

const results = JSON.parse(readFileSync(HERE('benchmark-results.json'), 'utf8')).results;
const byKey = new Map(results.map((r) => [r.runKey, r]));
const fit = existsSync(HERE('p2c-token-fit.json')) ? JSON.parse(readFileSync(HERE('p2c-token-fit.json'), 'utf8')) : null;

const rows = [];
const missing = [];
for (const d of PANEL) {
  const pair = `${d.src}|${d.tgt}`;
  const engine = ENGINE_TABLE[pair];
  const perVariant = {};
  for (const v of VARIANT_KEYS) {
    const runKey = `${d.src}-${d.tgt}#${engine.id}@${v}`;
    const legacyKey = `${d.src}-${d.tgt}#${engine.id}`;
    const rec = byKey.get(runKey) ?? (v === 'A' ? byKey.get(legacyKey) : undefined);
    if (!rec) { missing.push(runKey); continue; }
    const gap = rec.published ? rec.chrfpp.corpus - rec.published.chrfpp : null;
    perVariant[v] = {
      rec,
      chrf: rec.chrfpp.corpus,
      gap,
      flagRate: rec.sanity.flagRate,
      verdict: verdictFor(gap, rec.sanity.flagRate),
      flagged: rec.sanity.flaggedSentences,
      endsMidWord: rec.sanity.counts.endsMidWord ?? 0,
      repeatLoop: rec.sanity.counts.repeatLoop ?? 0,
      lenRatio: rec.sanity.counts.lenRatio ?? 0,
      median: rec.speed?.medianSecondsPerSentence ?? null,
      source: byKey.get(runKey) ? 'fresh' : 'stored P2/P2b',
    };
  }
  rows.push({ ...d, engine, perVariant });
}

// --- beam identity check: D/E vs B, and C vs B (expected to differ) -----------
function stateFile(runKey) { return HERE(`runs/${runKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`); }
function outputsOf(runKey) {
  const p = stateFile(runKey);
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8'));
  return s.complete ? s.outputs : null;
}
const identity = [];
for (const r of rows) {
  const base = outputsOf(`${r.src}-${r.tgt}#${r.engine.id}@B`);
  if (!base) continue;
  const line = { pair: `${r.src}->${r.tgt}` };
  for (const v of ['C', 'D', 'E']) {
    const outs = outputsOf(`${r.src}-${r.tgt}#${r.engine.id}@${v}`);
    if (!outs) { line[v] = null; continue; }
    let diff = 0;
    for (const id of Object.keys(base)) if (base[id] !== outs[id]) diff++;
    line[v] = diff;
  }
  identity.push(line);
}

// --- table helpers --------------------------------------------------------------
const V = (v) => (v == null ? '·' : v);
const fmtChrf = (c) => (c == null ? '  ·  ' : c.toFixed(1));
const verdictMark = { pass: 'PASS', borderline: 'BORD', fail: 'FAIL', error: 'ERR' };

let md = [];
md.push('# P2c — decoding settings vs small-model quality');
md.push('');
md.push('Every cell: the same 200-sentence FLORES-200 devtest sample as P1/P2/P2b, the real browser worker bundle, the same scoring (chrF++ on the app-visible text, sanity flags on the raw model output) and the same quality bar as the P2 table. Only the decoding settings handed to the worker differ; the app\'s defaults and routing are untouched.');
md.push('');
md.push(`Variants: ${VARIANT_KEYS.map((v) => `**${v}** = ${VARIANT_LABELS[v]}`).join(' · ')}`);
md.push('');

// --- task 1: token fit ------------------------------------------------------------
if (fit) {
  md.push('## 1. Token-length check (task 1, measured before any run)');
  md.push('');
  md.push('References tokenized with each engine\'s own tokenizer; "fits" = reference tokens + 1 (the EOS slot) <= the variant\'s limit computed from the matching source tokens (the group engine\'s sources carry the `>>hrv<<` tag, like the worker\'s budget code).');
  md.push('');
  md.push('| direction | engine | med src tok | med ref tok | med limit A | refs not fitting A | med limit B | refs not fitting B |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const d of fit.directions) {
    md.push(`| ${d.pair.replace('|', ' → ')} | ${d.engine.id} | ${d.medianSrcTokens} | ${d.medianRefTokens} | ${d.medianLimitA} | ${(d.shareNotFitA * 100).toFixed(1)}% | ${d.medianLimitB} | ${(d.shareNotFitB * 100).toFixed(1)}% |`);
  }
  md.push('');
}

// --- quality table ------------------------------------------------------------------
md.push('## 2. chrF++ by variant (gap vs the full model\'s published baseline in parentheses)');
md.push('');
md.push('| direction | A | B | C | D | E |');
md.push('|---|---|---|---|---|---|');
for (const r of rows) {
  const cell = (v) => {
    const c = r.perVariant[v];
    if (!c) return '·';
    const gap = c.gap == null ? '' : ` (${c.gap > 0 ? '+' : ''}${c.gap.toFixed(1)})`;
    return `${fmtChrf(c.chrf)}${gap} ${verdictMark[c.verdict]}`;
  };
  md.push(`| ${r.src} → ${r.tgt} | ${cell('A')} | ${cell('B')} | ${cell('C')} | ${cell('D')} | ${cell('E')} |`);
}
md.push('');

// --- flags table ---------------------------------------------------------------------
md.push('## 3. Sanity flags by variant (flagged sentences / 200; mid-word cuts and loops in parentheses)');
md.push('');
md.push('`cut` = endsMidWord (mid-word truncation evidence), `loop` = repeatLoop. missingFinalPunct is a count, never a flag (P2b).');
md.push('');
md.push('| direction | A | B | C | D | E |');
md.push('|---|---|---|---|---|---|');
for (const r of rows) {
  const cell = (v) => {
    const c = r.perVariant[v];
    if (!c) return '·';
    return `${c.flagged} (cut ${c.endsMidWord}, loop ${c.repeatLoop})`;
  };
  md.push(`| ${r.src} → ${r.tgt} | ${cell('A')} | ${cell('B')} | ${cell('C')} | ${cell('D')} | ${cell('E')} |`);
}
md.push('');

// --- speed table ----------------------------------------------------------------------
md.push('## 4. Speed by variant (median seconds per sentence; × = ratio vs A)');
md.push('');
md.push('| direction | A | B | C | D | E |');
md.push('|---|---|---|---|---|---|');
for (const r of rows) {
  const aMed = r.perVariant.A?.median ?? null;
  const cell = (v) => {
    const c = r.perVariant[v];
    if (!c || c.median == null) return '·';
    const ratio = aMed != null ? c.median / aMed : null;
    const warn = ratio != null && ratio > 3 ? ' ⚠️>3×' : '';
    return `${c.median.toFixed(2)}s${ratio != null ? ` (×${ratio.toFixed(2)})` : ''}${warn}`;
  };
  md.push(`| ${r.src} → ${r.tgt} | ${cell('A')} | ${cell('B')} | ${cell('C')} | ${cell('D')} | ${cell('E')} |`);
}
md.push('');

// --- beam identity ---------------------------------------------------------------------
if (identity.length) {
  md.push('## 5. Empirical check: how many sentences differ from variant B');
  md.push('');
  md.push('transformers.js 3.8.1\'s generate loop keeps only the top-1 token per step even when `num_beams` > 1 (source: `src/models.js`, "TODO: Support beam search" — the loop `break`s after the first candidate). This table counts the sentences whose text differs from B, proving the point on real runs rather than trusting the code reading.');
  md.push('');
  md.push('| direction | C differs on | D differs on | E differs on |');
  md.push('|---|---|---|---|');
  for (const l of identity) {
    md.push(`| ${l.pair} | ${V(l.C)} | ${V(l.D)} | ${V(l.E)} |`);
  }
  md.push('');
}

// --- verdict changes --------------------------------------------------------------------
md.push('## 6. Verdict changes');
md.push('');
const changes = [];
for (const r of rows) {
  const a = r.perVariant.A?.verdict;
  for (const v of ['B', 'C', 'D', 'E']) {
    const cur = r.perVariant[v]?.verdict;
    if (cur && a && cur !== a) changes.push(`**${r.src} → ${r.tgt}**: ${a} → **${cur}** under ${v}`);
  }
}
if (changes.length === 0) md.push('No direction changes verdict under any variant.');
else md.push(changes.map((c) => `- ${c}`).join('\n'));
md.push('');

// --- recommendation (task 6) --------------------------------------------------------------
const hrvRow = rows.find((r) => r.tgt === 'hrv_Latn');
const hrvA = hrvRow?.perVariant.A;
const hrvB = hrvRow?.perVariant.B;
md.push('## 7. Recommendation (per engine kind; defaults and routing unchanged)');
md.push('');
md.push('**Single-pair engines (Opus-MT one pair per model): keep the current settings (A).**');
md.push('');
md.push('- The token-limit hypothesis is refuted for them: the references fit the current limit on every panel direction (0–0.5% not fitting), and the generous limit B moved chrF++ by at most +0.10 (vie) without changing a single flag or verdict. Hindi — the worst direction — was bit-for-bit unchanged: its failure is dropped clauses (27 lenRatio flags) and loops, not a short budget.');
md.push('- C (no_repeat_ngram_size 3) kills real loops (hin 7→4, vie 9→7, ru 1→0) but the chrF++ gain is +0.1–0.2 on directions that miss the bar by 8–23 points, while the passing French control pays −0.32 and Croatian −0.34 vs B. Nothing crosses a verdict line; a control-visible cost for no verdict movement is a bad trade at defaults.');
md.push('- D/E cannot help by construction: transformers.js 3.8.1 keeps the top-1 token per step even with `num_beams` > 1 — 0 of 200 sentences differ from B on every panel direction, while paying a small topk/softmax overhead. Beam search is simply not implemented in the library version the app ships.');
md.push('- Speed: no variant trips the 3× alarm anywhere (max ×1.18); B/C ran up to ~18% slower on some directions for no quality gain.');
md.push('');
md.push('**Group engines (Opus-MT en-mul, currently quarantined): if one is ever re-enabled, give it the generous limit B — but B does not rescue it.**');
md.push('');
if (hrvA && hrvB) {
  md.push(`- Croatian is the one direction where the prompt's token-limit idea was right: references need ~1.7× the source tokens in tokenizer units, 29% did not fit A's limit, and A truncated 11 sentences mid-word. B removed all 11 cuts and 31 of 34 dropped final marks, and chrF++ rose ${hrvA.chrf.toFixed(2)} → ${hrvB.chrf.toFixed(2)}.`);
}
md.push('- But the gap only moved from −12.9 to −12.3 against a −5.0 fail line: the group model\'s Croatian is too far below the bar for decoding to matter. The quarantine stands; decoding settings cannot rescue it.');
md.push('- The generous limit costs no speed (×0.94 on the panel) and is the right shape for any engine serving a language that needs more tokens per English word.');
md.push('');
md.push('**Beam search and the calibration deficit:** published baselines are beam-search numbers, but this stack cannot reproduce that: in transformers.js 3.8.1 `num_beams > 1` does not branch (source: `src/models.js`, "TODO: Support beam search" — the loop `break`s after the first candidate; empirically 0/200 differences on all 9 directions). The ~1.4-point local-vs-published offset P2b measured therefore cannot be closed with beams today; revisit only if the library gains real beam search. The failing routes are model-quality failures (clause drops, wrong content), not decoding artifacts.');
md.push('');
md.push('**Known interaction, noted for the record:** the app\'s punctuation restoration (P2b) is add-only, so a genuinely truncated word can come back as "ADT Corpor." — complete-looking to a reader. The benchmark now sees the model\'s raw text through the benchmark-only `rawOutput` flag (the app never sets it), so truncation flags stay honest; the app-side cosmetics are unchanged by P2c.');
md.push('');

// --- source note -------------------------------------------------------------------------
const sources = new Map();
for (const r of rows) for (const v of VARIANT_KEYS) if (r.perVariant[v]) sources.set(r.perVariant[v].source, (sources.get(r.perVariant[v].source) ?? 0) + 1);
md.push(`Cell provenance: ${[...sources.entries()].map(([k, n]) => `${n} ${k}`).join(', ')}. Variant A cells marked "stored P2/P2b" were proven byte-identical to fresh runs of the rebuilt worker on en→fr and en→hr (0/200 outputs differ).`);
md.push('');

if (missing.length) {
  md.push(`**Missing cells (runs not yet complete):** ${missing.join(', ')}`);
  md.push('');
}

writeFileSync(HERE('p2c-variant-report.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
console.log('\nwritten: scripts/benchmark/p2c-variant-report.md');

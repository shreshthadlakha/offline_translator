// Language audit: chrF (character n-gram F-score, the WMT standard for
// translation quality without tokenization) of every audited pair against the
// NLLB-200 references, calibrated by the same score for the pairs that already
// ship (their runs and references live in scripts/quality-gate/).
//
// chrF here: character n-grams n=1..6, beta=2 (harmonic mean favouring
// recall), computed per sentence and averaged, matching sacrebleu's chrF
// defaults closely enough for ranking.
//
// Usage: node scripts/language-audit/chrf.mjs
import { readFileSync, writeFileSync } from 'node:fs';

function chrfSentence(hyp, ref) {
  const h = Array.from(String(hyp ?? '').toLowerCase());
  const r = Array.from(String(ref ?? '').toLowerCase());
  if (!h.length && !r.length) return 100;
  if (!h.length || !r.length) return 0;
  let fTotal = 0;
  const beta2 = 4; // beta=2 -> beta^2
  const maxN = 6;
  let usedN = 0;
  for (let n = 1; n <= maxN; n++) {
    if (h.length < n && r.length < n) break;
    usedN++;
    const hGrams = new Map();
    for (let i = 0; i + n <= h.length; i++) {
      const g = h.slice(i, i + n).join('');
      hGrams.set(g, (hGrams.get(g) ?? 0) + 1);
    }
    const rGrams = new Map();
    for (let i = 0; i + n <= r.length; i++) {
      const g = r.slice(i, i + n).join('');
      rGrams.set(g, (rGrams.get(g) ?? 0) + 1);
    }
    let overlap = 0;
    for (const [g, c] of hGrams) {
      const rc = rGrams.get(g);
      if (rc) overlap += Math.min(c, rc);
    }
    const prec = overlap / Math.max(1, h.length - n + 1);
    const rec = overlap / Math.max(1, r.length - n + 1);
    if (prec + rec === 0) { fTotal += 0; continue; }
    fTotal += (1 + beta2) * (prec * rec) / (beta2 * prec + rec);
  }
  return (100 * fTotal) / Math.max(1, usedN);
}

function meanChrf(hyps, refs) {
  const vals = [];
  for (let i = 0; i < hyps.length; i++) {
    if (hyps[i] == null || refs[i] == null) continue;
    vals.push(chrfSentence(hyps[i], refs[i]));
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// --- calibration: the shipped pairs (original quality gate) -----------------------
const shippedRuns = JSON.parse(readFileSync('scripts/quality-gate/runs.json', 'utf8'));
const shippedRefList = JSON.parse(readFileSync('scripts/quality-gate/nllb-references.json', 'utf8')).directions;
const shippedRefs = new Map(shippedRefList.map((d) => [d.pair, d.outputs]));
const shipped = [];
for (const [pair, model] of Object.entries(shippedRuns.models)) {
  const refList = shippedRefs.get(pair);
  const outputs = model.run1?.outputs ?? model.run2?.outputs;
  if (!refList || !outputs) continue;
  shipped.push({ id: model.modelId, key: pair, chrf: meanChrf(outputs, refList) });
}
const shippedScores = shipped.map((s) => s.chrf).filter((v) => v != null).sort((a, b) => a - b);
const band = {
  count: shippedScores.length,
  min: Math.min(...shippedScores),
  p25: shippedScores[Math.floor(shippedScores.length * 0.25)],
  median: shippedScores[Math.floor(shippedScores.length / 2)],
  max: Math.max(...shippedScores),
};

// --- the audited pairs -------------------------------------------------------------
const runs = JSON.parse(readFileSync('scripts/language-audit/browser-runs.json', 'utf8'));
const refs = JSON.parse(readFileSync('scripts/language-audit/nllb-refs-new.json', 'utf8'));
const rows = [];
for (const [id, model] of Object.entries(runs.models)) {
  for (const pair of model.pairs ?? []) {
    const [src, tgt] = pair.key.split('->');
    const isEnSource = src === 'en' || src === 'eng_Latn';
    const refList = isEnSource ? refs.sources[tgt] : refs.xToEn[src];
    if (!refList || !pair.outputs) continue;
    rows.push({ id, key: pair.key, chrf: meanChrf(pair.outputs, refList) });
  }
}

rows.sort((a, b) => (a.chrf ?? -1) - (b.chrf ?? -1));
writeFileSync('scripts/language-audit/chrf.json', JSON.stringify({ generatedAt: new Date().toISOString(), shippedBand: band, shipped, rows }, null, 2));

console.log(`shipped band (n=${band.count}): min ${band.min.toFixed(1)} / p25 ${band.p25.toFixed(1)} / median ${band.median.toFixed(1)} / max ${band.max.toFixed(1)}`);
console.log('\naudited pairs, worst first:');
for (const r of rows) {
  const flag = r.chrf < band.min ? '  <-- below shipped min' : r.chrf < band.p25 ? '  <- below shipped p25' : '';
  console.log(`${r.chrf.toFixed(1).padStart(5)}  ${r.id.padEnd(18)} ${r.key}${flag}`);
}

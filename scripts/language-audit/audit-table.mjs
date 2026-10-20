// Language audit: the per-language coverage table. For every language in the
// registry, what translating FROM English and TO English needs: which engine,
// which model, how many bytes, single pair or group. Written against the
// current ENGINE_TABLE so it doubles as a regression check: run it after any
// engine change and the table reflects the truth.
//
// Usage: bun run scripts/language-audit/audit-table.mjs
import { LANGUAGES } from "../../src/lib/languages";
import { ENGINE_TABLE, engineForPair, pairCost } from "../../src/lib/engines";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const EN = "eng_Latn";
const rows = [];
for (const lang of LANGUAGES) {
  if (lang.code === EN) continue;
  const cell = (src, tgt) => {
    const engine = engineForPair(src, tgt, true);
    return {
      engineId: engine.id,
      modelId: engine.modelId,
      kind: engine.kind === "nllb" ? "full" : engine.group ? "group" : "single",
      tag: engine.tag ?? null,
      expectedBytes: engine.expectedBytes,
    };
  };
  rows.push({
    code: lang.code,
    english: lang.english,
    native: lang.native,
    enToThis: cell(EN, lang.code),
    thisToEn: cell(lang.code, EN),
  });
}

// Which directions have no fast path at all (both sides on the full model)?
const slow = rows.filter((r) => r.enToThis.kind === "full" && r.thisToEn.kind === "full");

// Merge the gate verdicts when they exist.
let gated = 0;
if (existsSync("scripts/language-audit/gate-results.json")) {
  const gate = JSON.parse(readFileSync("scripts/language-audit/gate-results.json", "utf8"));
  const verdicts = new Map();
  for (const model of gate.models) {
    for (const pair of model.pairs) {
      const key = pair.key.startsWith("en->")
        ? `${EN}|${pair.key.slice(4)}`
        : `${pair.key.slice(0, pair.key.length - 4)}|${EN}`;
      verdicts.set(key, { pass: pair.pass, failures: pair.failures?.length ?? 0, hasReference: pair.hasReference });
    }
  }
  for (const row of rows) {
    for (const side of ["enToThis", "thisToEn"]) {
      const cell = row[side];
      if (cell.kind === "full") continue;
      const key = side === "enToThis" ? `${EN}|${row.code}` : `${row.code}|${EN}`;
      const v = verdicts.get(key);
      if (v) {
        gated++;
        cell.gate = v.pass ? "pass" : "fail";
        cell.gateFailures = v.failures;
        cell.hasReference = v.hasReference;
      }
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  languages: rows.length,
  fastBoth: rows.filter((r) => r.enToThis.kind !== "full" && r.thisToEn.kind !== "full").map((r) => r.code),
  fastOneDirection: rows.filter((r) => (r.enToThis.kind === "full") !== (r.thisToEn.kind === "full")).map((r) => r.code),
  fullModelOnly: slow.map((r) => r.code),
  gatedDirections: gated,
  rows,
};
writeFileSync("scripts/language-audit/audit-table.json", JSON.stringify(out, null, 2));
console.log(`languages: ${rows.length}`);
console.log(`fast both directions: ${out.fastBoth.length}`);
console.log(`fast one direction:  ${out.fastOneDirection.length} -> ${out.fastOneDirection.join(" ")}`);
console.log(`full model only:     ${slow.length} -> ${slow.map((r) => r.english).join(", ")}`);
console.log(`gate verdicts merged: ${gated}`);

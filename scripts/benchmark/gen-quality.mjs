/**
 * Generates src/lib/quality.ts from scripts/benchmark/quality-table.json.
 * The tier data drives the honest quality labels in the UI.
 *
 * Usage: bun scripts/benchmark/gen-quality.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allEngines } from "../../src/lib/engines.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = (f) => join(HERE, "..", "..", f);

const qt = JSON.parse(readFileSync(ROOT("scripts/benchmark/quality-table.json"), "utf8"));
const engines = new Set(allEngines().map((engine) => engine.modelId));

// Sanity: every small-model row's engine must still exist in the engine
// table (the table is regenerated after every route change; drift would
// label a route that no longer exists).
const missing = new Set();
for (const row of qt.rows) {
  if (row.verdict === "baseline") continue;
  const modelId = row.engine?.modelId;
  if (modelId && !engines.has(modelId)) missing.add(`${row.direction}: ${modelId}`);
}
if (missing.size > 0) {
  console.error("Rows referencing engines not present in engines.ts:");
  for (const m of missing) console.error("  " + m);
  process.exit(1);
}

/** Language-level tier: the weaker direction decides the label. A language
 * served only by the full model is "full", not "best". */
function tierForVerdicts(tiers) {
  if (tiers.length === 0) return "full";
  if (tiers.every((t) => t === "full")) return "full";
  if (tiers.every((t) => t === "best" || t === "full")) return "best";
  if (tiers.every((t) => t === "best" || t === "good" || t === "full")) return "good";
  return "limited";
}

const byLanguage = new Map();
for (const row of qt.rows) {
  const code = row.language?.code ?? row.src;
  if (!byLanguage.has(code)) byLanguage.set(code, { english: row.language?.english ?? code, directions: {} });
  const entry = byLanguage.get(code);
  const key = row.direction.includes("en")
    ? row.direction.startsWith("en->") ? "en->" : "->en"
    : row.direction;
  if (row.verdict === "baseline") {
    // Full-model row: only record it when no small model serves the pair.
    if (!entry.directions[key]) entry.directions[key] = { tier: "full", gap: null };
  } else {
    entry.directions[key] = {
      tier: row.verdict === "pass" ? "best" : row.verdict === "borderline" ? "good" : "limited",
      gap: row.gap,
    };
  }
}

const languages = [];
for (const [code, entry] of byLanguage) {
  if (code === "eng_Latn") continue;
  const dirTiers = Object.values(entry.directions).map((d) => d.tier);
  languages.push({
    code,
    english: entry.english,
    tier: tierForVerdicts(dirTiers),
    directions: entry.directions,
  });
}
languages.sort((a, b) => a.english.localeCompare(b.english));

const out = `/**
 * Honest quality tiers per language, GENERATED from the benchmark data
 * (scripts/benchmark/quality-table.json; regenerate with
 * \`bun scripts/benchmark/gen-quality.mjs\` after any route change).
 *
 * Every routed direction was scored with chrF++ on the same 200 professional
 * FLORES-200 translations, against the published full NLLB-200 600M score
 * for that direction. Tier meaning:
 *   best     "pass": within 2 chrF of the published full-model score.
 *   good     "borderline": 2-5 chrF below, or passing with more flagged
 *            sentences than the bar allows.
 *   limited  "fail": 5+ chrF below the full model (still the best
 *            browser-ready option we found; labeled honestly).
 *   full     the full model serves this direction.
 *
 * gap is local chrF++ minus the published full-model chrF++ (positive means
 * the small model scored ABOVE the full model's published number).
 */

export type QualityTier = "best" | "good" | "limited" | "full";

export type DirectionQuality = {
  tier: QualityTier;
  /** chrF++ gap vs the published full-model score, when measured. */
  gap: number | null;
};

export type LanguageQuality = {
  code: string;
  english: string;
  /** The weaker direction decides the language-level label. */
  tier: QualityTier;
  /** Per direction: "en->" for English-to-x and "->en" for x-to-English,
   *  full "src->tgt" keys for anything else. */
  directions: Record<string, DirectionQuality>;
};

export const LANGUAGE_QUALITY: LanguageQuality[] = ${JSON.stringify(languages, null, 2)};

const BY_CODE = new Map(LANGUAGE_QUALITY.map((l) => [l.code, l]));

/** Quality of one direction, or null when unmeasured. */
export function directionQuality(src: string, tgt: string): DirectionQuality | null {
  const lang = src === "eng_Latn" ? BY_CODE.get(tgt) : BY_CODE.get(src);
  if (!lang) return null;
  if (src === "eng_Latn") return lang.directions["en->"] ?? null;
  if (tgt === "eng_Latn") return lang.directions["->en"] ?? null;
  return null;
}

/** The language-level tier shown beside the language name. */
export function languageQuality(code: string): QualityTier | null {
  return BY_CODE.get(code)?.tier ?? null;
}
`;

writeFileSync(ROOT("src/lib/quality.ts"), out);
console.log(`wrote src/lib/quality.ts (${languages.length} languages)`);
const counts = { best: 0, good: 0, limited: 0, full: 0 };
for (const l of languages) counts[l.tier]++;
console.log("language tiers:", JSON.stringify(counts));

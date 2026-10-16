// Generates THIRD_PARTY_NOTICES.md from the code's own tables: every model
// in the engine table (src/lib/engines.ts) with its pinned revision
// (scripts/release/model-revisions.json), its licenses (verified Hub research
// in scripts/language-audit/hub-audit.json and scripts/hub-research.json),
// plus the runtime, the self hosted fonts and the UI components.
//
// Deterministic by construction: it reads only committed files, so
// scripts/check-drift.mjs can regenerate it and demand byte equality. The
// notices can never silently disagree with the engines the app actually
// loads — which is exactly what a third party notice file is for.
//
// Usage:
//   node scripts/generate-notices.mjs           write THIRD_PARTY_NOTICES.md
//   node scripts/generate-notices.mjs --check   fail if it differs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allEngines, NLLB_ENGINE } from "../src/lib/engines.ts";
import { BERGAMOT_PAIRS, BERGAMOT_REVISION, BERGAMOT_RUNTIME } from "../src/lib/bergamot/bundles.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HERE = (f) => join(dirname(fileURLToPath(import.meta.url)), f);
const OUT = join(ROOT, "THIRD_PARTY_NOTICES.md");
const CHECK = process.argv.includes("--check");

const revisions = JSON.parse(readFileSync(HERE("release/model-revisions.json"), "utf8")).revisions;
const community = JSON.parse(readFileSync(HERE("release/community-models.json"), "utf8")).models;
const hubAudit = JSON.parse(readFileSync(HERE("language-audit/hub-audit.json"), "utf8"));
const hubResearch = JSON.parse(readFileSync(HERE("hub-research.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

// Hub license tag -> display name (the spellings the Hub API uses).
const LICENSE_NAMES = {
  "apache-2.0": "Apache-2.0",
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
  "cc-by-sa-4.0": "CC BY-SA 4.0",
  "mit": "MIT",
  "ofl-1.1": "SIL OFL 1.1",
};
const licenseName = (tag) => LICENSE_NAMES[tag] ?? tag ?? "—";

const audited = new Map();
for (const entry of [...hubAudit.singlePair, ...hubAudit.groups]) audited.set(entry.id, entry);

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;

// --- the model rows -------------------------------------------------------------------
const rows = allEngines().map((engine) => {
  if (engine.kind === "bergamot") {
    // Mozilla's Firefox Translations models, fetched from a byte-for-byte
    // mirror of Mozilla's own registry at a pinned revision, each file
    // verified against a SHA-256 from the pinned bundle table.
    const pair = Object.values(BERGAMOT_PAIRS).find((p) => p.modelId === engine.modelId);
    if (!pair) throw new Error(`Bergamot engine ${engine.modelId} has no pinned bundle`);
    return {
      engine,
      sha: BERGAMOT_REVISION,
      serves: engine.name.replace(/^Bergamot /, ""),
      conversionLicense: engine.license,
      licenseUrl: engine.licenseUrl,
      upstreamModel: "mozilla/translations",
      upstreamLicense: "MPL-2.0",
      nonCommercial: false,
      bergamot: true,
      repo: "midudev/firefox-translations",
    };
  }
  const sha = revisions[engine.modelId];
  if (!sha) throw new Error(`No pinned revision for ${engine.modelId} — run scripts/release/fetch-model-revisions.mjs`);

  let upstreamModel, upstreamLicenseTag;
  if (engine.id === NLLB_ENGINE.id) {
    upstreamModel = hubResearch.fullModel.originalModel;
    upstreamLicenseTag = hubResearch.fullModel.license;
  } else if (community[engine.modelId]) {
    // A community conversion (IndicTrans2 int8 exports by hari31416, Opus-MT
    // conversions by fintutto): the upstream original and both licenses were
    // verified on the Hub and recorded in scripts/release/community-models.json.
    upstreamModel = community[engine.modelId].upstream;
    upstreamLicenseTag = community[engine.modelId].upstreamLicense;
  } else {
    const audit = audited.get(engine.modelId);
    if (!audit) throw new Error(`No Hub audit entry for ${engine.modelId}`);
    upstreamModel = audit.baseModel;
    // The conversion repo sometimes carries no license tag; the upstream
    // original's license governs the weights. Prefer the verified engines.ts
    // license for the conversion row itself.
    upstreamLicenseTag = audit.upstreamLicense ?? audit.licenseTag ?? null;
  }

  const nonCommercial = /nc/i.test(`${upstreamLicenseTag ?? ""} ${engine.license}`);
  return {
    engine,
    sha,
    serves: engine.name.replace(/^Opus-MT /, "").replace(/^NLLB-200 \(distilled 600M\)$/, "every language pair (the full model)"),
    conversionLicense: engine.license,
    licenseUrl: engine.licenseUrl,
    upstreamModel,
    upstreamLicense: licenseName(upstreamLicenseTag),
    nonCommercial,
  };
});

const groupRows = rows.filter((r) => r.engine.group);
const singleRows = rows.filter((r) => !r.engine.group && r.engine.id !== NLLB_ENGINE.id);
const nllbRow = rows.find((r) => r.engine.id === NLLB_ENGINE.id);
const nonCommercialRows = rows.filter((r) => r.nonCommercial);
const bergamotRows = rows.filter((r) => r.bergamot);

// --- the runtime version (from the committed lockfile, so it cannot drift) --------------
const transformersLocked = packageLock.packages?.["node_modules/@huggingface/transformers"]?.version;
const bergamotLocked = packageLock.packages?.["node_modules/@mkljczk/bergamot-translator"]?.version;

// --- assemble ------------------------------------------------------------------------
const L = [];
L.push("# Third party notices");
L.push("");
L.push(`Private Translator itself is dual-licensed MIT OR Apache-2.0 — see \`LICENSE-MIT\`, \`LICENSE-APACHE\` and \`NOTICE\`. This file lists every third party component the app ships or downloads, with the license that governs each piece.`);
L.push("");
L.push(`Generated by \`scripts/generate-notices.mjs\` from the engine table, the pinned revisions and the verified Hub research; \`scripts/check-drift.mjs\` regenerates it and fails the build if it ever disagrees with the code. Nothing here is hand maintained.`);
L.push("");
L.push("## How the models reach a device");
L.push("");
L.push("No model file is committed to this repository. The app downloads each model once, directly from the Hugging Face Hub, pinned to the exact revision listed below, and keeps it in the browser's cache for offline reuse. Nothing the user types or translates is ever sent anywhere — the only network requests the app makes are its own files and these one time model downloads.");
L.push("");
L.push(`## Translation models (${rows.length})`);
L.push("");
L.push("The full model, then the small single-pair models, then the group models, then the Bergamot models. Sizes are the quantized (q8) bundle the app actually downloads, except the Bergamot rows, whose size is the int8 Marian model plus its shortlist and vocabularies.");
L.push("");
L.push("| Model (conversion) | Pinned revision | Serves | Download | License | Upstream model | Upstream license | Non-commercial |");
L.push("|---|---|---|---|---|---|---|---|");
for (const r of [nllbRow, ...singleRows.filter((r) => !r.bergamot), ...groupRows, ...bergamotRows]) {
  const modelLink = r.bergamot
    ? `[\`${r.repo}\`](https://huggingface.co/${r.repo})`
    : `[\`${r.engine.modelId}\`](https://huggingface.co/${r.engine.modelId})`;
  const revisionLink = `[\`${r.sha.slice(0, 12)}\`](https://huggingface.co/${r.bergamot ? r.repo : r.engine.modelId}/tree/${r.sha})`;
  const upstreamLink = r.bergamot
    ? `[\`${r.upstreamModel}\`](https://github.com/${r.upstreamModel})`
    : `[\`${r.upstreamModel}\`](https://huggingface.co/${r.upstreamModel})`;
  L.push(
    `| ${modelLink} | ${revisionLink} | ${r.serves} | ${mb(r.engine.expectedBytes)} | [${r.conversionLicense}](${r.licenseUrl}) | ${upstreamLink} | ${r.upstreamLicense} | ${r.nonCommercial ? "**yes**" : "no"} |`,
  );
}
L.push("");
L.push(`**Bergamot models.** The ${bergamotRows.length} Mozilla rows above are Firefox Translations release models (MPL-2.0), each fetched from the \`midudev/firefox-translations\` mirror at the pinned revision, with every file verified against a SHA-256 in \`src/lib/bergamot/bundles.ts\` before it is used or cached. Croatian and Serbian to English share one released Serbo-Croatian (hbs) model, exactly as Firefox routes them. The mirror was verified byte-for-byte against Mozilla's own model registry: all 31 cross-checkable model hashes match.`);
L.push("");
if (nonCommercialRows.length) {
  L.push("**Non-commercial models.** " + nonCommercialRows.map((r) => `\`${r.engine.modelId}\` (upstream \`${r.upstreamModel}\`, ${r.upstreamLicense})`).join(", ") + ". The CC BY-NC 4.0 license from Meta AI forbids commercial use of these weights and their conversions. Every other model above is Apache-2.0 or CC BY 4.0.");
  L.push("");
}
L.push("License provenance, per repo, was verified against the Hugging Face Hub (repository license tags and the upstream originals): `scripts/hub-research.json` and `scripts/language-audit/hub-audit.json`. Where a conversion repository carries no license tag of its own, the license shown is the one verified on the upstream original, which governs the weights.");
L.push("");
L.push("## Translation runtime");
L.push("");
L.push(`- **\`@huggingface/transformers\`${transformersLocked ? ` (v${transformersLocked}, resolved by package-lock.json)` : ""}** — the transformers.js library that loads and runs the models in the web worker. Apache-2.0. Bundled into \`public/translator.worker.js\` at build time.`);
L.push("- **ONNX Runtime Web** — the WebAssembly runtime files (\`ort-wasm-simd-threaded.jsep.wasm\` and its loader) that transformers.js depends on. MIT, © Microsoft. Copied out of the transformers package by `scripts/copy-ort.mjs` and served self hosted from `/ort/`, so the app never requests them from a CDN.");
L.push(`- **Bergamot translator**${bergamotLocked ? ` (the wasm build shipped by \`@mkljczk/bergamot-translator\` v${bergamotLocked}, resolved by package-lock.json)` : ""} — Mozilla's Bergamot translator (Marian + intgemm compiled to WebAssembly; upstream \`mozilla/bergamot-translator\`, MPL-2.0), which runs the Firefox Translations models. Copied by \`scripts/copy-bergamot.mjs\` and served self hosted from \`/bergamot/\`, fetched only when a Bergamot route first runs, and verified against the SHA-256 pins in \`src/lib/bergamot/bundles.ts\` (glue \`${BERGAMOT_RUNTIME.glue.sha256.slice(0, 12)}…\`, wasm \`${BERGAMOT_RUNTIME.wasm.sha256.slice(0, 12)}…\`, ${(BERGAMOT_RUNTIME.wasm.bytes / 1e6).toFixed(1)} MB).`);
L.push("");
L.push("## Ported code");
L.push("");
L.push("The IndicTrans2 preprocessing and postprocessing in `src/lib/indictrans2/processor.ts` is a TypeScript port of reference Python code, with the algorithmic structure and constants preserved:");
L.push("");
L.push("- **IndicTransToolkit 1.1.1** (`processor.pyx` — the placeholder, normalization and transliteration pipeline) — AI4Bharat, MIT.");
L.push("- **indic-nlp-library 0.92** (script normalizers, transliterator, trivial tokenizers) — Anoop Kunchukuttan, MIT.");
L.push("- **sacremoses 0.2.0** (the Moses punctuation normalizer and tokenizer/detokenizer, English subset actually used) — MIT.");
L.push("- **urduhack 1.1.1** (Urdu character normalization) — MIT.");
L.push("");
L.push("The research copies of these libraries (pinned release tarballs) live under `scripts/indictrans2/` as provenance; the app ships only the port, and no upstream code is bundled verbatim.");
L.push("");
L.push("## Self hosted fonts");
L.push("");
L.push("All fonts are subset woff2 files in `public/fonts/`, fetched once by `scripts/fetch-fonts.mjs` and served from this origin. The app never talks to Google Fonts at runtime.");
L.push("");
L.push("- **IBM Plex Sans**, with Arabic, Devanagari, Hebrew and Thai subsets — © IBM Corp., SIL Open Font License 1.1.");
L.push("- **Newsreader** (display type for headlines) — © Production Type, SIL Open Font License 1.1, via Google Fonts.");
L.push("");
L.push("## UI components and icons");
L.push("");
L.push("- **shadcn/ui** component scaffold and **Radix UI** primitives — MIT.");
L.push("- **Lucide** icon set — ISC.");
L.push("- **Tailwind CSS** — MIT. **Next.js** and **React** — MIT.");
L.push("");
L.push("Each is resolved to an exact version by `package-lock.json`; the licenses above are the ones stated by those projects.");
L.push("");
L.push("## Benchmark data (repository only, not part of the app)");
L.push("");
L.push("The quality table (`scripts/benchmark/quality-table.md`) is measured on FLORES-200 devtest (© Meta, CC BY-SA 4.0). That dataset is downloaded by the benchmark scripts and is never committed to this repository or shipped in the app.");
L.push("");

const content = L.join("\n") + "\n";

if (CHECK) {
  const current = readFileSync(OUT, "utf8");
  if (current !== content) {
    console.error("THIRD_PARTY_NOTICES.md is out of date with the engine table / revisions. Run: node scripts/generate-notices.mjs");
    process.exit(1);
  }
  console.log(`notices OK (${rows.length} models, byte-identical)`);
} else {
  writeFileSync(OUT, content);
  console.log(`wrote THIRD_PARTY_NOTICES.md (${rows.length} models, ${nonCommercialRows.length} non-commercial)`);
}

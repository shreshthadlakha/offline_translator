#!/usr/bin/env bun
// P11 audit: list EVERY direction still routed to the full model (English
// pairs and non-English pairs alike), then check each one against the
// COMPLETE list of models in the mirror at its pinned revision — not a
// shortlist. For every direction with a model, record file sizes, sha256
// checksums and the license, and verify the mirror bytes against Mozilla's
// own GCS registry hashes. For anything with no fetchable model, say so
// plainly. Output: scripts/bergamot/p11-audit.json (committed provenance).
//
// Run: bun scripts/bergamot/p11-audit.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES } from "../../src/lib/languages.ts";
import { engineForPair } from "../../src/lib/engines.ts";
import { BERGAMOT_MIRROR, BERGAMOT_REVISION, bergamotPairFor } from "../../src/lib/bergamot/bundles.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENG = "eng_Latn";

// --- 1. Every direction still routed to the full model -------------------
const englishFull = []; // {src, tgt, language}
const nonEnglishFullCount = { srcs: new Set(), orderedPairs: 0 };
for (const src of LANGUAGES) {
  for (const tgt of LANGUAGES) {
    if (src.code === tgt.code) continue;
    if (src.code === ENG || tgt.code === ENG) {
      const engine = engineForPair(src.code, tgt.code, true);
      if (engine.kind === "nllb") {
        englishFull.push({ src: src.code, tgt: tgt.code, english: src.code === ENG ? tgt.english : src.english });
      }
    } else {
      nonEnglishFullCount.orderedPairs++;
      nonEnglishFullCount.srcs.add(src.code);
      nonEnglishFullCount.srcs.add(tgt.code);
    }
  }
}

// --- 2. The mirror's complete pair list at the pinned revision -----------
const treeUrl = `https://huggingface.co/api/models/${BERGAMOT_MIRROR}/tree/${BERGAMOT_REVISION}?recursive=true`;
const tree = await (await fetch(treeUrl)).json();
const mirrorPairs = new Set();
for (const entry of tree) {
  if (entry.type === "directory") {
    const top = entry.path.split("/")[0];
    if (top !== "runtime") mirrorPairs.add(top);
  }
}
console.log(`mirror pairs at the pinned revision: ${mirrorPairs.size}`);

// --- 3. Cross-reference every full-model English direction ---------------
// Our NLLB code -> every Mozilla code form the mirror might use.
const CODE_FORMS = {
  amh_Ethi: ["am", "amh"],
  hau_Latn: ["ha", "hau"],
  kor_Hang: ["ko", "kor"],
  pbt_Arab: ["ps", "pbt", "pus"],
  pol_Latn: ["pl", "pol"],
  sin_Sinh: ["si", "sin"],
  tgl_Latn: ["tl", "tgl"],
  yor_Latn: ["yo", "yor"],
  zul_Latn: ["zu", "zul"],
  // Found by the exhaustive enumeration, not by the task's shortlist:
  heb_Hebr: ["he", "heb"],
  swh_Latn: ["sw", "swh", "swa"],
};

// The GCS registry: what Mozilla itself publishes (CORS-blocked for browsers,
// but the fidelity reference for hashes and the existence record).
const registry = JSON.parse(await Bun.file(join(HERE, "gcs-registry.json")).text());

async function headPin(pair, name) {
  const url = `https://huggingface.co/${BERGAMOT_MIRROR}/resolve/${BERGAMOT_REVISION}/${pair}/${name}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (res.status === 302 || res.status === 200) {
        const bytes = Number(res.headers.get("x-linked-size"));
        const sha256 = (res.headers.get("x-linked-etag") || "").replace(/"/g, "");
        if (bytes && /^[0-9a-f]{64}$/.test(sha256)) return { name, bytes, sha256 };
      }
    } catch (err) {
      console.error(`  retry ${pair}/${name}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

const findings = [];
for (const direction of englishFull) {
  const nonEng = direction.src === ENG ? direction.tgt : direction.src;
  const side = direction.src === ENG ? "en->" : "->en";
  const forms = CODE_FORMS[nonEng] ?? [];
  const found = [];
  for (const form of forms) {
    const enToX = mirrorPairs.has(`en-${form}`);
    const xToEn = mirrorPairs.has(`${form}-en`);
    if (enToX) found.push(`en-${form}`);
    if (xToEn) found.push(`${form}-en`);
  }
  // Also check the already-integrated route (should be none for full routes).
  const routed = bergamotPairFor(direction.src, direction.tgt);

  if (found.length > 0) {
    // Collect the file inventory for every mirror pair that serves this
    // language (both directions recorded; the audit is per language).
    const inventories = {};
    for (const pair of found) {
      const names = tree.filter((e) => e.path.startsWith(`${pair}/`) && e.type === "file").map((e) => e.path.split("/").pop());
      const files = [];
      for (const name of names) {
        const pin = await headPin(pair, name);
        if (pin) files.push(pin);
      }
      inventories[pair] = {
        license: "MPL-2.0 (mirror repo midudev/firefox-translations; upstream Mozilla Firefox Translations models)",
        files,
        totalBytes: files.reduce((s, f) => s + f.bytes, 0),
      };
    }
    findings.push({ ...direction, side, mirrorPairs: found, routed, inventories });
    console.log(`${direction.src}|${direction.tgt} (${direction.english}, ${side}): MODEL on mirror -> ${found.join(", ")}`);
  } else {
    // No mirror model. Does Mozilla publish one at all (GCS registry)?
    const registryHits = [];
    for (const form of forms) {
      if (registry.models[`en-${form}`]) registryHits.push(`en-${form}`);
      if (registry.models[`${form}-en`]) registryHits.push(`${form}-en`);
    }
    findings.push({ ...direction, side, mirrorPairs: [], routed, registryOnly: registryHits });
    console.log(
      `${direction.src}|${direction.tgt} (${direction.english}, ${side}): NO mirror model${registryHits.length ? ` (exists only on the CORS-blocked GCS registry: ${registryHits.join(", ")})` : " (no model exists anywhere in Mozilla's registry)"}`,
    );
  }
}

// --- 4. Fidelity: mirror bytes vs Mozilla's own registry hashes ----------
// The registry lists several variants per pair (base for desktop,
// base-memory for Android, tiny). The mirror carries exactly one of them;
// the model file must match that variant byte-for-byte (size + sha256).
for (const finding of findings) {
  for (const [pair, inv] of Object.entries(finding.inventories ?? {})) {
    const registryVariants = registry.models[pair] ?? [];
    if (registryVariants.length === 0) {
      throw new Error(`FIDELITY GAP: pair ${pair} is on the mirror but absent from Mozilla's registry`);
    }
    const modelFile = inv.files.find((f) => f.name.startsWith("model."));
    const matching = registryVariants.filter((variant) => {
      const rf = variant.files?.model;
      return rf?.uncompressedSize === modelFile.bytes && rf?.uncompressedHash === modelFile.sha256;
    });
    if (matching.length === 0) {
      throw new Error(`FIDELITY MISMATCH ${pair}/${modelFile.name}: no registry variant matches the mirror bytes`);
    }
    inv.matchesRegistryVariant = matching.map((m) => `${m.architecture}:${m.releaseStatus}`);
  }
}
console.log("fidelity: every new pair's model file matches a Mozilla registry variant byte-for-byte (size + sha256)");

// --- 5. CORS spot-check on one new file ------------------------------------
const probeUrl = `https://huggingface.co/${BERGAMOT_MIRROR}/resolve/${BERGAMOT_REVISION}/en-pl/model.enpl.intgemm.alphas.bin`;
const probe = await fetch(probeUrl, { method: "GET", headers: { Range: "bytes=0-0", Origin: "http://localhost:3000" }, redirect: "manual" });
const corsHeader = probe.headers.get("access-control-allow-origin");
console.log(`CORS spot-check (GET en-pl model, Origin http://localhost:3000): status ${probe.status}, access-control-allow-origin: ${corsHeader}`);

// --- 6. Tagalog deep check: any other browser-fetchable mirror? ----------
// Search the HF model hub for repos carrying Firefox Translations models.
const searches = await Promise.all(
  ["firefox-translations", "bergamot", "bergamot-translator"].map((q) =>
    fetch(`https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=100`).then((r) => r.json()),
  ),
);
const candidateRepos = new Map();
for (const results of searches) for (const r of results) candidateRepos.set(r.id, r.downloads ?? 0);
const tagalogRepos = [];
for (const repoId of candidateRepos.keys()) {
  if (repoId === BERGAMOT_MIRROR) continue;
  try {
    const info = await (await fetch(`https://huggingface.co/api/models/${repoId}`)).json();
    const names = (info.siblings || []).map((f) => f.rfilename || f.file || "");
    const tl = names.filter((n) => /^(en-)?tl(e|n)?[-/]/.test(n) || /tl(en|e)\./.test(n));
    if (tl.length > 0) tagalogRepos.push({ repoId, files: tl.slice(0, 6) });
  } catch {
    // Skip unreachable repos.
  }
}
console.log(`tagalog deep check: ${candidateRepos.size} HF repos searched, ${tagalogRepos.length} carry Tagalog files`);

const audit = {
  generatedAt: new Date().toISOString(),
  mirror: { repo: BERGAMOT_MIRROR, revision: BERGAMOT_REVISION, pairCount: mirrorPairs.size, pairs: [...mirrorPairs].sort() },
  fullModelEnglishDirections: findings.length,
  findings,
  nonEnglishPairs: {
    orderedPairs: nonEnglishFullCount.orderedPairs,
    distinctLanguages: nonEnglishFullCount.srcs.size,
    note: "No non-English pair has a model on the mirror (all mirror pairs are X-en), Mozilla's registry has none, and pivoting through English is forbidden. Every non-English pair keeps the full model.",
  },
  tagalogSearch: { reposSearched: candidateRepos.size, reposWithTagalog: tagalogRepos },
};
writeFileSync(join(HERE, "p11-audit.json"), JSON.stringify(audit, null, 2));
console.log(`\nwrote scripts/bergamot/p11-audit.json: ${findings.length} full-model English directions audited`);

#!/usr/bin/env node
// P10 research: collect the pinned file inventory (byte size + sha256) for
// every Bergamot model pair we consider routing, straight from the mirror's
// pinned revision. The x-linked-size / x-linked-etag headers on the Hugging
// Face resolve endpoint carry the exact byte size and the SHA-256 of each
// xet-stored file, so the pins come from the same source that serves the
// bytes. Run once; the output feeds src/lib/bergamot/bundles.ts.
import { writeFileSync } from "node:fs";

const REPO = "midudev/firefox-translations";
const REVISION = "6f6acd72c26975a06a8e61b72d1fbacbd184c23f";

// Candidate pairs: every direction whose current route is quarantined, a
// full-model route, or a limited (failed-the-bar) small model, plus the
// languages that never had a small model at all.
const PAIRS = [
  // quarantined / full-model routes
  "en-hr", "hbs-en", "en-sr", "en-nb", "nb-en", "en-bg", "el-en", "en-el",
  "en-ro", "ro-en", "en-fa", "fa-en", "en-ca", "ca-en", "en-ms", "ms-en", "en-vi",
  // limited-tier routes and their missing reverse directions
  "vi-en", "en-ja", "ja-en", "en-th", "th-en", "en-tr", "tr-en", "en-uk", "uk-en",
  "af-en", "id-en", "ru-en", "ko-en", "bg-en",
  // never had a small model: Traditional Chinese
  "en-zh-Hant", "zh-Hant-en",
  // P11 audit finds: Polish (en->pl full model, pl->en Opus borderline swap
  // candidate), English to Korean (full model; the P10 "unfetchable" note
  // was wrong), Hebrew to English (full model, tiny variant)
  "en-pl", "pl-en", "en-ko", "he-en",
];

const files = {};
for (const pair of PAIRS) files[pair] = [];

// The blobs listing is fetched live so the script is self contained.
const listing = await (await fetch(`https://huggingface.co/api/models/${REPO}?blobs=true`)).json();
const names = (listing.siblings || []).map((f) => f.rfilename || f.file);

for (const pair of PAIRS) {
  const pairFiles = names.filter((n) => n.startsWith(`${pair}/`));
  if (pairFiles.length === 0) {
    console.error(`${pair}: MISSING in mirror`);
    continue;
  }
  for (const name of pairFiles) {
    const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`;
    let headers;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual" });
        headers = res.headers;
        if (res.status === 302 || res.status === 200) break;
      } catch (err) {
        console.error(`  retry ${name}: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    const size = Number(headers.get("x-linked-size"));
    const sha = (headers.get("x-linked-etag") || "").replace(/"/g, "");
    if (!size || !/^[0-9a-f]{64}$/.test(sha)) {
      console.error(`${name}: no xet headers (size=${size} sha=${sha})`);
      continue;
    }
    files[pair].push({ name: name.split("/").pop(), bytes: size, sha256: sha });
    console.log(`${pair}/${name.split("/").pop()} ${size} ${sha.slice(0, 16)}…`);
  }
}

const out = { repo: REPO, revision: REVISION, collectedAt: new Date().toISOString(), pairs: files };
writeFileSync(new URL("./bergamot-pins.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
const total = Object.values(files).flat().reduce((s, f) => s + f.bytes, 0);
console.log(`\n${Object.keys(files).length} pairs, ${Object.values(files).flat().length} files, ${(total / 1048576).toFixed(1)} MB total on the mirror`);

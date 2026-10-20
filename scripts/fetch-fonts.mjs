#!/usr/bin/env node
// Extracts script-subset @font-face blocks from Google Fonts CSS already
// downloaded to /tmp and downloads the woff2 files into public/fonts.
// Everything ends up self hosted. Run once during setup; the app never talks
// to Google Fonts at runtime.
//
// Only the four script companion families belong here (declared by hand in
// src/app/globals.css with unicode-range). The Latin faces live in
// src/fonts/ and load through next/font/local in layout.tsx, so this script
// must not write them, and it writes no fonts.css: nothing imports one.
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const OUT_DIR = "public/fonts";
const TMP = "/tmp";

// [css file, subset to keep, output family name, weight]
const WANTED = [
  ["IBM+Plex+Sans+Arabic_wght@400.css", "arabic", "plex-arabic", "400"],
  ["IBM+Plex+Sans+Arabic_wght@500.css", "arabic", "plex-arabic", "500"],
  ["IBM+Plex+Sans+Devanagari_wght@400.css", "devanagari", "plex-devanagari", "400"],
  ["IBM+Plex+Sans+Devanagari_wght@500.css", "devanagari", "plex-devanagari", "500"],
  ["IBM+Plex+Sans+Hebrew_wght@400.css", "hebrew", "plex-hebrew", "400"],
  ["IBM+Plex+Sans+Hebrew_wght@500.css", "hebrew", "plex-hebrew", "500"],
  ["IBM+Plex+Sans+Thai_wght@400.css", "thai", "plex-thai", "400"],
  ["IBM+Plex+Sans+Thai_wght@500.css", "thai", "plex-thai", "500"],
];

function parseBlocks(css) {
  // Google css2 output: /* subset */\n@font-face { ... }
  const blocks = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const decls = {};
    for (const line of m[2].split(";")) {
      const idx = line.indexOf(":");
      if (idx > 0) decls[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    blocks.push({ subset: m[1], ...decls });
  }
  return blocks;
}

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const seen = new Set();
for (const [cssFile, subset, family, weight] of WANTED) {
  const css = await readFile(`${TMP}/${cssFile}`, "utf8");
  const block = parseBlocks(css).find((b) => b.subset === subset);
  if (!block || !block.src) {
    console.error(`MISSING subset ${subset} in ${cssFile}`);
    continue;
  }
  const url = block.src.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url) {
    console.error(`MISSING woff2 url in ${cssFile} ${subset}`);
    continue;
  }
  const key = `${family}-${weight}-${subset}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const filename = `${family}-${weight}-${subset}.woff2`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`DOWNLOAD FAILED ${url}: ${res.status}`);
    continue;
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(`${OUT_DIR}/${filename}`, buffer);
  console.log(`${filename} ${(buffer.length / 1024).toFixed(0)}KB`);
}
const files = await readdir(OUT_DIR);
console.log(`${files.length} files in ${OUT_DIR}`);

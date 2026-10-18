#!/usr/bin/env node
// Extracts latin/latin-ext/script-subset @font-face blocks from Google Fonts CSS
// already downloaded to /tmp and downloads the woff2 files into public/fonts.
// Everything ends up self hosted. Run once during setup; the app never talks to
// Google Fonts at runtime.
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";

const OUT_DIR = "public/fonts";
const TMP = "/tmp";

// [css file, subset to keep, output family name, weight]
const WANTED = [
  ["Newsreader_opsz_wght@6..72_500.css", "latin", "newsreader", "500"],
  ["Newsreader_opsz_wght@6..72_600.css", "latin", "newsreader", "600"],
  ["IBM+Plex+Sans_wght@400.css", "latin", "plex-sans", "400"],
  ["IBM+Plex+Sans_wght@400.css", "latin-ext", "plex-sans", "400"],
  ["IBM+Plex+Sans_wght@500.css", "latin", "plex-sans", "500"],
  ["IBM+Plex+Sans_wght@500.css", "latin-ext", "plex-sans", "500"],
  ["IBM+Plex+Sans_wght@600.css", "latin", "plex-sans", "600"],
  ["IBM+Plex+Sans_wght@600.css", "latin-ext", "plex-sans", "600"],
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

const cssOut = [];
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
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(`${OUT_DIR}/${filename}`, buf);
  const range = block["unicode-range"];
  cssOut.push(
    `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/fonts/${filename}") format("woff2");\n${range ? `  unicode-range: ${range};\n` : ""}}`,
  );
  console.log(`${filename} ${(buf.length / 1024).toFixed(0)}KB`);
}
await writeFile(`${OUT_DIR}/fonts.css`, cssOut.join("\n\n") + "\n");
console.log("wrote public/fonts/fonts.css");
const files = await readdir(OUT_DIR);
console.log(`${files.length} files in ${OUT_DIR}`);

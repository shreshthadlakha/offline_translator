#!/usr/bin/env node
// scripts/scan/check-import-case.mjs — read-only case-sensitivity audit.
//
// Wrong-case import specifiers (or wrong-case public asset URLs) resolve fine
// on macOS/Windows (case-insensitive filesystems) and then explode on a
// case-sensitive Linux runner (GitHub Actions) or at runtime for the service
// worker's precache list. This script never writes anything outside stdout.
//
// What it checks:
//   1. Every static import / re-export / dynamic import() / require()
//      specifier in src/ and scripts/ (ts, tsx, js, mjs, cjs, jsx).
//      - relative (./ ../) resolved against the importing file
//      - alias @/... and ~/... resolved against src/
//      - bare package names and URLs are skipped
//      For each resolved candidate we test the exact spelling with
//      fs.existsSync (case-sensitive on Linux). If it misses, we look for a
//      file whose path matches ignoring case, and report the true casing.
//   2. Every string literal in src/ and scripts/ that looks like a public
//      asset URL ("/fonts/...", "/ort/...", "/bergamot/...", "/icons/...",
//      "/icon.svg", "/logo.svg", "/manifest.webmanifest",
//      "/translator.worker.js", "/sw.js") — verified against public/.
//   3. The service worker template's PRECACHE list (scripts/sw-template.js)
//      against what public/ actually contains, and the CACHE_FIRST prefixes
//      against the real directories.
//
// Exit 0 = clean, 1 = findings. Node >= 18.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(ROOT, "src");
const SCRIPTS = join(ROOT, "scripts");
const PUBLIC = join(ROOT, "public");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "tool-results", "download", "cache", ".cache", "data", "runs", "logs", "models"]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// --- collect files -------------------------------------------------------------------

function walk(dir, out, opts = {}) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (opts.onlyPublic && entry.name !== "public") continue;
      walk(p, out, opts);
    } else if (CODE_EXT.test(entry.name)) {
      out.push(p);
    }
  }
}

const codeFiles = [];
walk(SRC, codeFiles);
walk(SCRIPTS, codeFiles);
// The audit scripts themselves contain regex/literal samples that would
// self-match; they are tooling, not app code.
const filtered = codeFiles.filter((f) => !f.includes(join("scripts", "scan")));
codeFiles.length = 0;
codeFiles.push(...filtered);

// One lowercase-path index for case-insensitive lookups (repo files only).
const lowerIndex = new Map(); // lowercase absolute -> actual absolute
function indexDir(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name === "node_modules") continue;
      indexDir(p);
    } else {
      lowerIndex.set(p.toLowerCase(), p);
    }
  }
}
indexDir(ROOT);
for (const dir of [join(ROOT, "public"), join(ROOT, "src"), join(ROOT, "scripts")]) indexDir(dir);

// --- specifier extraction --------------------------------------------------------------

const IMPORT_RE = /(?:^|[\s;}()])(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},$]+?\s+from\s+)?["']([^"'\n]+)["']/g;
const BARE_IMPORT_RE = /(?:^|[\s;}()])import\s+["']([^"'\n]+)["']/g;
const DYNAMIC_RE = /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g;

function specifiersOf(text) {
  const specs = [];
  for (const re of [IMPORT_RE, BARE_IMPORT_RE, DYNAMIC_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) specs.push(m[1]);
  }
  return specs;
}

const EXT_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".woff2", ".svg", ".png"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs", "/index.cjs"];

/** Resolve a specifier to the candidate absolute paths (bundler resolution). */
function candidatesFor(spec, fromFile) {
  if (spec.startsWith("@/")) return [{ base: join(SRC, spec.slice(2)), kind: "alias" }];
  if (spec.startsWith("~/")) return [{ base: join(SRC, spec.slice(2)), kind: "alias" }];
  if (spec.startsWith("./") || spec.startsWith("../")) return [{ base: resolve(dirname(fromFile), spec), kind: "relative" }];
  if (spec.startsWith("/")) return [{ base: join(ROOT, spec.replace(/^\/+/, "")), kind: "rooted" }];
  return []; // bare specifier or URL: not a filesystem case question
}

function resolveSpecifier(spec, fromFile) {
  for (const { base, kind } of candidatesFor(spec, fromFile)) {
    for (const suffix of [...EXT_SUFFIXES.map((s) => base + s), ...INDEX_SUFFIXES.map((s) => base + s)]) {
      if (existsSync(suffix)) return { resolved: suffix, kind, exact: true };
    }
    // No exact hit anywhere: look for a case-variant of every candidate.
    for (const suffix of [...EXT_SUFFIXES.map((s) => base + s), ...INDEX_SUFFIXES.map((s) => base + s)]) {
      const variant = lowerIndex.get(suffix.toLowerCase());
      if (variant) return { resolved: variant, kind, exact: false, tried: suffix };
    }
  }
  return null;
}

const findings = [];
let importsChecked = 0;

for (const file of codeFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const spec of specifiersOf(text)) {
    const result = resolveSpecifier(spec, file);
    if (!result) continue; // bare/URL or unresolvable-but-not-case-related
    importsChecked++;
    if (!result.exact) {
      findings.push({
        file: file.replace(ROOT + "/", ""),
        spec,
        detail: `resolved case-insensitively to ${result.resolved.replace(ROOT + "/", "")} (no exact match at ${result.tried.replace(ROOT + "/", "")})`,
      });
    }
  }
}

// --- public asset URL literals ----------------------------------------------------------

const ASSET_URL_RE = /["'](\/(?:fonts|ort|bergamot|icons)\/[^"'\s?#]+|\/(?:icon|logo)\.svg|\/manifest\.webmanifest|\/robots\.txt|\/translator\.worker\.js|\/sw\.js)["']/g;

let assetUrlsChecked = 0;
for (const file of codeFiles) {
  const text = readFileSync(file, "utf8");
  ASSET_URL_RE.lastIndex = 0;
  let m;
  while ((m = ASSET_URL_RE.exec(text))) {
    const url = m[1];
    if (url.includes("${")) continue; // template interpolation: runtime-built URL
    assetUrlsChecked++;
    const fsPath = join(PUBLIC, url.slice(1));
    if (existsSync(fsPath)) continue;
    const variant = lowerIndex.get(fsPath.toLowerCase());
    findings.push({
      file: file.replace(ROOT + "/", ""),
      spec: url,
      detail: variant
        ? `public asset exists with different case: ${variant.replace(ROOT + "/", "")}`
        : "public asset does not exist in public/ (generated at install? missing?)",
    });
  }
}

// --- service worker precache list vs public/ ----------------------------------------------

const swText = readFileSync(join(SCRIPTS, "sw-template.js"), "utf8");
const PRECACHE_RE = /^\s*"([^"]+)",?\s*$/gm;
const precacheList = [];
let pm;
while ((pm = PRECACHE_RE.exec(swText))) if (pm[1].startsWith("/")) precacheList.push(pm[1]);

let precacheChecked = 0;
for (const url of precacheList) {
  precacheChecked++;
  const fsPath = join(PUBLIC, url.slice(1).replace(/\/$/, ""));
  if (url === "/") continue; // the shell route, not a file
  if (existsSync(fsPath) || (existsSync(join(PUBLIC, url.slice(1))) && statSync(join(PUBLIC, url.slice(1))).isDirectory())) continue;
  const variant = lowerIndex.get(fsPath.toLowerCase());
  findings.push({
    file: "scripts/sw-template.js",
    spec: url,
    detail: variant
      ? `precache entry case-mismatched: real file is ${variant.replace(ROOT + "/", "")}`
      : "precache entry has no file in public/ (SW will silently fail this entry)",
  });
}

// CACHE_FIRST prefixes must name real directories (or files).
const CACHE_FIRST_RE = /CACHE_FIRST\s*=\s*\[([^\]]*)\]/;
const cfMatch = CACHE_FIRST_RE.exec(swText);
const cfPrefixes = cfMatch ? [...cfMatch[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
for (const prefix of cfPrefixes) {
  const p = join(PUBLIC, prefix.slice(1).replace(/\/$/, ""));
  if (!existsSync(p)) {
    findings.push({ file: "scripts/sw-template.js", spec: prefix, detail: "CACHE_FIRST prefix names nothing in public/" });
  }
}

// --- report -------------------------------------------------------------------------------

console.log(`import-case audit: ${codeFiles.length} code files, ${importsChecked} resolvable import specifiers, ${assetUrlsChecked} public asset URLs, ${precacheChecked} SW precache entries (${cfPrefixes.length} cache-first prefixes)`);
if (findings.length === 0) {
  console.log("PASS: every import specifier, asset URL and precache entry matches the real path casing.");
  process.exit(0);
}
console.log(`FAIL: ${findings.length} case/file mismatch(es):`);
for (const f of findings) {
  console.log(`  - ${f.file}: "${f.spec}" — ${f.detail}`);
}
process.exit(1);

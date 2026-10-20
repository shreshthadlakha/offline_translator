#!/usr/bin/env node
// Measures the compressed first-visit size of the built app: the HTML of /
// plus every JS and CSS asset it references, as actually transferred over
// the wire with gzip. Uses curl (no transparent decompression) so every
// number is a wire number. Run against a locally started standalone build.
//
// Usage: node scripts/release/measure-first-visit.mjs [http://127.0.0.1:3131]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3131";

function wireBytes(path) {
  // size_download is the compressed transfer size: without --compressed,
  // curl keeps the body as received.
  const out = spawnSync("curl", ["-s", "-H", "Accept-Encoding: gzip", "-o", "/dev/null", "-w", "%{size_download}", `${BASE}${path}`], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`curl failed for ${path}`);
  return Number(out.stdout);
}

function bodyText(path) {
  const out = spawnSync("curl", ["-s", `${BASE}${path}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  return out.stdout;
}

const html = bodyText("/");
if (!html || !html.includes("<html")) throw new Error("no HTML from the page");

// Every script and stylesheet the HTML asks for, plus preload link targets.
const urls = new Set();
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) urls.add(match[1]);
for (const match of html.matchAll(/<link[^>]+href="([^"]+)"/g)) {
  if (/\.(js|css)$/.test(match[1])) urls.add(match[1]);
}

const items = [{ path: "/", bytes: wireBytes("/") }];
for (const url of urls) {
  if (url.startsWith("/")) items.push({ path: url, bytes: wireBytes(url) });
}

const total = items.reduce((sum, item) => sum + item.bytes, 0);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2) + " MiB";
console.log("First visit, compressed, as transferred:");
for (const item of items) console.log(`  ${String(item.bytes).padStart(8)} B  ${item.path}`);
console.log(`  ${"-".repeat(16)}`);
console.log(`  ${String(total).padStart(8)} B  total (${mb(total)}) over ${items.length} requests`);

// The deferred costs, reported for honesty: the worker + ORT runtime load
// when translation is first set up; the fonts load per script on demand.
const deferred = ["/translator.worker.js", "/ort/ort-wasm-simd-threaded.jsep.mjs", "/ort/ort-wasm-simd-threaded.jsep.wasm"];
console.log("\nNot part of the first paint (loaded when translation is first used):");
let deferredTotal = 0;
for (const path of deferred) {
  const bytes = wireBytes(path);
  deferredTotal += bytes;
  console.log(`  ${String(bytes).padStart(8)} B  ${path}`);
}
console.log(`  ${"-".repeat(16)}`);
console.log(`  ${String(deferredTotal).padStart(8)} B  total (${mb(deferredTotal)})`);

writeFileSync("/tmp/first-visit.json", JSON.stringify({ base: BASE, items, total, deferredTotal }, null, 2));

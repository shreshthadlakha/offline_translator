#!/usr/bin/env node
// The worker's source stamp: a sha256 over every file under src/workers and
// src/lib (everything the worker bundle can import), sorted by path. Shared
// by scripts/build-worker.mjs (which writes it into the first line of the
// generated bundle) and scripts/check-drift.mjs (which recomputes it), so a
// stale public/translator.worker.js can never pass for a fresh one.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function sourceStamp(root = ROOT) {
  const hash = createHash("sha256");
  const files = [];
  for (const dir of ["src/workers", "src/lib"]) {
    const base = join(root, dir);
    let entries;
    try {
      entries = readdirSync(base, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(base, entry);
      let isFile = false;
      try {
        isFile = statSync(full).isFile();
      } catch {
        continue;
      }
      if (!isFile) continue;
      files.push(`${dir}/${String(entry).replaceAll("\\", "/")}`);
    }
  }
  files.sort();
  for (const rel of files) {
    hash.update(rel);
    hash.update(readFileSync(join(root, rel)));
  }
  return { stamp: hash.digest("hex"), files: files.length };
}

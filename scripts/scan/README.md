# scripts/scan — P15 static tool pass

Read-only bug-scan tooling for Private Translator (Task ID: 30-tools).
Nothing here modifies app code, configs, `package.json` or
`package-lock.json`; the only side effects are the logs under `logs/`.

## Scripts

| Script | What it runs | Needs |
| --- | --- | --- |
| `static-tools.sh` | typecheck, lint, `npm audit` (dev + prod-only), `ts-prune`, `madge --circular`, `depcheck` | project deps installed; network for audit; `npx -y` fetches the extra tools without installing them |
| `a11y-lint.sh` | extra ESLint pass with jsx-a11y (recommended, all "warn") + `react-hooks/exhaustive-deps` and `rules-of-hooks` ("error") over `src/`, skipping vendored `src/components/ui` | network (installs eslint + plugins into `/tmp/scan-tools`, its own `package.json`) |
| `check-import-case.mjs` | case-sensitive import/asset audit: every import specifier in `src/` + `scripts/`, every public asset URL and SW precache entry vs the real file names (0 mismatches at P15) | node, nothing else |
| `targeted-grep.sh` | pattern batteries: network call sites, XSS/injection sinks, unsafe types, leftovers (console/TODO), cleanup sites (timers/listeners/object URLs), storage/JSON-parse sites, and the privacy check that `z-ai-web-dev-sdk`/`next-auth`/`@prisma/client` stay absent from `src/` | `rg` (ripgrep) |

Run them from the project root:

```sh
bash scripts/scan/static-tools.sh
bash scripts/scan/a11y-lint.sh
node scripts/scan/check-import-case.mjs
bash scripts/scan/targeted-grep.sh
```

## Outputs (scripts/scan/logs/)

- `typecheck.txt`, `lint.txt` — exit codes recorded by the runner; empty output means clean.
- `npm-audit.json` / `npm-audit-prod.json` — full and `--omit=dev` audit. Read counts from `metadata.vulnerabilities`, advisories from `vulnerabilities`.
- `ts-prune.txt` — unused-export candidates.
- `madge.txt` — circular-dependency report (`✔ No circular dependency found!` = clean).
- `depcheck.json` — unused-dependency candidates (plus `missing` = phantom imports).
- `eslint-a11y.txt` — jsx-a11y warnings + react-hooks errors, paths rewritten to the real project files.
- `targeted-network.txt` / `targeted-xss.txt` / `targeted-types.txt` / `targeted-leftovers.txt` / `targeted-cleanup.txt` / `targeted-storage.txt` — the grep battery logs (hits are leads, not findings).

## How to read the candidate-only tools

- **ts-prune** reports every export no other module imports. Known false
  positives in this repo: exports consumed only through the esbuild worker
  bundle's entry, `"(used in module)"` lines (live code, just over-exported),
  Next.js entry conventions (`metadata`/`viewport`/default exports in
  `src/app/*`), and the ~50 vendored `src/components/ui/*` files. Cross-check
  each hit with `rg "<name>" src scripts` before believing it.
- **depcheck** misses non-import usage: `@mkljczk/bergamot-translator` (copied
  into `public/` by `scripts/copy-bergamot.mjs` at install), devDeps used from
  configs (`@tailwindcss/postcss` in `postcss.config.mjs`, `tw-animate-css`
  in `src/app/globals.css`) or spawned CLIs (`esbuild` via
  `scripts/build-worker.mjs`). Its `missing` section still matters:
  `onnxruntime-web` is imported by `src/workers/*-engine.ts` but resolved
  only transitively through `@huggingface/transformers`.
- **eslint-a11y** warnings on Radix/cmdk components (`DropdownMenuItem`,
  `Label htmlFor=...` + sibling control, hidden file input behind a labeled
  button) are largely artifacts of the strict rule defaults and the
  components mapping in `eslint-a11y.config.mjs`; triage by hand.

## Why a11y-lint.sh copies src and works in /tmp

ESLint 9 refuses to lint files outside the flat config's base path, and the
a11y/plugins must not be installed into the project. So the script installs
them in `/tmp/scan-tools`, copies `src/` there (line numbers identical), and
rewrites the reported paths back to `/home/z/my-project/src/...`.

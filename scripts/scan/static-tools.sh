#!/usr/bin/env bash
# P15 static scan, steps 1-6: the six read-only tool passes over the project.
# Extra tooling (ts-prune, madge, depcheck) is fetched with `npx -y`, never
# installed into the project, so package.json / package-lock.json and git
# status stay untouched (verify afterwards with `git status --short`).
#
# Usage:   bash scripts/scan/static-tools.sh
# Output:  scripts/scan/logs/{typecheck,lint,npm-audit,npm-audit-prod,
#          ts-prune,madge,depcheck}.txt|json
# Notes:   - npm audit needs network access; failures are noted, not fatal.
#          - ts-prune / depcheck output is CANDIDATES ONLY, full of false
#            positives (dynamic imports, install-time scripts, vendored shadcn
#            code); every hit must be cross-checked with a grep before it is
#            believed. See scripts/scan/README.md.
#          - madge exits non-zero only when circular dependencies are found.
set -uo pipefail

PROJECT=/home/z/my-project
LOGS="$PROJECT/scripts/scan/logs"
mkdir -p "$LOGS"
cd "$PROJECT"

run() { # run <logname> <command...>
  local name="$1"; shift
  "$@" > "$LOGS/$name" 2>&1
  echo "$name: exit $?"
}

echo "== 1. typecheck (tsc --noEmit, strict) =="
run typecheck.txt npm run typecheck

echo "== 2. lint (eslint .) =="
run lint.txt npm run lint

echo "== 3. npm audit (dev+prod and prod-only; needs network) =="
run npm-audit.json npm audit --json
run npm-audit-prod.json npm audit --omit=dev --json
node -e '
for (const f of ["npm-audit.json","npm-audit-prod.json"]) {
  try {
    const j = JSON.parse(require("fs").readFileSync("'"$LOGS"'/" + f, "utf8"));
    const v = j.metadata && j.metadata.vulnerabilities || {};
    console.log(f, JSON.stringify(v));
  } catch { console.log(f, "not readable (network failed?)"); }
}'

echo "== 4. unused exports (ts-prune; candidates only) =="
run ts-prune.txt npx -y ts-prune

echo "== 5. circular dependencies (madge) =="
run madge.txt npx -y madge --circular --extensions ts,tsx --ts-config tsconfig.json src

echo "== 6. unused dependencies (depcheck; candidates only) =="
run depcheck.json npx -y depcheck --json

echo "Done. Raw logs in $LOGS — triage every ts-prune/depcheck hit by hand."

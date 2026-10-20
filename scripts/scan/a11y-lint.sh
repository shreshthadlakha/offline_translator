#!/usr/bin/env bash
# P15 static scan, extra ESLint pass: jsx-a11y + react-hooks over the project's
# src/ WITHOUT touching the project's node_modules or package manifests.
#
# How: a scratch dir /tmp/scan-tools gets its own package.json and installs
# eslint@9, @typescript-eslint/parser, eslint-plugin-jsx-a11y,
# eslint-plugin-react-hooks and typescript THERE (never in the project). ESLint
# 9 refuses to lint files outside the flat config's base path, so this script
# COPIES the project's src/ tree into /tmp/scan-tools/src (line numbers are
# identical), copies scripts/scan/eslint-a11y.config.mjs in as
# /tmp/scan-tools/eslint.config.mjs and runs eslint with cwd /tmp/scan-tools.
# Vendored shadcn code (src/components/ui) is skipped by the config's ignores.
# Finally the log's relative paths are rewritten to /home/z/my-project/src/...
#
# Output: scripts/scan/logs/eslint-a11y.txt (exit code 0 = no "error"-level
# findings; warnings are expected and triaged by hand).
set -uo pipefail

PROJECT=/home/z/my-project
SCRATCH=/tmp/scan-tools
LOG="$PROJECT/scripts/scan/logs/eslint-a11y.txt"
mkdir -p "$(dirname "$LOG")" "$SCRATCH"

cd "$SCRATCH"
[ -f package.json ] || npm init -y > /dev/null
npm install --no-fund --no-audit \
  eslint@9 @typescript-eslint/parser eslint-plugin-jsx-a11y \
  eslint-plugin-react-hooks typescript > "$SCRATCH/install.log" 2>&1

# Fresh copy of the app sources so the base path covers them.
rm -rf "$SCRATCH/src"
cp -R "$PROJECT/src" "$SCRATCH/src"
cp "$PROJECT/scripts/scan/eslint-a11y.config.mjs" "$SCRATCH/eslint.config.mjs"

npx eslint src --format stylish > "$LOG.raw" 2>&1
STATUS=$?
# Rewrite the scratch-copy paths back to the real project paths.
sed "s|/tmp/scan-tools/src|/home/z/my-project/src|g; s|^src/|/home/z/my-project/src/|" "$LOG.raw" > "$LOG"
rm -f "$LOG.raw"
echo "eslint exit $STATUS; output: $LOG"
exit $STATUS

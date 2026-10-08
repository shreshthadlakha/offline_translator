#!/usr/bin/env bash
# Runs the NLLB reference generation with the dev server stopped (it needs the
# memory), then restarts the dev server. Logs to gen-refs.log.
cd /home/z/my-project/scripts/language-audit

echo "[wrapper] stopping dev server to free memory" >> gen-refs.log
pkill -f "next dev" || true
pkill -f "next-server" || true
pkill -f "next/dist/build/postcss" || true
sleep 3

echo "[wrapper] starting gen-refs" >> gen-refs.log
MALLOC_ARENA_MAX=2 node gen-refs.mjs >> gen-refs.log 2>&1
echo "[wrapper] gen-refs exited with $?" >> gen-refs.log

echo "[wrapper] restarting dev server" >> gen-refs.log
cd /home/z/my-project
(bun run dev > dev.log 2>&1 &)
sleep 10
echo "[wrapper] dev server restarted" >> gen-refs.log

#!/usr/bin/env bash
# One chunk of NLLB reference generation with the dev server stopped, then
# the dev server is always restarted at the end (even if the chunk dies).
cd /home/z/my-project/scripts/language-audit

pkill -f "next dev" || true
pkill -f "next-server" || true
pkill -f "next/dist/build/postcss" || true
sleep 3

MALLOC_ARENA_MAX=2 timeout 540 node gen-refs.mjs >> gen-refs.log 2>&1
CHUNK_EXIT=$?
echo "[chunk] gen-refs chunk exited $CHUNK_EXIT" >> gen-refs.log

cd /home/z/my-project
(bun run dev > dev.log 2>&1 &)
sleep 8
curl -s -o /dev/null -w "[chunk] dev server back: %{http_code}\n" http://localhost:3000 >> gen-refs.log
exit $CHUNK_EXIT

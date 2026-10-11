#!/bin/bash
# Benchmark chunk wrapper: stops the dev server for the duration of one Node
# NLLB chunk (the full model peaks at ~2.9 GB and the sandbox has 4 GB total;
# the dev server holds up to 0.8 GB after compiling pages), then relaunches
# the dev server reaper-safely (double-fork) when the chunk ends.
#
# Usage: bash scripts/benchmark/chunk.sh <src> <tgt> <budgetSeconds> [extra args]
set -u
SRC="${1:?src}"
TGT="${2:?tgt}"
BUDGET="${3:?budget seconds}"
shift 3 || true

stop_dev_server() {
  pkill -TERM -f 'next dev -p 3000' 2>/dev/null || true
  pkill -TERM -f 'next-server' 2>/dev/null || true
  pkill -TERM -f 'bun run dev' 2>/dev/null || true
  pkill -TERM -f 'tee dev.log' 2>/dev/null || true
  sleep 3
  pkill -KILL -f 'next dev -p 3000' 2>/dev/null || true
  pkill -KILL -f 'next-server' 2>/dev/null || true
  pkill -KILL -f 'bun run dev' 2>/dev/null || true
  pkill -KILL -f 'tee dev.log' 2>/dev/null || true
  sleep 1
}

relaunch_dev_server() {
  bash -c 'bash -c "setsid /home/z/my-project/scripts/dev-relaunch.sh </dev/null >/dev/null 2>&1 &" & sleep 1'
}

echo "[chunk] stopping dev server for the NLLB chunk"
stop_dev_server
free -m | head -2

echo "[chunk] running benchmark chunk: $SRC -> $TGT, budget ${BUDGET}s"
cd /home/z/my-project || exit 1
bun scripts/benchmark/run.mjs "$SRC" "$TGT" --engine full --budget-seconds "$BUDGET" "$@"
RC=$?

echo "[chunk] relaunching dev server"
relaunch_dev_server
sleep 9
if curl -s -o /dev/null --max-time 5 http://127.0.0.1:3000/robots.txt; then
  echo "[chunk] dev server healthy after relaunch"
else
  echo "[chunk] WARNING: dev server not responding after relaunch"
fi
exit $RC

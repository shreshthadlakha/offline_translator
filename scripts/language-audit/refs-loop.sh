#!/usr/bin/env bash
# Runs ALL remaining NLLB reference directions in chunks, with the dev server
# stopped the whole time (the model needs the memory), then restarts the dev
# server once at the end. Started detached with setsid so it survives across
# tool sessions. Progress: scripts/language-audit/nllb-refs-new.json.
cd /home/z/my-project/scripts/language-audit

pkill -f "next dev" || true
pkill -f "next-server" || true
pkill -f "next/dist/build/postcss" || true
sleep 3
echo "[loop] refs run starting $(date)" >> gen-refs.log

for i in $(seq 1 20); do
  DONE=$(python3 -c "
import json
d = json.load(open('nllb-refs-new.json'))
print('yes' if len(d.get('sources', {})) >= 45 and len(d.get('xToEn', {})) >= 45 else 'no')
" 2>/dev/null || echo no)
  if [ "$DONE" = "yes" ]; then
    echo "[loop] all directions done" >> gen-refs.log
    break
  fi
  MALLOC_ARENA_MAX=2 timeout 540 node gen-refs.mjs >> gen-refs.log 2>&1
  echo "[loop] chunk $i exited $?" >> gen-refs.log
done

echo "[loop] restarting dev server $(date)" >> gen-refs.log
cd /home/z/my-project
(bun run dev > dev.log 2>&1 &)
sleep 10
echo "[loop] dev server restarted" >> gen-refs.log

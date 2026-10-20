#!/bin/bash
# Quality gate orchestrator: NLLB reference chunks (fresh process per chunk to
# release memory), then all 21 small models (cold + cached runs), then the gate.
cd /home/z/my-project
export MALLOC_ARENA_MAX=2
LOG=scripts/quality-gate/orchestrate.log
echo "=== quality gate started $(date -Is)" >> $LOG
while true; do
  DONE=$(node -e 'try{const d=require("/home/z/my-project/scripts/quality-gate/nllb-references.json");process.stdout.write(String(d.directions.length))}catch{process.stdout.write("0")}')
  if [ "$DONE" -ge 21 ]; then echo "=== nllb references complete ($DONE/21)" >> $LOG; break; fi
  echo "=== nllb chunk run (have $DONE/21) $(date -Is)" >> $LOG
  MAX_DIRECTIONS=4 node scripts/quality-gate/generate-nllb-references.mjs >> $LOG 2>&1
  CODE=$?
  if [ $CODE -ne 0 ]; then echo "=== nllb chunk exit $CODE, waiting 5s" >> $LOG; sleep 5; fi
done
echo "=== small models drive $(date -Is)" >> $LOG
node scripts/quality-gate/drive.mjs >> $LOG 2>&1
echo "=== gate compare $(date -Is)" >> $LOG
node scripts/quality-gate/gate.mjs >> $LOG 2>&1
echo "=== quality gate finished $(date -Is)" >> $LOG

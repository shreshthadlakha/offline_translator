#!/usr/bin/env bash
# P15 targeted search battery: every pattern class the bug scan cares about,
# run against the owned source (src/ minus vendored ui, plus scripts/ and
# public/sw template sources). Writes one log per class to scripts/scan/logs/.
#
# Run:  bash scripts/scan/targeted-grep.sh          (from the repo root)
# Needs: rg (ripgrep) and nothing else. Read-only.
set -u
cd "$(dirname "$0")/../.."
OUT=scripts/scan/logs
mkdir -p "$OUT"
OWNED='src/app src/components/translate src/components/settings src/components/history src/components/batch src/components/share src/components/page src/components/translator-app.tsx src/components/app-header.tsx src/components/app-footer.tsx src/components/theme-provider.tsx src/hooks src/lib src/workers scripts'

note() { printf '%s\n' "$1"; }

note '== 1. network call sites (anything that can touch the network) =='
rg -n --no-heading -g '!node_modules' -g '!scripts/scan/logs/**' -e 'fetch\s*\(' -e 'XMLHttpRequest' -e 'sendBeacon' -e 'WebSocket' -e 'EventSource' -e 'navigator\.share' src scripts 2>/dev/null \
  | rg -v 'node_modules|\.next' > "$OUT/targeted-network.txt" || true
rg -n --no-heading 'https?://' src scripts 2>/dev/null | rg -v 'node_modules|scripts/scan/logs' >> "$OUT/targeted-network.txt" || true
note "   -> $OUT/targeted-network.txt"

note '== 2. XSS / injection sinks =='
rg -n --no-heading -e 'dangerouslySetInnerHTML' -e 'innerHTML' -e 'insertAdjacentHTML' -e '\beval\s*\(' -e 'document\.write' -e 'new Function' -e 'window\.open' src scripts/sw-template.js > "$OUT/targeted-xss.txt" || true
note "   -> $OUT/targeted-xss.txt"

note '== 3. unsafe types (review by hand; not all hits are bugs) =='
rg -n --no-heading -e ': any' -e 'as any' -e 'as unknown as' -e '@ts-ignore' -e '@ts-expect-error' -e '@ts-nocheck' $OWNED > "$OUT/targeted-types.txt" || true
rg -n --no-heading -e '!\.' -e '!\)' -e '\)!' $OWNED | rg -v '!==|!==|\?\.|!\(|aria' >> "$OUT/targeted-types.txt" || true
note "   -> $OUT/targeted-types.txt"

note '== 4. leftovers (debug + TODO + commented-out code smell) =='
rg -n --no-heading -e 'console\.(log|debug|info|warn|error)' -e 'debugger' $OWNED > "$OUT/targeted-leftovers.txt" || true
rg -n --no-heading -n -e 'TODO' -e 'FIXME' -e 'XXX' -e 'HACK' -e 'WIP' $OWNED | rg -v 'logs/' >> "$OUT/targeted-leftovers.txt" || true
note "   -> $OUT/targeted-leftovers.txt"

note '== 5. cleanup candidates (timers, listeners, object URLs) =='
rg -n --no-heading -e 'setInterval|setTimeout|clearInterval|clearTimeout' -e 'addEventListener|removeEventListener' -e 'createObjectURL|revokeObjectURL' -e 'new PerformanceObserver' $OWNED > "$OUT/targeted-cleanup.txt" || true
note "   -> $OUT/targeted-cleanup.txt"

note '== 6. storage + JSON parse sites =='
rg -n --no-heading -e 'localStorage|sessionStorage' -e 'JSON\.parse' -e 'caches\.(open|match|delete|keys)' $OWNED > "$OUT/targeted-storage.txt" || true
note "   -> $OUT/targeted-storage.txt"

note '== 7. privacy: known SDK / auth imports must stay absent from src =='
if rg -n --no-heading -e 'z-ai-web-dev-sdk' -e 'next-auth' -e '@prisma/client' src; then
  note '   !! FOUND — investigate'
else
  note '   clean: no src import of z-ai-web-dev-sdk / next-auth / @prisma/client'
fi
note 'Done. Review each log by hand; a hit is a lead, not a finding.'

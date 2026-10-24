#!/usr/bin/env bash
# Times FIXTURE-mode POST /api/replies (deterministic demo fixtures; no model call, no cost).
# Never sends mode "live" and never sends the access header.
# Usage: scripts/perf/replies-fixture.sh [base_url] [n=5]   (keep n small: server rate limit is 120/min)
set -euo pipefail
BASE="${1:-https://api-production-18038.up.railway.app}"; N="${2:-5}"
OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT
for i in $(seq 1 "$N"); do
  BODY=$(cat <<JSON
{"identity":{"sessionEpoch":"perf","workspaceId":"perf","requestId":"perf-$i","contextRevision":1,"preferenceRevision":0},
 "mode":"fixture","anchor":{"mode":"reply","turnId":"t1","turnContentRevision":0},
 "activePartnerText":"Are you coming to dinner tonight?","language":"en-US",
 "recentConversation":[{"role":"partner","text":"Are you coming to dinner tonight?","source":"partner-typed"}],
 "approvedProfile":[],"guidance":{"intent":null,"wording":[],"userTopicOrSeed":null,"scope":{"relationship":null,"setting":null}},
 "approvedPreferences":[],"sessionStyleHints":[],"rejected":[],"refineTarget":null,"lengthPolicy":{"maxWords":14,"maxCharacters":100}}
JSON
)
  curl -s -o "$OUT" -X POST -H 'content-type: application/json' --data "$BODY" \
    -w "run $i code=%{http_code} connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n" "$BASE/api/replies"
done
echo "last body (truncated):"; head -c 400 "$OUT"; echo

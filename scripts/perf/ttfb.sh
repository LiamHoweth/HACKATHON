#!/usr/bin/env bash
# Repeated curl timings for a GET URL. Usage: scripts/perf/ttfb.sh <url> [n=10] [accept-encoding=gzip]
# Each run is a new curl process, so a fresh TCP+TLS connection (DNS cached by the OS).
# Prints per-run lines and min/median/max of ttfb and total in ms. Works with macOS BSD awk.
set -euo pipefail
URL="$1"; N="${2:-10}"; ENC="${3:-gzip}"
OUT="$(mktemp)"; trap 'rm -f "$OUT"' EXIT
for i in $(seq 1 "$N"); do
  curl -s -o /dev/null -H "Accept-Encoding: $ENC" \
    -w '%{http_code} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{size_download}\n' "$URL"
done > "$OUT"
awk '{printf "run %2d code=%s connect=%.0fms tls=%.0fms ttfb=%.0fms total=%.0fms bytes=%s\n", NR, $1, $2*1000, $3*1000, $4*1000, $5*1000, $6}' "$OUT"
stats() { sort -n | awk '{v[NR]=$1} END{printf "min=%.0f median=%.0f max=%.0f", v[1], (NR%2? v[(NR+1)/2] : (v[NR/2]+v[NR/2+1])/2), v[NR]}'; }
echo "ttfb ms: $(awk '{print $4*1000}' "$OUT" | stats) | total ms: $(awk '{print $5*1000}' "$OUT" | stats) (n=$N)"

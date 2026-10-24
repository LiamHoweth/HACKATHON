#!/usr/bin/env bash
# Measures page weight of the Still Here home page as served (HTML + same-origin JS/CSS it references).
# Usage: scripts/perf/page-weight.sh [base_url]   (default: production Railway URL)
# Read-only GETs. No API calls. Prints per-asset transferred bytes for br, gzip and identity encodings.
set -euo pipefail
BASE="${1:-https://api-production-18038.up.railway.app}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fmt='%{http_code}\t%{size_download}\tdns=%{time_namelookup}\tconnect=%{time_connect}\ttls=%{time_appconnect}\tttfb=%{time_starttransfer}\ttotal=%{time_total}\n'

echo "# HTML ($BASE/)"
for enc in br gzip identity; do
  printf '%-9s ' "$enc"; curl -s -o "$TMP/index.$enc" -H "Accept-Encoding: $enc" -w "$fmt" "$BASE/"
done
curl -s -H 'Accept-Encoding: identity' "$BASE/" > "$TMP/index.html"

# Same-origin assets referenced by the HTML (scripts, stylesheets, preloads).
grep -oE '(src|href)="/_next/static/[^"]+"' "$TMP/index.html" | sed -E 's/^(src|href)="//; s/"$//' | sort -u > "$TMP/assets.txt"
echo
echo "# Assets referenced by HTML: $(wc -l < "$TMP/assets.txt" | tr -d ' ')"
printf 'path\tbr_bytes\tgzip_bytes\traw_bytes\tcontent-encoding(br)\tcache-control\n'
tb=0; tg=0; tr=0
while read -r p; do
  b=$(curl -s -o /dev/null -H 'Accept-Encoding: br' -w '%{size_download}' "$BASE$p")
  g=$(curl -s -o /dev/null -H 'Accept-Encoding: gzip' -w '%{size_download}' "$BASE$p")
  r=$(curl -s -o /dev/null -H 'Accept-Encoding: identity' -w '%{size_download}' "$BASE$p")
  hdr=$(curl -s -D - -o /dev/null -H 'Accept-Encoding: br' "$BASE$p" | tr -d '\r')
  ce=$(printf '%s\n' "$hdr" | awk -F': ' 'tolower($1)=="content-encoding"{print $2}')
  cc=$(printf '%s\n' "$hdr" | awk -F': ' 'tolower($1)=="cache-control"{print $2}')
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$p" "$b" "$g" "$r" "${ce:-none}" "$cc"
  tb=$((tb+b)); tg=$((tg+g)); tr=$((tr+r))
done < "$TMP/assets.txt"
echo "TOTAL_ASSETS br=$tb gzip=$tg raw=$tr"
echo
echo "# HTML response headers"
curl -s -D - -o /dev/null -H 'Accept-Encoding: br, gzip' "$BASE/" | tr -d '\r' | grep -iE '^(content-encoding|cache-control|content-type|server|x-railway|via|age|x-nextjs)' || true

#!/usr/bin/env bash
# Acceptance test for the per-IP rate limiter. This is the ONLY evidence that counts:
# two prior revisions shipped a limiter that passed code review and never fired in production.
#
# Sends up to 45 minimal narrate calls (max_tokens 1 — negligible spend) with a valid Origin,
# expecting HTTP 429 at request #41 (limit 40/min). Pass a site URL to test a deploy preview.
#
#   bash scripts/probe-limit.sh                       # tests production
#   bash scripts/probe-limit.sh https://<preview-url> # tests a preview
#
# Afterwards, check the function log: if it contains "[curate] Blobs rate-limit layer
# unavailable", the cross-instance (L2) layer is down and the 429 came from the in-memory
# (L1) layer — you are still protected, but L2 deserves a look.
URL="${1:-https://glass-box-provenance.netlify.app}"
echo "probing $URL (limit 40/min → expect 429 at #41)"
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/.netlify/functions/curate" \
    -H "Origin: $URL" -H "Content-Type: application/json" \
    -d '{"task":"narrate","messages":[{"role":"user","content":"."}],"max_tokens":1}')
  printf "%s " "$code"
  if [ "$code" = "429" ]; then echo; echo "PASS — rate limited at request #$i"; exit 0; fi
done
echo; echo "FAIL — 45 requests, never rate limited. The limiter is not working; check function logs."
exit 1

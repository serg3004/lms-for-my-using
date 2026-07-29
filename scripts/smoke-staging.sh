#!/usr/bin/env bash
# Verifies deployed API, Web, and the Web -> API proxy path.
#
# Required:
#   API_URL=https://api.example.com
#   WEB_URL=https://app.example.com
#
# Optional:
#   HEALTH_PATH=/api/v1/health
#   CURL_TIMEOUT_SECONDS=15
#   SMOKE_TOKEN=<bearer token>

set -euo pipefail

API_URL="${API_URL:?API_URL is required}"
WEB_URL="${WEB_URL:?WEB_URL is required}"
HEALTH_PATH="${HEALTH_PATH:-/api/v1/health}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"
SMOKE_TOKEN="${SMOKE_TOKEN:-}"

API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"

request() {
  local label="$1"
  local url="$2"
  local -a curl_args=(
    --fail
    --silent
    --show-error
    --location
    --max-time "$CURL_TIMEOUT_SECONDS"
  )

  if [[ -n "$SMOKE_TOKEN" ]]; then
    curl_args+=(--header "Authorization: Bearer $SMOKE_TOKEN")
  fi

  echo "Checking ${label}: ${url}"
  curl "${curl_args[@]}" "$url" >/dev/null
  echo "${label}: PASS"
}

request "API health" "${API_URL}${HEALTH_PATH}"
request "Web" "${WEB_URL}"
request "Web to API proxy" "${WEB_URL}${HEALTH_PATH}"

echo "All staging smoke checks passed."

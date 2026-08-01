#!/usr/bin/env bash
# Verifies deployed API, Web, HTTPS policies, and the cookie auth lifecycle.
#
# Required:
#   API_URL=https://api.example.com
#   WEB_URL=https://app.example.com
#   STAGING_SMOKE_ORGANIZATION=<organization slug or UUID>
#   STAGING_SMOKE_EMAIL=<dedicated smoke user email>
#   STAGING_SMOKE_PASSWORD=<dedicated smoke user password>
#
# Optional:
#   HEALTH_PATH=/api/v1/health
#   CURL_TIMEOUT_SECONDS=15

set -euo pipefail

API_URL="${API_URL:?API_URL is required}"
WEB_URL="${WEB_URL:?WEB_URL is required}"
HEALTH_PATH="${HEALTH_PATH:-/api/v1/health}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"
STAGING_SMOKE_ORGANIZATION="${STAGING_SMOKE_ORGANIZATION:?STAGING_SMOKE_ORGANIZATION is required}"
STAGING_SMOKE_EMAIL="${STAGING_SMOKE_EMAIL:?STAGING_SMOKE_EMAIL is required}"
STAGING_SMOKE_PASSWORD="${STAGING_SMOKE_PASSWORD:?STAGING_SMOKE_PASSWORD is required}"

API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"
COOKIE_JAR="$(mktemp)"
RESPONSE_BODY="$(mktemp)"
LOGIN_BODY="$(mktemp)"

cleanup() {
  rm -f "$COOKIE_JAR" "$RESPONSE_BODY" "$LOGIN_BODY"
}
trap cleanup EXIT HUP INT TERM

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

  echo "Checking ${label}: ${url}"
  curl "${curl_args[@]}" "$url" >/dev/null
  echo "${label}: PASS"
}

auth_request() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  shift 4
  local status

  echo "Checking ${label}: ${method} ${path}"
  status="$(curl \
    --silent \
    --show-error \
    --max-time "$CURL_TIMEOUT_SECONDS" \
    --request "$method" \
    --cookie "$COOKIE_JAR" \
    --cookie-jar "$COOKIE_JAR" \
    --output "$RESPONSE_BODY" \
    --write-out '%{http_code}' \
    "$@" \
    "${API_URL}${path}")"

  if [[ "$status" != "$expected_status" ]]; then
    echo "${label}: expected HTTP ${expected_status}, got ${status}" >&2
    return 1
  fi

  echo "${label}: PASS"
}

csrf_token() {
  awk '$0 !~ /^#/ && $6 == "lms_csrf_token" { value = $7 } END { print value }' "$COOKIE_JAR"
}

check_authenticated_session() {
  local csrf
  node -e 'process.stdout.write(JSON.stringify({organizationId: process.env.STAGING_SMOKE_ORGANIZATION, email: process.env.STAGING_SMOKE_EMAIL, password: process.env.STAGING_SMOKE_PASSWORD}))' >"$LOGIN_BODY"

  auth_request "Login" POST "/api/v1/auth/login" 201 \
    --header "Content-Type: application/json" \
    --data-binary "@${LOGIN_BODY}"
  auth_request "Current user" GET "/api/v1/auth/me" 200
  auth_request "Refresh session" POST "/api/v1/auth/refresh" 201 \
    --header "Content-Type: application/json" \
    --data '{}'

  csrf="$(csrf_token)"
  if [[ -z "$csrf" ]]; then
    echo "Refresh session did not issue the CSRF cookie" >&2
    return 1
  fi

  # Logout is the safe smoke mutation: it exercises CSRF without changing business data.
  auth_request "CSRF rejection" POST "/api/v1/auth/logout" 403 \
    --header "Content-Type: application/json" \
    --data '{}'
  auth_request "Logout" POST "/api/v1/auth/logout" 201 \
    --header "Content-Type: application/json" \
    --header "x-csrf-token: ${csrf}" \
    --data '{}'
  auth_request "Logged-out session" GET "/api/v1/auth/me" 401
}

require_https_url() {
  local label="$1"
  local url="$2"

  if [[ "$url" != https://* ]]; then
    echo "${label} must use https:// for the security-header smoke check: ${url}" >&2
    return 1
  fi
}

response_headers() {
  local url="$1"
  local output_file="$2"
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time "$CURL_TIMEOUT_SECONDS" \
    --dump-header "$output_file" \
    --output /dev/null \
    "$url"
}

header_value() {
  local headers_file="$1"
  local header_name="$2"

  awk -v expected_name="$header_name" '
    BEGIN { IGNORECASE = 1 }
    $0 ~ "^" expected_name ":[[:space:]]*" {
      sub("^[^:]+:[[:space:]]*", "")
      sub("\\r$", "")
      print
      exit
    }
  ' "$headers_file"
}

assert_header_contains() {
  local headers_file="$1"
  local header_name="$2"
  local expected="$3"
  local value
  value="$(header_value "$headers_file" "$header_name")"

  if [[ "$value" != *"$expected"* ]]; then
    echo "Expected ${header_name} to contain '${expected}', got '${value:-<missing>}'" >&2
    return 1
  fi
}

check_security_headers() {
  local label="$1"
  local url="$2"
  local headers_file
  headers_file="$(mktemp)"

  response_headers "$url" "$headers_file"
  assert_header_contains "$headers_file" "Strict-Transport-Security" "max-age="
  assert_header_contains "$headers_file" "Content-Security-Policy" "script-src"
  assert_header_contains "$headers_file" "Content-Security-Policy" "connect-src"
  assert_header_contains "$headers_file" "Content-Security-Policy" "img-src"
  assert_header_contains "$headers_file" "Content-Security-Policy" "font-src"
  assert_header_contains "$headers_file" "Content-Security-Policy" "object-src 'none'"
  assert_header_contains "$headers_file" "Content-Security-Policy" "base-uri"
  assert_header_contains "$headers_file" "Content-Security-Policy" "frame-ancestors 'none'"

  if [[ "$(header_value "$headers_file" "Content-Security-Policy")" == *"'unsafe-eval'"* ]]; then
    echo "Content-Security-Policy must not allow 'unsafe-eval'" >&2
    rm -f "$headers_file"
    return 1
  fi

  assert_header_contains "$headers_file" "X-Frame-Options" "DENY"
  rm -f "$headers_file"
  echo "${label} security headers: PASS"
}

check_http_redirect() {
  local label="$1"
  local https_url="$2"
  local http_url="http://${https_url#https://}"
  local result status redirect_url

  result="$(curl \
    --silent \
    --show-error \
    --max-time "$CURL_TIMEOUT_SECONDS" \
    --output /dev/null \
    --write-out '%{http_code} %{redirect_url}' \
    "$http_url")"
  status="${result%% *}"
  redirect_url="${result#* }"

  if [[ ! "$status" =~ ^30[1278]$ ]] || [[ "$redirect_url" != https://* ]]; then
    echo "${label} HTTP endpoint must redirect to HTTPS; got status ${status}, location '${redirect_url:-<missing>}'" >&2
    return 1
  fi

  echo "${label} HTTP to HTTPS redirect: PASS"
}

require_https_url "API_URL" "$API_URL"
require_https_url "WEB_URL" "$WEB_URL"

request "API health" "${API_URL}${HEALTH_PATH}"
request "Web" "${WEB_URL}"
request "Web to API proxy" "${WEB_URL}${HEALTH_PATH}"

check_security_headers "API" "${API_URL}${HEALTH_PATH}"
check_security_headers "Web" "${WEB_URL}"
check_security_headers "Web to API proxy" "${WEB_URL}${HEALTH_PATH}"
check_http_redirect "API" "${API_URL}${HEALTH_PATH}"
check_http_redirect "Web" "${WEB_URL}"
check_authenticated_session

echo "All staging smoke checks passed."

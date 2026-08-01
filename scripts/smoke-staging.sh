#!/usr/bin/env bash
# Verifies deployed API, Web, HTTPS policies, and role-scoped access.
#
# Required:
#   API_URL=https://api.example.com
#   WEB_URL=https://app.example.com
#   STAGING_SMOKE_ORGANIZATION=<organization slug or UUID>
#   STAGING_SMOKE_{ADMIN,MANAGER,INSTRUCTOR,LEARNER}_{EMAIL,PASSWORD}=...
#   STAGING_SMOKE_OUT_OF_TEAM_USER_ID=<same-tenant user outside the manager's teams>
#   STAGING_SMOKE_UNASSIGNED_COURSE_ID=<same-tenant course not assigned to the instructor>
#   STAGING_SMOKE_FOREIGN_USER_ID=<user in another organization>
#
# Optional:
#   HEALTH_PATH=/api/v1/health/ready
#   CURL_TIMEOUT_SECONDS=15

set -euo pipefail

API_URL="${API_URL:?API_URL is required}"
WEB_URL="${WEB_URL:?WEB_URL is required}"
HEALTH_PATH="${HEALTH_PATH:-/api/v1/health/ready}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"
STAGING_SMOKE_ORGANIZATION="${STAGING_SMOKE_ORGANIZATION:?STAGING_SMOKE_ORGANIZATION is required}"
for role in ADMIN MANAGER INSTRUCTOR LEARNER; do
  email_variable="STAGING_SMOKE_${role}_EMAIL"
  password_variable="STAGING_SMOKE_${role}_PASSWORD"
  : "${!email_variable:?${email_variable} is required}"
  : "${!password_variable:?${password_variable} is required}"
done
STAGING_SMOKE_OUT_OF_TEAM_USER_ID="${STAGING_SMOKE_OUT_OF_TEAM_USER_ID:?STAGING_SMOKE_OUT_OF_TEAM_USER_ID is required}"
STAGING_SMOKE_UNASSIGNED_COURSE_ID="${STAGING_SMOKE_UNASSIGNED_COURSE_ID:?STAGING_SMOKE_UNASSIGNED_COURSE_ID is required}"
STAGING_SMOKE_FOREIGN_USER_ID="${STAGING_SMOKE_FOREIGN_USER_ID:?STAGING_SMOKE_FOREIGN_USER_ID is required}"

API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"
TEMP_DIR="$(mktemp -d)"
COOKIE_JAR=
RESPONSE_BODY="${TEMP_DIR}/response.json"
LOGIN_BODY="${TEMP_DIR}/login.json"

cleanup() {
  rm -rf "$TEMP_DIR"
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

assert_current_role() {
  local expected_role="$1"
  EXPECTED_ROLE="$expected_role" RESPONSE_BODY="$RESPONSE_BODY" node <<'NODE'
const fs = require('node:fs');
const user = JSON.parse(fs.readFileSync(process.env.RESPONSE_BODY, 'utf8'));
if (!Array.isArray(user.roles) || !user.roles.includes(process.env.EXPECTED_ROLE)) {
  process.stderr.write(`Current user does not have expected role ${process.env.EXPECTED_ROLE}\n`);
  process.exit(1);
}
NODE
}

check_role() {
  local role="$1"
  local workspace_path="$2"
  local email_variable="STAGING_SMOKE_${role^^}_EMAIL"
  local password_variable="STAGING_SMOKE_${role^^}_PASSWORD"
  local csrf

  COOKIE_JAR="${TEMP_DIR}/${role}.cookies"
  : >"$COOKIE_JAR"
  STAGING_SMOKE_ROLE_EMAIL="${!email_variable}" \
    STAGING_SMOKE_ROLE_PASSWORD="${!password_variable}" \
    node -e 'process.stdout.write(JSON.stringify({organizationId: process.env.STAGING_SMOKE_ORGANIZATION, email: process.env.STAGING_SMOKE_ROLE_EMAIL, password: process.env.STAGING_SMOKE_ROLE_PASSWORD}))' >"$LOGIN_BODY"

  auth_request "${role} login" POST "/api/v1/auth/login" 201 \
    --header "Content-Type: application/json" \
    --data-binary "@${LOGIN_BODY}"
  auth_request "${role} current user" GET "/api/v1/auth/me" 200
  assert_current_role "$role"
  request "${role} workspace" "${WEB_URL}${workspace_path}"

  case "$role" in
    admin)
      auth_request "admin users read" GET "/api/v1/users?pageSize=1" 200
      auth_request "admin cross-organization isolation" GET "/api/v1/users/${STAGING_SMOKE_FOREIGN_USER_ID}" 404
      ;;
    manager)
      auth_request "manager team read" GET "/api/v1/users?pageSize=1" 200
      auth_request "manager out-of-team isolation" GET "/api/v1/users/${STAGING_SMOKE_OUT_OF_TEAM_USER_ID}" 404
      auth_request "manager forbidden course creation" POST "/api/v1/courses" 403 \
        --header "Content-Type: application/json" --data '{}'
      ;;
    instructor)
      auth_request "instructor course read" GET "/api/v1/courses?pageSize=1" 200
      auth_request "instructor unassigned-course isolation" GET "/api/v1/courses/${STAGING_SMOKE_UNASSIGNED_COURSE_ID}" 404
      auth_request "instructor forbidden users API" GET "/api/v1/users?pageSize=1" 403
      ;;
    learner)
      auth_request "learner course read" GET "/api/v1/courses?pageSize=1" 200
      auth_request "learner forbidden users API" GET "/api/v1/users?pageSize=1" 403
      ;;
  esac

  csrf="$(csrf_token)"
  if [[ -z "$csrf" ]]; then
    echo "${role} login did not issue the CSRF cookie" >&2
    return 1
  fi

  auth_request "${role} logout" POST "/api/v1/auth/logout" 201 \
    --header "Content-Type: application/json" \
    --header "x-csrf-token: ${csrf}" \
    --data '{}'
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
check_role admin "/admin"
check_role manager "/manager/dashboard"
check_role instructor "/instructor/dashboard"
check_role learner "/learn"

echo "All staging smoke checks passed."

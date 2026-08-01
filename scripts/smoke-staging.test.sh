#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin"

cat >"$TEST_DIR/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail

method=GET
output_file=/dev/null
headers_file=
cookie_jar=
write_out=
url=
csrf_header=

while (($#)); do
  case "$1" in
    --request) method="$2"; shift 2 ;;
    --output) output_file="$2"; shift 2 ;;
    --dump-header) headers_file="$2"; shift 2 ;;
    --cookie-jar) cookie_jar="$2"; printf '%s' "$cookie_jar" >"$MOCK_COOKIE_PATH"; shift 2 ;;
    --write-out) write_out="$2"; shift 2 ;;
    --header)
      [[ "$2" == x-csrf-token:* ]] && csrf_header="$2"
      shift 2
      ;;
    --max-time|--cookie|--data|--data-binary) shift 2 ;;
    --fail|--silent|--show-error|--location) shift ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done

if [[ -n "$headers_file" ]]; then
  cat >"$headers_file" <<'HEADERS'
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: script-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Frame-Options: DENY
HEADERS
fi

if [[ "$url" == http://* ]]; then
  printf '301 %s' "https://${url#http://}"
  exit 0
fi

status=200
case "${method} ${url}" in
  *POST*/api/v1/auth/login)
    status=201
    cat >"$cookie_jar" <<'COOKIES'
staging.example	FALSE	/	TRUE	0	lms_access_token	access-secret
staging.example	FALSE	/	TRUE	0	lms_csrf_token	login-csrf-secret
staging.example	FALSE	/api/v1/auth/refresh	TRUE	0	lms_refresh_token	refresh-secret
COOKIES
    ;;
  *GET*/api/v1/auth/me)
    status="${MOCK_ME_STATUS:-200}"
    [[ -s "$cookie_jar" ]] || status=401
    ;;
  *POST*/api/v1/auth/refresh)
    status=201
    sed -i 's/login-csrf-secret/rotated-csrf-secret/' "$cookie_jar"
    ;;
  *POST*/api/v1/auth/logout)
    if [[ "$csrf_header" == "x-csrf-token: rotated-csrf-secret" ]]; then
      status=201
      : >"$cookie_jar"
    else
      status=403
    fi
    ;;
esac

: >"$output_file"
if [[ "$write_out" == *http_code* ]]; then
  printf '%s' "$status"
fi
MOCK_CURL
chmod +x "$TEST_DIR/bin/curl"

run_smoke() {
  PATH="$TEST_DIR/bin:$PATH" \
  MOCK_COOKIE_PATH="$TEST_DIR/cookie-path" \
  API_URL=https://api.staging.example \
  WEB_URL=https://staging.example \
  STAGING_SMOKE_ORGANIZATION=smoke-tenant \
  STAGING_SMOKE_EMAIL=smoke@example.com \
  STAGING_SMOKE_PASSWORD='do-not-print-password' \
  bash "$ROOT_DIR/scripts/smoke-staging.sh"
}

success_output="$(run_smoke 2>&1)"
[[ "$success_output" == *"All staging smoke checks passed."* ]]
[[ "$success_output" != *"do-not-print-password"* ]]
[[ "$success_output" != *"access-secret"* ]]
[[ "$success_output" != *"refresh-secret"* ]]
[[ "$success_output" != *"rotated-csrf-secret"* ]]
cookie_path="$(cat "$TEST_DIR/cookie-path")"
[[ ! -e "$cookie_path" ]]

if MOCK_ME_STATUS=500 run_smoke >"$TEST_DIR/failure.log" 2>&1; then
  echo "Expected an authenticated request failure to return non-zero" >&2
  exit 1
fi
[[ "$(cat "$TEST_DIR/failure.log")" == *"expected HTTP 200, got 500"* ]]
cookie_path="$(cat "$TEST_DIR/cookie-path")"
[[ ! -e "$cookie_path" ]]

if API_URL=https://api.staging.example WEB_URL=https://staging.example \
  bash "$ROOT_DIR/scripts/smoke-staging.sh" >"$TEST_DIR/missing-secrets.log" 2>&1; then
  echo "Expected missing credentials to return non-zero" >&2
  exit 1
fi

echo "smoke-staging tests: PASS"

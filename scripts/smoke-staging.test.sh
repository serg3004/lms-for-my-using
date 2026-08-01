#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
mkdir -p "$TEST_DIR/bin"

cat >"$TEST_DIR/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail
method=GET output_file=/dev/null headers_file= cookie_jar= write_out= url= csrf_header= data_file=
while (($#)); do
  case "$1" in
    --request) method="$2"; shift 2 ;;
    --output) output_file="$2"; shift 2 ;;
    --dump-header) headers_file="$2"; shift 2 ;;
    --cookie-jar) cookie_jar="$2"; printf '%s\n' "$cookie_jar" >>"$MOCK_COOKIE_PATHS"; shift 2 ;;
    --write-out) write_out="$2"; shift 2 ;;
    --header) [[ "$2" == x-csrf-token:* ]] && csrf_header="$2"; shift 2 ;;
    --data-binary) data_file="${2#@}"; shift 2 ;;
    --max-time|--cookie|--data) shift 2 ;;
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
if [[ "$url" == http://* ]]; then printf '301 %s' "https://${url#http://}"; exit 0; fi
status=200
role="${cookie_jar##*/}"; role="${role%.cookies}"
case "${method} ${url}" in
  *POST*/api/v1/auth/login)
    status=201
    email="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).email" "$data_file")"
    role="${email%%@*}"
    [[ "$role" == "${MOCK_WRONG_ROLE_FOR:-}" ]] && role=learner
    cat >"$cookie_jar" <<COOKIES
staging.example	FALSE	/	TRUE	0	lms_access_token	${role}-access-secret
staging.example	FALSE	/	TRUE	0	lms_csrf_token	${role}-csrf-secret
COOKIES
    ;;
  *GET*/api/v1/auth/me)
    [[ -s "$cookie_jar" ]] || status=401
    response_role="$role"
    [[ "$role" == "${MOCK_WRONG_ROLE_FOR:-}" ]] && response_role=learner
    printf '{"roles":["%s"]}' "$response_role" >"$output_file"
    ;;
  *GET*/api/v1/users/out-of-team-user|*GET*/api/v1/users/foreign-user|*GET*/api/v1/courses/unassigned-course)
    status=404
    [[ "${MOCK_ALLOW_SCOPE:-}" == "$role" ]] && status=200
    ;;
  *POST*/api/v1/courses)
    status=403
    [[ "${MOCK_ALLOW_FORBIDDEN:-}" == manager ]] && status=201
    ;;
  *GET*/api/v1/users*)
    if [[ "$role" == instructor || "$role" == learner ]]; then
      status=403
      [[ "${MOCK_ALLOW_FORBIDDEN:-}" == "$role" ]] && status=200
    fi
    ;;
  *POST*/api/v1/auth/logout)
    if [[ "$csrf_header" == "x-csrf-token: ${role}-csrf-secret" ]]; then status=201; : >"$cookie_jar"; else status=403; fi
    ;;
esac
[[ -e "$output_file" ]] || : >"$output_file"
if [[ "$write_out" == *http_code* ]]; then
  printf '%s' "$status"
fi
MOCK_CURL
chmod +x "$TEST_DIR/bin/curl"

run_smoke() {
  : >"$TEST_DIR/cookie-paths"
  PATH="$TEST_DIR/bin:$PATH" MOCK_COOKIE_PATHS="$TEST_DIR/cookie-paths" \
  API_URL=https://api.staging.example WEB_URL=https://staging.example \
  STAGING_SMOKE_ORGANIZATION=smoke-tenant \
  STAGING_SMOKE_ADMIN_EMAIL=admin@example.com STAGING_SMOKE_ADMIN_PASSWORD=admin-password-secret \
  STAGING_SMOKE_MANAGER_EMAIL=manager@example.com STAGING_SMOKE_MANAGER_PASSWORD=manager-password-secret \
  STAGING_SMOKE_INSTRUCTOR_EMAIL=instructor@example.com STAGING_SMOKE_INSTRUCTOR_PASSWORD=instructor-password-secret \
  STAGING_SMOKE_LEARNER_EMAIL=learner@example.com STAGING_SMOKE_LEARNER_PASSWORD=learner-password-secret \
  STAGING_SMOKE_OUT_OF_TEAM_USER_ID=out-of-team-user \
  STAGING_SMOKE_UNASSIGNED_COURSE_ID=unassigned-course \
  STAGING_SMOKE_FOREIGN_USER_ID=foreign-user \
  bash "$ROOT_DIR/scripts/smoke-staging.sh"
}

success_output="$(run_smoke 2>&1)"
[[ "$success_output" == *"All staging smoke checks passed."* ]]
for role in admin manager instructor learner; do
  [[ "$success_output" == *"${role} workspace: PASS"* ]]
  [[ "$success_output" != *"${role}-password-secret"* ]]
  [[ "$success_output" != *"${role}-access-secret"* ]]
  [[ "$success_output" != *"${role}-csrf-secret"* ]]
done
while read -r cookie_path; do [[ ! -e "$cookie_path" ]]; done < <(sort -u "$TEST_DIR/cookie-paths")

if MOCK_WRONG_ROLE_FOR=manager run_smoke >"$TEST_DIR/wrong-role.log" 2>&1; then
  echo "Expected a role mismatch to return non-zero" >&2; exit 1
fi
[[ "$(cat "$TEST_DIR/wrong-role.log")" == *"expected role manager"* ]]

if MOCK_ALLOW_FORBIDDEN=learner run_smoke >"$TEST_DIR/forbidden.log" 2>&1; then
  echo "Expected an unexpectedly allowed forbidden request to return non-zero" >&2; exit 1
fi
[[ "$(cat "$TEST_DIR/forbidden.log")" == *"expected HTTP 403, got 200"* ]]

if MOCK_ALLOW_SCOPE=instructor run_smoke >"$TEST_DIR/scope.log" 2>&1; then
  echo "Expected an unexpectedly allowed cross-scope request to return non-zero" >&2; exit 1
fi
[[ "$(cat "$TEST_DIR/scope.log")" == *"expected HTTP 404, got 200"* ]]

if API_URL=https://api.staging.example WEB_URL=https://staging.example bash "$ROOT_DIR/scripts/smoke-staging.sh" >"$TEST_DIR/missing-secrets.log" 2>&1; then
  echo "Expected missing credentials to return non-zero" >&2; exit 1
fi

echo "smoke-staging tests: PASS"

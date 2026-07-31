#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

cat > "$TEMP_DIR/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count_file="${FAKE_DOCKER_COUNT_FILE:?}"
count="$(cat "$count_file" 2>/dev/null || echo 0)"
count=$((count + 1))
echo "$count" > "$count_file"
[[ "$count" -ge "${FAKE_DOCKER_SUCCEEDS_ON:?}" ]]
EOF
chmod +x "$TEMP_DIR/docker"

COUNT_FILE="$TEMP_DIR/count"
PATH="$TEMP_DIR:$PATH" \
  FAKE_DOCKER_COUNT_FILE="$COUNT_FILE" \
  FAKE_DOCKER_SUCCEEDS_ON=2 \
  DOCKER_BUILD_MAX_ATTEMPTS=3 \
  DOCKER_BUILD_RETRY_DELAY_SECONDS=0 \
  "$ROOT_DIR/scripts/docker-build-retry.sh" -f apps/api/Dockerfile -t lms-api:ci .

[[ "$(cat "$COUNT_FILE")" -eq 2 ]]
echo "docker-build-retry test passed"

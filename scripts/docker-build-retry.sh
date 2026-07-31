#!/usr/bin/env bash
set -euo pipefail

MAX_ATTEMPTS="${DOCKER_BUILD_MAX_ATTEMPTS:-3}"
RETRY_DELAY_SECONDS="${DOCKER_BUILD_RETRY_DELAY_SECONDS:-10}"

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ && "$RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "Docker build retry settings must be non-negative integers (attempts must be at least 1)." >&2
  exit 2
fi

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <docker build arguments...>" >&2
  exit 2
fi

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  echo "Docker build attempt ${attempt}/${MAX_ATTEMPTS}"

  if docker build "$@"; then
    exit 0
  fi

  if ((attempt < MAX_ATTEMPTS)); then
    delay=$((RETRY_DELAY_SECONDS * attempt))
    echo "Docker build failed; retrying in ${delay}s." >&2
    sleep "$delay"
  fi
done

echo "Docker build failed after ${MAX_ATTEMPTS} attempts." >&2
exit 1

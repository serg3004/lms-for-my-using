#!/usr/bin/env bash
# Installs the Playwright Chromium system packages with network time limits and retries.
# The apt step of `playwright install(-deps)` sometimes stalls for many minutes on the CI runner;
# a bounded attempt that is retried is faster than waiting for the stall to end.
# Usage: scripts/install-playwright-deps.sh [deps|full]
#   deps  (default) system packages only, used when the browser itself comes from the cache
#   full  browser download plus system packages
set -euo pipefail

mode="${1:-deps}"
attempts="${PLAYWRIGHT_DEPS_ATTEMPTS:-3}"
limit_seconds="${PLAYWRIGHT_DEPS_TIMEOUT_SECONDS:-240}"

if [ "$mode" = "full" ]; then
  command=(pnpm exec playwright install --with-deps chromium)
else
  command=(pnpm exec playwright install-deps chromium)
fi

if [ -d /etc/apt/apt.conf.d ] && command -v sudo >/dev/null 2>&1; then
  printf '%s\n' 'Acquire::Retries "3";' 'Acquire::http::Timeout "20";' 'Acquire::https::Timeout "20";' \
    | sudo tee /etc/apt/apt.conf.d/99-ci-network >/dev/null
fi

for attempt in $(seq 1 "$attempts"); do
  if timeout "$limit_seconds" "${command[@]}"; then
    exit 0
  fi
  echo "::warning::Playwright dependency install attempt ${attempt}/${attempts} failed or timed out after ${limit_seconds}s"
done

echo "::error::Playwright dependency install failed after ${attempts} attempts"
exit 1

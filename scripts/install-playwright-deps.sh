#!/usr/bin/env bash
# Installs the Playwright Chromium system packages with network time limits and retries.
# The apt step of `playwright install(-deps)` sometimes stalls for many minutes on the CI runner;
# a bounded attempt that is retried is faster than waiting for the stall to end.
# Usage: scripts/install-playwright-deps.sh [deps|full]
#   deps  (default) system packages only, used when the browser itself comes from the cache
#   full  browser download plus system packages
set -euo pipefail

mode="${1:-deps}"
attempts="${PLAYWRIGHT_DEPS_ATTEMPTS:-5}"
limit_seconds="${PLAYWRIGHT_DEPS_TIMEOUT_SECONDS:-40}"

if [ "$mode" = "full" ]; then
  command=(pnpm exec playwright install --with-deps chromium)
else
  command=(pnpm exec playwright install-deps chromium)
fi

if [ -d /etc/apt/apt.conf.d ] && command -v sudo >/dev/null 2>&1; then
  printf '%s\n' 'Acquire::Retries "3";' 'Acquire::http::Timeout "20";' 'Acquire::https::Timeout "20";' 'DPkg::Lock::Timeout "60";' \
    | sudo tee /etc/apt/apt.conf.d/99-ci-network >/dev/null
fi

# `timeout` stops only playwright/sudo; the root apt-get it started keeps running and holds the
# dpkg lock, so the next attempt would fail at once ("Could not get lock"). Stop leftovers first.
cleanup_apt() {
  command -v sudo >/dev/null 2>&1 || return 0
  sudo pkill -TERM -x apt-get || true
  sudo pkill -TERM -x apt || true
  sudo pkill -TERM -x dpkg || true
  sleep 3
  sudo pkill -KILL -x apt-get || true
  sudo pkill -KILL -x dpkg || true
  sleep 1
  sudo dpkg --configure -a || true
}

# The default Azure mirror sometimes trickles a few KB/s (apt timeouts do not fire while data
# still arrives). After a failed attempt switch to the Canonical archive host.
switch_mirror() {
  command -v sudo >/dev/null 2>&1 || return 0
  local f
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do
    [ -f "$f" ] || continue
    sudo sed -i -E \
      -e 's#mirror\+file:/etc/apt/apt-mirrors\.txt#http://archive.ubuntu.com/ubuntu/#g' \
      -e 's#https?://azure\.archive\.ubuntu\.com/ubuntu/?#http://archive.ubuntu.com/ubuntu/#g' "$f" || true
  done
}

for attempt in $(seq 1 "$attempts"); do
  if timeout "$limit_seconds" "${command[@]}"; then
    exit 0
  fi
  echo "::warning::Playwright dependency install attempt ${attempt}/${attempts} failed or timed out after ${limit_seconds}s"
  cleanup_apt
  switch_mirror
done

echo "::error::Playwright dependency install failed after ${attempts} attempts"
exit 1

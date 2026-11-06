#!/usr/bin/env bash
# Reads changed file paths (one per line) from stdin and prints "true" only when
# EVERY path is on the closed allowlist of descriptive Markdown files.
# Anything else, including an empty list, unknown paths or non-Markdown files
# under docs/, prints "false" so that the full CI runs (fail-safe).
set -euo pipefail

allow='^(docs/.+\.md|README\.md|AGENTS\.md|CLAUDE\.md|apps/e2e/README\.md|apps/e2e/visual-tests/README\.md|infra/railway/README\.md|scripts/SMOKE\.md|services/malware-scanner/README\.md|\.github/[^/]+\.md)$'

count=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  count=$((count + 1))
  # Reject path traversal and anything outside the allowlist.
  if [[ "$path" == *..* ]] || ! [[ "$path" =~ $allow ]]; then
    echo false
    exit 0
  fi
done

if [[ "$count" -eq 0 ]]; then
  echo false
else
  echo true
fi

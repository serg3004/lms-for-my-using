#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

check() {
  local expected="$1" input="$2" actual
  actual="$(printf '%b' "$input" | ./ci-docs-only.sh)"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: expected $expected, got $actual for: $input" >&2
    exit 1
  fi
}

check true  'docs/product/plan.md\n'
check true  'docs/a/b/c.md\nREADME.md\nAGENTS.md\n.github/pull_request_template.md\n'
check true  'scripts/SMOKE.md\ninfra/railway/README.md\n'
check false ''
check false '\n'
check false 'docs/x.html\n'
check false 'docs/x.json\n'
check false 'docs/a.md\napps/api/src/a.ts\n'
check false 'docs/../apps/api/src/a.ts\n'
check false 'docs/../x.md\n'
check false '.github/workflows/ci.yml\n'
check false 'package.json\n'
check false 'apps/web/README.md\n'
check false 'notes.md\n'
echo "ci-docs-only tests passed"

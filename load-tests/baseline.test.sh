#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/baseline.js"

for required in smoke load stress p\(50\) p\(95\) p\(99\) LOAD_TEST_ALLOW_HOST LOAD_TEST_PRODUCTION_CONFIRM LOAD_TEST_ENABLE_WRITES LOAD_TEST_ENABLE_UPLOADS; do
  grep -Fq "$required" "$script" || { echo "missing baseline control: $required" >&2; exit 1; }
done

node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(process.argv[1])); if (!Array.isArray(d.users) || !d.users.length) process.exit(1)' "$script_dir/dataset.example.json"
echo 'load-test baseline static checks passed'

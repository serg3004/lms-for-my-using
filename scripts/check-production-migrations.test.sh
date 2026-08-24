#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
subject="$repo_root/scripts/check-production-migrations.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat >"$tmpdir/pnpm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CALLS_FILE"
if [[ "$*" == *"migrate status"* ]]; then
  exit "${STATUS_EXIT:-0}"
fi
exit "${DIFF_EXIT:-0}"
EOF
chmod +x "$tmpdir/pnpm"

run_check() {
  : >"$tmpdir/calls"
  PATH="$tmpdir:$PATH" CALLS_FILE="$tmpdir/calls" \
    DATABASE_URL="${DATABASE_URL-postgresql://readonly:secret@db.example/lms}" \
    STATUS_EXIT="${STATUS_EXIT:-0}" DIFF_EXIT="${DIFF_EXIT:-0}" \
    bash "$subject" >"$tmpdir/stdout" 2>"$tmpdir/stderr"
}

run_check
grep -q 'migrate status --schema prisma/schema.prisma' "$tmpdir/calls"
grep -q 'migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code' "$tmpdir/calls"
! grep -q 'secret' "$tmpdir/calls" "$tmpdir/stdout" "$tmpdir/stderr"

if DIFF_EXIT=2 run_check; then
  echo 'expected schema drift to fail' >&2
  exit 1
fi
grep -q 'schema drift detected' "$tmpdir/stderr"

if STATUS_EXIT=1 run_check; then
  echo 'expected migration history failure to fail' >&2
  exit 1
fi
[[ "$(wc -l <"$tmpdir/calls")" -eq 1 ]]

if DATABASE_URL=sqlite:///tmp/db run_check; then
  echo 'expected a non-PostgreSQL URL to fail' >&2
  exit 1
fi
[[ ! -s "$tmpdir/calls" ]]

echo 'production migration check tests passed'

#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required." >&2
  exit 64
fi

case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *)
    echo "ERROR: DATABASE_URL must use the PostgreSQL protocol." >&2
    exit 64
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "Checking production migration history (read-only)..."
pnpm --filter @lms/api exec prisma migrate status --schema prisma/schema.prisma

echo "Checking the live schema against the committed Prisma schema (read-only)..."
set +e
pnpm --filter @lms/api exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
diff_status=$?
set -e

case "$diff_status" in
  0)
    echo "Migration history and live schema match the repository."
    ;;
  2)
    echo "ERROR: production schema drift detected; deployment is blocked." >&2
    exit 2
    ;;
  *)
    echo "ERROR: Prisma could not compare the production schema; deployment is blocked." >&2
    exit "$diff_status"
    ;;
esac

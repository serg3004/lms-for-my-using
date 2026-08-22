#!/usr/bin/env bash
set -euo pipefail

umask 077

required=(DATABASE_URL BACKUP_PASSPHRASE_FILE BACKUP_OUTPUT)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 2
  fi
done

for command in pg_dump gpg tar sha256sum; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 2; }
done

if [[ ! -r "$BACKUP_PASSPHRASE_FILE" ]]; then
  echo "error: BACKUP_PASSPHRASE_FILE must be readable" >&2
  exit 2
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
mkdir -p "$workdir/payload/objects" "$(dirname "$BACKUP_OUTPUT")"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" \
  --file="$workdir/payload/database.dump"

storage_mode=none
if [[ -n "${BACKUP_OBJECTS_DIR:-}" ]]; then
  storage_mode=filesystem
  cp -a "$BACKUP_OBJECTS_DIR"/. "$workdir/payload/objects/"
elif [[ -n "${BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null || { echo "error: aws is required for BACKUP_S3_URI" >&2; exit 2; }
  storage_mode=s3
  aws s3 sync --only-show-errors "$BACKUP_S3_URI" "$workdir/payload/objects"
fi

find "$workdir/payload/objects" -type f -printf '%P\n' | LC_ALL=C sort > "$workdir/payload/object-inventory.txt"
cat > "$workdir/payload/metadata.env" <<EOF
BACKUP_FORMAT_VERSION=1
CREATED_AT=$started_at
STORAGE_MODE=$storage_mode
EOF

(cd "$workdir/payload" && find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$workdir/payload" -cf "$workdir/backup.tar" .
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --symmetric --cipher-algo AES256 --output "$BACKUP_OUTPUT" "$workdir/backup.tar"

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{"event":"backup_complete","startedAt":"%s","completedAt":"%s","storageMode":"%s","artifact":"%s"}\n' \
  "$started_at" "$completed_at" "$storage_mode" "$BACKUP_OUTPUT"

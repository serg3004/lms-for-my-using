#!/usr/bin/env bash
set -euo pipefail

umask 077

required=(RESTORE_DATABASE_URL BACKUP_PASSPHRASE_FILE BACKUP_INPUT CONFIRM_DISASTER_RECOVERY)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then echo "error: $name is required" >&2; exit 2; fi
done
if [[ "$CONFIRM_DISASTER_RECOVERY" != "RESTORE" ]]; then
  echo "error: set CONFIRM_DISASTER_RECOVERY=RESTORE to acknowledge destructive restore" >&2
  exit 2
fi
for command in pg_restore psql gpg tar sha256sum; do
  command -v "$command" >/dev/null || { echo "error: $command is required" >&2; exit 2; }
done

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
started_epoch="$(date +%s)"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$BACKUP_PASSPHRASE_FILE" \
  --decrypt --output "$workdir/backup.tar" "$BACKUP_INPUT"
mkdir "$workdir/payload"
tar -xf "$workdir/backup.tar" -C "$workdir/payload"
(cd "$workdir/payload" && sha256sum --check --strict SHA256SUMS)

pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" "$workdir/payload/database.dump"

if [[ -n "${RESTORE_OBJECTS_DIR:-}" ]]; then
  mkdir -p "$RESTORE_OBJECTS_DIR"
  cp -a "$workdir/payload/objects"/. "$RESTORE_OBJECTS_DIR/"
elif [[ -n "${RESTORE_S3_URI:-}" ]]; then
  command -v aws >/dev/null || { echo "error: aws is required for RESTORE_S3_URI" >&2; exit 2; }
  aws s3 sync --only-show-errors --delete "$workdir/payload/objects" "$RESTORE_S3_URI"
fi

# Every active DB reference must occur in the backup inventory. This catches a
# point-in-time mismatch between PostgreSQL and object storage snapshots.
psql "$RESTORE_DATABASE_URL" -At -c \
  'SELECT key FROM (SELECT object_key AS key FROM course_materials WHERE deleted_at IS NULL UNION SELECT quarantine_key AS key FROM course_materials WHERE deleted_at IS NULL) refs WHERE key IS NOT NULL ORDER BY key' \
  > "$workdir/db-object-keys.txt"
missing=0
while IFS= read -r key; do
  [[ -z "$key" ]] && continue
  if ! grep -Fqx -- "$key" "$workdir/payload/object-inventory.txt"; then
    echo "error: database references missing backup object: $key" >&2
    missing=$((missing + 1))
  fi
done < "$workdir/db-object-keys.txt"
[[ "$missing" -eq 0 ]] || exit 1

if [[ -n "${RESTORE_HEALTHCHECK_COMMAND:-}" ]]; then
  bash -o pipefail -c "$RESTORE_HEALTHCHECK_COMMAND"
fi

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
duration_seconds=$(( $(date +%s) - started_epoch ))
printf '{"event":"restore_complete","startedAt":"%s","completedAt":"%s","durationSeconds":%d,"verifiedObjectReferences":%d}\n' \
  "$started_at" "$completed_at" "$duration_seconds" "$(wc -l < "$workdir/db-object-keys.txt")"

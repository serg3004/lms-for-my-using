#!/usr/bin/env bash
set -euo pipefail

for name in SOURCE_DATABASE_URL RESTORE_DATABASE_URL SOURCE_OBJECTS_DIR RESTORE_OBJECTS_DIR BACKUP_PASSPHRASE_FILE; do
  if [[ -z "${!name:-}" ]]; then echo "error: $name is required" >&2; exit 2; fi
done

artifact="$(mktemp --suffix=.tar.gpg)"
trap 'rm -f "$artifact"' EXIT
drill_started="$(date +%s)"

DATABASE_URL="$SOURCE_DATABASE_URL" \
BACKUP_OBJECTS_DIR="$SOURCE_OBJECTS_DIR" \
BACKUP_PASSPHRASE_FILE="$BACKUP_PASSPHRASE_FILE" \
BACKUP_OUTPUT="$artifact" \
  "$(dirname "$0")/create-backup.sh"

RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
RESTORE_OBJECTS_DIR="$RESTORE_OBJECTS_DIR" \
BACKUP_PASSPHRASE_FILE="$BACKUP_PASSPHRASE_FILE" \
BACKUP_INPUT="$artifact" \
CONFIRM_DISASTER_RECOVERY=RESTORE \
RESTORE_HEALTHCHECK_COMMAND="${RESTORE_HEALTHCHECK_COMMAND:-}" \
  "$(dirname "$0")/restore-backup.sh"

drill_seconds=$(( $(date +%s) - drill_started ))
printf '{"event":"restore_drill_complete","measuredRtoSeconds":%d,"snapshotRpoSeconds":0}\n' "$drill_seconds"

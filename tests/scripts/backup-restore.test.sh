#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/source-objects/nested" "$tmp/restored-objects"
printf secret > "$tmp/passphrase"
printf 'course material\n' > "$tmp/source-objects/nested/lesson.txt"

cat > "$tmp/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
for arg in "$@"; do [[ "$arg" == --file=* ]] && output="${arg#--file=}"; done
printf 'logical database backup\n' > "$output"
EOF
cat > "$tmp/bin/pg_restore" <<'EOF'
#!/usr/bin/env bash
cp "${*: -1}" "$FAKE_RESTORED_DATABASE"
EOF
cat > "$tmp/bin/psql" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${FAKE_OBJECT_KEY:-nested/lesson.txt}"
EOF
cat > "$tmp/bin/gpg" <<'EOF'
#!/usr/bin/env bash
while (($#)); do
  case "$1" in --output) output="$2"; shift 2;; --decrypt) decrypt=1; shift;; --symmetric) symmetric=1; shift;; *) input="$1"; shift;; esac
done
cp "$input" "$output"
EOF
chmod +x "$tmp/bin"/*
export PATH="$tmp/bin:$PATH" FAKE_RESTORED_DATABASE="$tmp/restored.dump"

DATABASE_URL=postgres://source BACKUP_OBJECTS_DIR="$tmp/source-objects" \
  BACKUP_PASSPHRASE_FILE="$tmp/passphrase" BACKUP_OUTPUT="$tmp/backup.gpg" \
  "$root/scripts/backup/create-backup.sh"

RESTORE_DATABASE_URL=postgres://restore RESTORE_OBJECTS_DIR="$tmp/restored-objects" \
  BACKUP_PASSPHRASE_FILE="$tmp/passphrase" BACKUP_INPUT="$tmp/backup.gpg" \
  CONFIRM_DISASTER_RECOVERY=RESTORE RESTORE_HEALTHCHECK_COMMAND="test -s '$tmp/restored.dump'" \
  "$root/scripts/backup/restore-backup.sh"

cmp "$tmp/source-objects/nested/lesson.txt" "$tmp/restored-objects/nested/lesson.txt"
test -s "$tmp/restored.dump"

if RESTORE_DATABASE_URL=postgres://restore BACKUP_PASSPHRASE_FILE="$tmp/passphrase" \
  BACKUP_INPUT="$tmp/backup.gpg" CONFIRM_DISASTER_RECOVERY=NO \
  "$root/scripts/backup/restore-backup.sh" >/dev/null 2>&1; then
  echo 'restore accepted without destructive-operation acknowledgement' >&2
  exit 1
fi

export FAKE_OBJECT_KEY=missing-object.txt
if RESTORE_DATABASE_URL=postgres://restore RESTORE_OBJECTS_DIR="$tmp/restored-objects" \
  BACKUP_PASSPHRASE_FILE="$tmp/passphrase" BACKUP_INPUT="$tmp/backup.gpg" \
  CONFIRM_DISASTER_RECOVERY=RESTORE "$root/scripts/backup/restore-backup.sh" >/dev/null 2>&1; then
  echo 'restore accepted an inconsistent database/object snapshot' >&2
  exit 1
fi

echo 'backup/restore tests passed'

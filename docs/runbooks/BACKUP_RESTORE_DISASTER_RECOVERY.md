# Backup, restore, and disaster recovery runbook

## Service objectives and ownership

| Scope | RPO | RTO | Owner | Escalation |
| --- | ---: | ---: | --- | --- |
| PostgreSQL and course-material objects | 24 hours | 4 hours | platform on-call | incident commander, then product owner |

The database and object snapshot are one recovery unit. A database-only success
is not a successful backup. Take an additional backup before a risky migration.
Production provider configuration and every drill result remain **LIVE-VERIFY**:
repository files alone must never be presented as evidence that backups ran.

## Backup policy

1. Schedule `scripts/backup/create-backup.sh` at least daily from a restricted
   worker with read access to PostgreSQL and the material bucket.
2. Quiesce material writes for the snapshot, or use provider snapshots with the
   same documented cutoff. This prevents the DB from referring to an object
   created after the object snapshot.
3. Store the resulting GPG artifact in a separate account/region with object
   versioning or immutability. Retain 7 daily, 5 weekly, and 12 monthly copies.
4. Keep the passphrase in a secrets manager, separately from backup artifacts.
   Rotate it annually and after suspected disclosure. Never put it in an
   environment variable, command line, log, or repository.
5. Alert on a missed daily backup and on an artifact older than 26 hours.

Example (the passphrase file should be a short-lived secret-manager mount):

```bash
DATABASE_URL="$DATABASE_URL" \
BACKUP_S3_URI='s3://lms-materials/' \
BACKUP_PASSPHRASE_FILE=/run/secrets/lms-backup-passphrase \
BACKUP_OUTPUT=/secure-transfer/lms-$(date -u +%Y%m%dT%H%M%SZ).tar.gpg \
scripts/backup/create-backup.sh
```

The script creates a PostgreSQL custom-format dump, copies objects, records a
sorted object inventory and SHA-256 manifest, then encrypts the complete archive
with GPG AES-256. Never upload the unencrypted working data.

## Quarterly restore drill

Use isolated, empty non-production targets. The target credentials must not be
able to access production. Restore is destructive and requires the literal
`CONFIRM_DISASTER_RECOVERY=RESTORE` acknowledgement.

```bash
SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" \
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
SOURCE_OBJECTS_DIR=/mnt/source-bucket \
RESTORE_OBJECTS_DIR=/mnt/isolated-restore-bucket \
BACKUP_PASSPHRASE_FILE=/run/secrets/lms-backup-passphrase \
RESTORE_HEALTHCHECK_COMMAND='DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @lms/api smoke-test' \
scripts/backup/restore-drill.sh | tee restore-drill.jsonl
```

For S3-compatible targets, run `create-backup.sh` with `BACKUP_S3_URI` and
`restore-backup.sh` with `RESTORE_S3_URI`. Configure the AWS CLI endpoint and
credentials using the provider-supported secret mechanism.

The restore verifies archive checksums, makes `pg_restore` stop on the first
error, checks every active `object_key`/`quarantine_key` against the snapshot,
and runs the supplied application health check. The final JSON event measures
RTO. `snapshotRpoSeconds=0` describes the controlled drill snapshot only; in an
incident, calculate RPO as `incident data cutoff - backup CREATED_AT`.

Record this evidence in the incident/drill ticket:

- artifact ID and `CREATED_AT` (never the passphrase);
- source and isolated target identifiers;
- restore start/end timestamps and measured RTO;
- calculated incident RPO or controlled-drill RPO;
- checksum, DB restore, object-reference, application-start, and key-record
  verification results;
- operator, reviewer, failures, follow-up owner, and due date.

## Disaster procedure

1. Declare an incident, appoint an incident commander, freeze writes, and record
   the suspected failure/data-loss cutoff in UTC.
2. Preserve logs and compromised resources. Rotate DB/S3 credentials if
   compromise is possible; do not destroy forensic evidence.
3. List eligible artifacts, verify offsite accessibility, and select the newest
   artifact strictly before the corruption cutoff.
4. Restore into isolated infrastructure. Do not overwrite the failed production
   database or bucket during diagnosis.
5. Run checksum and DB/object-reference verification, start the API against the
   isolated targets, and verify login, learner reads, assessment submission, and
   representative course-material downloads.
6. Have the incident commander approve cutover. Keep writes disabled during the
   final endpoint/DNS switch, then revoke old credentials and sessions as needed.
7. Monitor errors and missing objects. If validation fails, stop cutover and try
   the preceding known-good artifact. Do not merge two snapshots ad hoc.
8. Publish measured RPO/RTO and a blameless postmortem. Track every failed
   objective or manual gap to closure.

## Required tools and safety notes

The scripts require Bash, PostgreSQL client tools, GPG, GNU tar/coreutils, and
AWS CLI only for S3 mode. Use matching or newer PostgreSQL client versions.
Restore targets should have network egress restricted. Test passphrase recovery
by two authorized operators; loss of the passphrase makes the backup unusable.

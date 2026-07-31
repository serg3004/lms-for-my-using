# Tenant-aware object storage

## Runtime contract

Material files are private objects. A file material is created first with
`POST /api/v1/courses/:courseId/materials`; its `fileUrl` may be omitted. The
binary is then sent as multipart field `file` to:

```text
POST /api/v1/materials/:id/file
```

The API derives both tenant and material identity from the authorized material
record and stores the object under:

```text
organizations/{organizationId}/materials/{materialId}/{uuid}
```

Only this opaque `objectKey` is persisted. Original names are metadata and are
never part of an object key. `S3_PUBLIC_URL` is no longer used.

Authorized readers obtain a short-lived (at most five-minute) URL from
`GET /api/v1/materials/:id/download`. The endpoint checks the caller's role,
course access, and organization before signing the stored key. Consequently a
key or material UUID from another organization cannot be used to mint a URL.
Archived or deleted materials fail closed and cannot receive a URL. Configure
`S3_FILE_ORIGIN` as a dedicated file-serving origin, separate from the web
application origin. Signed responses always force `Content-Type:
application/octet-stream` and `Content-Disposition: attachment`, including for
HTML and SVG, so uploaded active content is not rendered in the application
security context. `S3_PRESIGNED_TTL_SECONDS` defaults to 300 and is hard-capped
at 300 seconds.

`DELETE /api/v1/materials/:id/file` deletes the private object and clears its
storage metadata. S3 DeleteObject is idempotent; repeating the API call when no
key remains safely clears metadata again. Each request writes a durable audit
row with the tenant, material, actor, affected keys, result, and timestamp.

## Retention and orphan cleanup

Build the API, then run `pnpm --filter @lms/api storage:cleanup` to inventory
unreferenced ordinary and quarantine objects older than
`S3_ORPHAN_RETENTION_DAYS` (default 30). Dry-run is the default and prints the
exact candidates without deleting anything. After reviewing the output, pass
`-- --apply` to delete those candidates. Database references are loaded without
excluding soft-deleted materials, preventing cleanup from bypassing retention
for an object that is still referenced. S3 deletion is idempotent, so an
interrupted applied run can be safely repeated.

## Legacy transition

The migration adds nullable `object_key` and makes `file_url` nullable without
rewriting existing rows. Existing `kind=link` rows remain readable after normal
authorization and return their external URL from the download endpoint. Legacy
file rows containing only an S3/public URL are deliberately **not** exposed by
the endpoint: an operator must copy each object to its generated tenant prefix,
set `object_key`, verify access, and then clear `file_url`. This fail-closed plan
avoids attempting to parse or trust arbitrary historical URLs.

Before deployment, back up the database and bucket, inventory legacy file rows,
run the copy/backfill in batches, verify object counts and tenant prefixes, and
retain the source objects until rollback retention expires. Rollback restores
the database and leaves copied objects for later orphan cleanup.

## Configuration and validation

Storage requires `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and
`S3_SECRET_ACCESS_KEY`; `S3_REGION` and `S3_FORCE_PATH_STYLE` are optional.
Uploads retain the 50 MB limit, MIME/magic-byte validation, filename safety,
and ZIP-bomb checks.

Every new binary is written below the tenant-scoped `quarantine/` prefix and
persisted with scan status `pending`. The API submits the opaque quarantine key
to `MALWARE_SCANNER_URL`, then accepts an authenticated, idempotent verdict at
`POST /api/v1/internal/material-scans/:id/result`. The scanner authenticates
with `Authorization: Bearer $MALWARE_SCANNER_CALLBACK_SECRET` and sends one of
`clean`, `infected`, `error`, or `timeout`.

Only a timely `clean` verdict copies the object into the normal private material
prefix, removes the quarantine object, and changes the status to `available`.
All other verdicts fail closed as `rejected` and remove the quarantine object.
Downloads require both an ordinary object key and `available`; therefore
pending, scanning, rejected, failed, and timed-out files cannot receive a URL.
Scan dispatch uses a five-second request deadline and verdicts expire after 15
minutes. Scanner callbacks can safely be retried after a terminal state.

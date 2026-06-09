# Storage Upload Status

## Purpose

This document records the current storage and upload status for the MVP baseline.

It is documentation only. It does not introduce endpoints, storage providers, secrets, environment variables, Prisma changes, or runtime behavior.

## Current status

Storage upload is **implemented for MVP material uploads**.

Current implementation:

- `POST /api/v1/upload` accepts a multipart `file` field.
- The endpoint is protected by `AuthGuard` and `RolesGuard`.
- Upload access follows `rolePolicies.courseMaterialsCreate`.
- The upload endpoint uses Multer `memoryStorage`.
- Files are validated before storage.
- Files are uploaded to S3-compatible object storage when S3 env variables are configured.
- If `S3_PUBLIC_URL` is configured, the returned `fileUrl` uses that public base URL.
- If `S3_PUBLIC_URL` is not configured, the returned `fileUrl` is a presigned GET URL.
- If S3 is not configured, the upload service returns `503 Service Unavailable`.
- The upload endpoint does **not** create a course material record by itself.
- Course material creation remains a separate API flow that stores metadata/link fields.

## Current API contract

```text
POST /api/v1/upload
```

Request:

- authenticated request;
- multipart form-data;
- field name: `file`.

Successful response:

```json
{
  "fileUrl": "https://...",
  "fileName": "example.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 12345
}
```

The returned object can be used by clients when creating course material metadata through:

```text
POST /api/v1/courses/:courseId/materials
```

## Storage configuration

The upload service is enabled only when all required S3-compatible variables are available:

```text
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
```

Optional variables:

```text
S3_REGION
S3_FORCE_PATH_STYLE
S3_PUBLIC_URL
```

Rules:

- do not commit real S3 credentials;
- do not document real bucket secrets;
- use environment variables in deployment settings;
- use safe local/demo values only in examples.

## Validation and limits

Current upload validation includes:

- maximum file size: `50 MB`;
- maximum file name length: `255` bytes;
- empty files are rejected;
- unsupported MIME types are rejected;
- declared MIME type must match file magic bytes where supported;
- path traversal in file names is rejected;
- null/control characters in file names are rejected;
- zip-based Office files are checked for:
  - maximum entry count;
  - maximum compression ratio;
  - maximum uncompressed size.

Allowed MIME types:

- `application/pdf`;
- `image/jpeg`;
- `image/png`;
- `image/gif`;
- `image/webp`;
- `video/mp4`;
- `video/webm`;
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Security constraints

Current security constraints:

- no real storage credentials in repository files;
- no local disk persistence for uploaded files in production;
- no unauthenticated uploads;
- no learner upload permission by default;
- no direct trust in user supplied filenames;
- no arbitrary server file path exposure;
- no raw file bytes accepted outside the reviewed upload endpoint.

Still not implemented:

- antivirus/malware scanning;
- content moderation;
- file replacement/archive/delete workflow;
- retention and cleanup workflow;
- orphaned object cleanup;
- upload/download audit events;
- per-tenant object key policy documentation beyond current folder prefix behavior;
- private download proxy endpoint.

## MVP implication

Upload is available for controlled MVP material uploads when object storage is configured.

For environments without S3-compatible storage, material references can still use external HTTPS links through the course material metadata flow.

## Operational checks

Before using uploads in staging or production:

- [ ] S3-compatible env variables are configured in deployment settings.
- [ ] No real storage secrets are committed to the repository.
- [ ] Upload endpoint returns `503` when storage is intentionally not configured.
- [ ] Valid files under `50 MB` upload successfully.
- [ ] Invalid MIME types are rejected.
- [ ] Oversized files are rejected.
- [ ] Path traversal filenames are rejected.
- [ ] Returned `fileUrl` works according to the selected `S3_PUBLIC_URL` / presigned URL mode.

## Future implementation checklist

Before treating upload as production-ready, create separate implementation plans for:

1. Upload audit logging.
2. Malware scanning or an explicit compensating control.
3. Retention and cleanup policy.
4. Object key tenant isolation policy.
5. Private downloads and authorization checks.
6. Replace/archive/delete material file workflows.
7. Backup and restore expectations for object storage.
8. Incident response for unsafe uploaded content.

## Related docs

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/API_STATUS.md`
- `docs/API_CONTRACTS.md`
- `docs/RAILWAY_DEPLOY_GUIDE.md`
- `docs/MVP_LOCAL_RUNBOOK.md`

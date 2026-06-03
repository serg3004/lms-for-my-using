# Storage Upload Status

## Purpose

This document records the current storage and upload status for the MVP baseline.

It is a status document only. It does not introduce upload endpoints, storage providers, secrets, environment variables, Prisma changes, or runtime behavior.

## Current status

Storage upload is **not implemented** in the current MVP baseline.

Current course material support is metadata/link based:

- Course materials are managed through `GET /api/v1/courses/:courseId/materials`.
- A single material can be read through `GET /api/v1/materials/:id`.
- Materials can be created through `POST /api/v1/courses/:courseId/materials`.
- Material `kind` supports `file` and `link`.
- Material records can include `fileName`, `fileUrl`, `mimeType`, and `sizeBytes`.
- `fileUrl` is accepted as a URL string supplied by the caller.
- There is no multipart upload endpoint.
- There is no server-side object storage adapter.
- There is no signed URL / presigned upload flow.
- There is no local disk upload storage policy.
- There is no antivirus, file scanning, retention, or cleanup workflow.

## Current API contract

The current API can reference already-hosted files or links through course material metadata.

The current API does **not** accept raw file bytes. Clients must not assume that the LMS API stores uploaded file contents.

```text
GET  /api/v1/courses/:courseId/materials
POST /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id
```

For `POST /api/v1/courses/:courseId/materials`, the caller must provide metadata that satisfies the course material schema, including a valid `fileUrl`.

## MVP implication

Storage upload is **not required** for the current controlled technical pilot.

For the pilot, acceptable material references are:

- HTTPS links to externally hosted documents.
- Test/demo URLs that do not contain secrets or personal data.
- Metadata-only file placeholders where content delivery is explicitly out of scope.

## Security constraints

Until a storage implementation is designed and reviewed:

- Do not accept multipart uploads.
- Do not commit storage credentials.
- Do not add real bucket names, access keys, tokens, or provider secrets.
- Do not store user-supplied files on local disk in production.
- Do not expose arbitrary file paths.
- Do not proxy private file downloads through unaudited endpoints.
- Do not treat `fileUrl` as proof that the target file is safe.

## Future implementation checklist

Before enabling uploads, create a separate implementation plan covering:

1. Storage provider decision: local development adapter, production object storage, or both.
2. Upload API contract: multipart upload vs. signed URL flow.
3. File constraints: maximum size, allowed MIME types, allowed extensions.
4. Authorization: who can upload, view, replace, archive, or delete materials.
5. Tenant isolation: object key strategy and access boundaries.
6. Validation: content type checks, size checks, and filename normalization.
7. Security scanning: malware scanning and unsafe content handling.
8. Lifecycle: retention, cleanup, archival, and orphaned object handling.
9. Audit logging: upload, replace, delete, and download events.
10. Local development: safe `.env.example` keys without real secrets.
11. Tests: happy path, forbidden access, invalid file, oversized file, tenant isolation, and cleanup behavior.
12. Documentation: operator setup, rollback, backup, and incident response.

## Related docs

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/API_STATUS.md`
- `docs/API_CONTRACTS.md`
- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`

# API Status

Last synced: 2026-05-27  
Source branch: `feature/users-import-skeleton`

## Current status

Users import skeleton is implemented in this branch:

- `POST /api/v1/users/import` accepts JSON-only import payloads.
- Supported modes:
  - `validateOnly` validates rows and returns a row-level report without writes.
  - `create` validates rows, skips invalid/existing/duplicate emails, and creates valid rows.
- Input is validated with Zod.
- Import batch size is limited to 100 rows.
- Emails are trimmed, normalized to lowercase, and checked for duplicates inside the payload.
- Existing organization users are checked before writes; duplicate database emails are skipped in the row report.
- Valid created rows use password hashing and Prisma transaction writes.
- The endpoint uses `AuthGuard`, `RolesGuard`, `OrganizationScopeGuard`, and the existing `usersCreate` role policy.
- Deferred by design: CSV upload, file storage, background jobs, import history tables/migrations, UI, and email invitations.

Users bulk create from PR #48 remains active:

- `POST /api/v1/users/bulk` creates up to 50 users for one organization.
- Duplicate payload/database emails reject the whole bulk create request.

Assessment results / reports from PR #47 remain active:

- `GET /api/v1/assessments/:assessmentId/results`
- `GET /api/v1/assessments/:assessmentId/report`
- `GET /api/v1/attempts/:id/result`

## Endpoint map

```text
GET  /api/v1/courses/:id/completion

GET  /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users
POST /api/v1/users/bulk
POST /api/v1/users/import

GET  /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result
POST /api/v1/assessments/:assessmentId/attempts
```

## Current limitations

- CSV upload is deferred.
- Import file storage is deferred.
- Import history table / Prisma migration is deferred.
- Background jobs / queue are deferred.
- Import UI is deferred.
- Email invitations are deferred.
- Certificates are not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.

# API Status

Last synced: 2026-05-27  
Source branch: `feature/organization-registration-first-admin`

## Current status

Organization registration / first admin flow is implemented in this branch:

- `POST /api/v1/organizations/register` creates an organization, first admin user, and admin membership.
- Input is validated with Zod.
- Admin email is normalized to lowercase.
- Duplicate active organization slugs are rejected.
- Duplicate active admin emails are rejected.
- First admin password is hashed before database writes.
- Organization, first admin user, and `admin` membership are created in one Prisma transaction.
- The response returns organization and first admin summaries without password hash.

Users import skeleton from PR #49 remains active:

- `POST /api/v1/users/import`
- `validateOnly` and `create` modes
- row-level validation report
- JSON-only payload
- CSV upload, file storage, queue, import history, UI, and email invitations remain deferred.

Users bulk create from PR #48 remains active:

- `POST /api/v1/users/bulk` creates up to 50 users for one organization.

Assessment results / reports from PR #47 remain active:

- `GET /api/v1/assessments/:assessmentId/results`
- `GET /api/v1/assessments/:assessmentId/report`
- `GET /api/v1/attempts/:id/result`

## Endpoint map

```text
GET  /api/v1/courses/:id/completion

GET  /api/v1/organizations
GET  /api/v1/organizations/:id
POST /api/v1/organizations
POST /api/v1/organizations/register

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

- Certificates are not implemented yet.
- OpenAPI, centralized API errors, and integration tests are not implemented yet.
- CSV upload, import file storage, import history tables/migrations, background jobs/queue, import UI, and email invitations are deferred.

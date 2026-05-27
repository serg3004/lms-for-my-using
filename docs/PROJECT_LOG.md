# Project Log

## 2026-05-27

### Organization registration / first admin flow

Implemented PR #50 scope on `feature/organization-registration-first-admin`.

Changes:
- Added `POST /api/v1/organizations/register`.
- Added Zod schema for public organization registration with nested `organization` and `admin` sections.
- Added duplicate active organization slug validation.
- Added duplicate active admin email validation.
- Added first admin password hashing.
- Added transactional creation of organization, first admin user, and `admin` membership.
- Added response summary without password hash.
- Added service tests for registration happy path and duplicate slug rejection.
- Updated README, API status, project log, and auto-change audit log.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
```

### Users import skeleton

Implemented PR #49 scope on `feature/users-import-skeleton`.

Changes:
- Added `POST /api/v1/users/import`.
- Added JSON-only import schema with `validateOnly`/`create` modes and 100-row batch limit.
- Added row-level validation report, duplicate payload email detection, and existing database email checks.
- Added create mode with password hashing and Prisma transaction writes for valid rows.
- Deferred CSV upload, file storage, queue, import history table/migration, UI, and email invitations.

### Users bulk create

Implemented PR #48 scope on `feature/users-bulk-create`.

Changes:
- Added `POST /api/v1/users/bulk`.
- Added Zod schema for bulk user create payload.
- Added batch limit of 50 users per request.
- Added duplicate email validation inside the request payload.
- Added database duplicate email check before writes.
- Added transactional Prisma writes for bulk user creation.

## 2026-05-26

### Assessment results / reports

Implemented PR #47 scope on `feature/assessment-results-reports`.

### Course completion gate

Implemented PR #46 scope on `feature/course-completion-gate`.

### Assessment attempts Prisma sync

Resolved the technical debt introduced in PR #44 by syncing assessment attempt tables into Prisma schema and replacing raw SQL with Prisma Client calls.

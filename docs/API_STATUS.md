# API Status

Last synced: 2026-06-03  
Source branch: `main`

## Current status

The API baseline is ready for controlled MVP pilot validation, subject to the limitations documented in `docs/MVP_READINESS_DASHBOARD.md`.

Implemented backend/API baseline:

- Health endpoint.
- Auth login, logout, current user, and password reset skeleton endpoints.
- Organization registration and protected organization management endpoints.
- Users, groups, and memberships endpoints.
- Courses, lessons, materials, assignments, progress, assessments, assessment questions/options, attempts/results/report, and certificates endpoints.
- Centralized API error response envelope.
- Manual OpenAPI document synced with current controllers.
- Runtime API environment validation.
- Explicit local `.env` / `.env.local` loading for non-production, non-CI runs.
- Safe startup failure logging with sensitive startup details redacted.
- Backend MVP flow smoke coverage.
- CI quality gates for lint, typecheck, tests, build, and Prisma generate.

## Current limitations

- Password reset delivery remains skeleton behavior and needs explicit status documentation in PR 68.
- Production-grade storage upload status needs explicit documentation in PR 67.
- Full learner/admin RBAC audit is planned for PR 71.
- Production deployment automation is not implemented.
- Local demo seed data needs follow-up verification/expansion in PR 70.

## Backend API route map

```text
GET  /api/v1/health
GET  /api/v1/openapi.json

POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/confirm
GET  /api/v1/auth/me

GET  /api/v1/organizations
POST /api/v1/organizations
POST /api/v1/organizations/register
GET  /api/v1/organizations/:id

GET  /api/v1/users
POST /api/v1/users
GET  /api/v1/users/:id
POST /api/v1/users/bulk
POST /api/v1/users/import

GET  /api/v1/groups
POST /api/v1/groups
GET  /api/v1/groups/:id

GET  /api/v1/memberships
POST /api/v1/memberships
GET  /api/v1/memberships/:id

GET  /api/v1/courses
POST /api/v1/courses
GET  /api/v1/courses/:id
GET  /api/v1/courses/:id/completion

GET  /api/v1/courses/:courseId/lessons
POST /api/v1/courses/:courseId/lessons
GET  /api/v1/lessons/:id

GET  /api/v1/courses/:courseId/materials
POST /api/v1/courses/:courseId/materials
GET  /api/v1/materials/:id

GET  /api/v1/progress
POST /api/v1/progress
GET  /api/v1/progress/:id

GET  /api/v1/assignments
POST /api/v1/assignments
GET  /api/v1/assignments/:id

GET  /api/v1/assessments
POST /api/v1/assessments
GET  /api/v1/assessments/:id

GET  /api/v1/assessments/:assessmentId/questions
POST /api/v1/assessments/:assessmentId/questions
GET  /api/v1/questions/:id
GET  /api/v1/questions/:questionId/options
POST /api/v1/questions/:questionId/options

GET  /api/v1/assessments/:assessmentId/attempts
POST /api/v1/assessments/:assessmentId/attempts
GET  /api/v1/assessments/:assessmentId/results
GET  /api/v1/assessments/:assessmentId/report
GET  /api/v1/attempts/:id
GET  /api/v1/attempts/:id/result

GET  /api/v1/certificates
POST /api/v1/certificates
GET  /api/v1/certificates/:id
```

## Related docs

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/API_CONTRACTS.md`
- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/RBAC_MATRIX.md`

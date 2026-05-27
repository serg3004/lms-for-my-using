# Pilot Checklist

## Purpose

This checklist defines the minimum operational steps before running a controlled LMS MVP pilot.

## 1. Scope confirmation

- Confirm pilot organization.
- Confirm pilot users and roles.
- Confirm pilot course.
- Confirm expected learner flow.
- Confirm what is explicitly out of scope for the pilot.

## 2. Environment setup

- Create local `.env` from `.env.example`.
- Set `API_PORT`.
- Set `JWT_SECRET` with at least 32 characters.
- Confirm database connection settings are documented in the local runbook.
- Confirm file storage settings are documented before enabling file workflows.

## 3. Database preparation

- Confirm Prisma schema is reviewed.
- Run `prisma generate` in the API app.
- Use safe migrate flow only.
- Do not apply real migrations without explicit operator approval.
- Confirm seed data is safe and contains no real secrets.

## 4. Seed data

Pilot seed should include:

- 1 organization.
- 1 admin.
- 1 instructor.
- 2 learners.
- 1 group.
- 1 course.
- 2 lessons.
- 1 assignment.
- 1 progress record.

## 5. API validation

Before pilot, verify:

- `GET /api/v1/health` returns OK.
- Auth login happy path works.
- Invalid auth login body returns `400 Bad Request`.
- Protected endpoint without token returns `401 Unauthorized`.
- Tenant-scope mismatch returns `403 Forbidden`.
- OpenAPI skeleton is available.
- Centralized API error format is used.

## 6. Web validation

Before pilot, verify:

- Login page is available.
- API client shell points to the expected API URL.
- Auth error is visible on invalid login.
- Learner course list is reachable.
- Course detail is reachable.
- Lesson view is reachable.
- Complete lesson action can be tested once implemented.

## 7. Security validation

- No real secrets in repository.
- No real passwords in seed data.
- No personal production data in pilot dataset.
- Test accounts use disposable credentials.
- Tenant isolation negative scenarios are tested.
- RBAC matrix is reviewed.

## 8. Documentation validation

Required documents:

- `docs/MVP_DEFINITION_OF_DONE.md`
- `docs/PILOT_CHECKLIST.md`
- `docs/API_STATUS.md`
- `docs/PROJECT_LOG.md`

Planned documents before pilot operations:

- `docs/MVP_LOCAL_RUNBOOK.md`
- `docs/RBAC_MATRIX.md`
- `docs/API_CONTRACTS.md`

## 9. CI validation

Before merge or pilot use, confirm:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

## 10. Pilot go / no-go

Go only if:

- MVP Definition of Done is satisfied or explicitly waived.
- Pilot dataset is ready.
- Smoke tests are green.
- Known risks are documented.
- Rollback path is clear.

No-go if:

- Auth is unstable.
- Tenant isolation is unverified.
- Required env setup is unclear.
- Seed data contains real secrets or sensitive personal data.
- CI is red.

# MVP Definition of Done

## Purpose

This document defines what must be true before the LMS MVP can be considered ready for a controlled pilot.

The MVP is not a full production release. It is a stable pilot baseline for validating core learning workflows with a small tenant and known users.

## MVP scope

The MVP is done when the project supports the following end-to-end workflows:

1. An organization can be represented in the system.
2. An admin or instructor can manage the minimum course structure.
3. Learners can access assigned learning content.
4. Lesson progress can be recorded.
5. Assessment and certificate skeletons are present enough to validate the intended flow.
6. Auth, RBAC, tenant isolation, and API error behavior are covered by smoke and negative tests.
7. Local run instructions are clear enough for a developer to start API and web without undocumented steps.

## Backend readiness

Required:

- Health endpoint works.
- Auth login flow exists with validation and protected endpoint behavior covered.
- Zod validation errors return `400 Bad Request` through the centralized API error format.
- API environment validation covers the runtime env values currently used by the API.
- JWT secret access is centralized through API env config.
- MVP API smoke tests cover health, auth login happy and negative paths, protected endpoint without token, env validation, and tenant-scope mismatch.
- Prisma schema and migrations are present for currently modeled MVP data.
- No real database migration is applied outside an explicit operator action.

Not required for MVP DoD:

- Full password reset delivery.
- Refresh token/logout flow.
- Production-grade file storage.
- Production deployment automation.
- Advanced reporting.

## Frontend readiness

Required:

- Web app has a login shell.
- Frontend API client shell exists.
- Learner can navigate assigned courses, course detail, lesson view, and complete lesson action once those screens are implemented.
- Basic auth and API error states are visible to the user.

Not required for MVP DoD:

- Final visual design system.
- Complex global state manager.
- Offline support.
- Advanced analytics UI.

## Data readiness

Required:

- A safe seed dataset exists or is documented before pilot use.
- Seed data must not contain real secrets or real personal data.
- Seed data should cover one organization, admin, instructor, two learners, one group, one course, two lessons, one assignment, and one progress record.

## Security readiness

Required:

- No secrets committed to the repository.
- `.env.example` documents required env names without real values.
- Auth-protected endpoints reject missing bearer tokens.
- Tenant-scope mismatch has negative coverage.
- RBAC expectations are documented before pilot expansion.
- API error responses do not expose sensitive internals.

## Documentation readiness

Required docs before pilot:

- MVP Definition of Done.
- Pilot Checklist.
- Local runbook.
- RBAC matrix.
- API contracts.
- Current API status.
- Project log.

## Test readiness

Required checks for MVP baseline PRs:

```text
[Check] Lint: OK
[Check] Types: OK
[Check] Tests: OK
[Check] Build: OK
```

A PR can be merged only after GitHub CI is green and the explicit merge approval command is provided.

## Pilot exit criteria

The pilot can be considered successful when:

- A pilot organization can complete the core learner flow.
- No tenant isolation defects are found during pilot validation.
- Critical auth and data integrity defects are resolved.
- The team has a confirmed backlog for post-MVP improvements.

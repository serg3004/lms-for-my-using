# Project Log

## 2026-05-27

### Certificates skeleton

Implemented PR #51 scope on `feature/certificates-skeleton`.

Changes:
- Added `CertificateStatus` enum and `Certificate` Prisma model.
- Added migration `20260527100000_add_certificates`.
- Added certificates module, controller, service, and schema.
- Added `GET /api/v1/certificates`.
- Added `GET /api/v1/certificates/:id`.
- Added `POST /api/v1/certificates`.
- Added certificate eligibility by completed course lessons or passed assessment attempt.
- Added duplicate-safe certificate issue behavior for organization/course/user.
- Added certificate RBAC policies.
- Registered certificates module in `AppModule`.
- Added service tests for happy path and negative eligibility case.
- Updated README, API status, project log, and audit log.

Deferred:
- PDF generation.
- Certificate templates.
- Public verification.
- Certificate numbering format.
- Revocation endpoint.
- UI.

Current PR check status:

```text
[Check] Lint: not run
[Check] Types: not run
[Check] Tests: not run
[Check] Build: not run
[Check] Prisma generate: not run
```

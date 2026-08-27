# lms-for-my-using

Learning management system.

## Project status

Current stage: MVP release candidate with a fail-closed, environment-specific release gate. A production `GO` requires fresh CI, CodeQL, smoke, dependency and rollback evidence; see `docs/runbooks/RELEASE_GATE.md`.

Current repository implementation includes:

- NestJS API and React/Vite Web application;
- organizations/users/memberships/groups and role-based authorization;
- courses, lessons, materials/uploads, assignments/submissions, progress, assessments/attempts/results, certificates and reporting surfaces;
- server-side auth sessions with refresh rotation/revocation, logout/logout-all and password-reset request/confirm;
- Notifications and Admin Audit Log backend/API/UI surfaces;
- private S3-compatible upload/download/quarantine/scanner integration;
- runtime OpenAPI and centralized API error handling;
- CI, security, accessibility and visual-regression workflows.

This list is orientation only. Current implementation facts must be verified through the canonical owner-sources described in `docs/README.md`.

## Auth/session status

Current auth/session implementation uses JWT access tokens together with server-side refresh/session state.

- Refresh tokens rotate and sessions can be revoked.
- `POST /api/v1/auth/logout` revokes the current session.
- `POST /api/v1/auth/logout-all` revokes all sessions for the user.
- Password-reset request/confirm is implemented with one-time token handling and provider-neutral delivery configuration.
- Actual delivery-provider availability is environment/live state and must be verified separately.

Historical descriptions of logout as purely stateless or password reset as an intentional `503` are not current behavior.

## API authority

The current HTTP API surface is defined by runtime OpenAPI plus controllers:

- runtime OpenAPI JSON: `/api/v1/api-json`;
- Swagger UI: `/api/v1/docs`;
- legacy `/api/v1/openapi` is deprecated.

Do not use a hand-maintained route list in this README as the API inventory. Human API semantics are documented in `docs/contracts/API_CONTRACTS.md`.

## Storage/upload status

Current storage/upload code supports S3-compatible buffered/multipart uploads, tenant-scoped authorization, private short-lived downloads, quarantine/scanner callbacks and cleanup tooling.

Production provider, bucket/CORS/lifecycle, scanner availability and cleanup scheduling are live concerns and require fresh evidence.

## Deployment and migrations

Repository deployment configuration is Railway-first with Docker portability. Current API deployment configuration runs `prisma migrate deploy` before starting the application.

Whether a specific migration has successfully executed in the current production environment is a dated/live verification fact; do not infer it from an old README statement or from repository configuration alone.

## Documentation

See [`docs/README.md`](./docs/README.md) for the canonical documentation map, ownership rules, lifecycle and task-specific entry points.

Key current documents:

- [`docs/product/MVP_SCOPE_LOCK.md`](./docs/product/MVP_SCOPE_LOCK.md) — MVP product boundaries;
- [`docs/contracts/API_CONTRACTS.md`](./docs/contracts/API_CONTRACTS.md) — human API semantics/invariants;
- [`docs/status/OPEN_DECISIONS.md`](./docs/status/OPEN_DECISIONS.md) — unresolved owner/business decisions only;
- [`docs/runbooks/RELEASE_GATE.md`](./docs/runbooks/RELEASE_GATE.md) — release gate.

Active implementation work belongs in GitHub Issues/Project, not in Markdown backlog files.

## Repository structure

```text
apps/api/       NestJS API
apps/web/       React/Vite Web application
packages/       shared workspace packages
docs/           project documentation
```

Prisma schema and migrations live under `apps/api/prisma/`. The schema/migration directory is the authoritative repository source; this README intentionally does not maintain a manual migration inventory.

## License

Proprietary — all rights reserved. This is **not** an open-source project; see [`LICENSE`](./LICENSE). Third-party dependency licenses are summarized in [`NOTICE`](./NOTICE).

## Project naming

The repository name `lms-for-my-using` is a working name and is not intended to ship as the public/production product name. Any repository rename is a separate explicit operation because it affects clones, CI and deployment references.

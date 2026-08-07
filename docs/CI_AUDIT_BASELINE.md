# CI and Audit Baseline

## Purpose

This document captures the current `main` CI baseline and security-audit gate status.

This is a status document only. It does not change runtime behavior, dependencies, environment variables, secrets, auth, Prisma schema, or migrations.

## Repository baseline

| Item | Baseline |
| --- | --- |
| Base branch | `main` |
| Baseline workflow | `.github/workflows/ci.yml` |
| CodeQL workflow | `.github/workflows/codeql.yml` |
| Staging smoke workflow | `.github/workflows/staging-smoke.yml` (manual `workflow_dispatch` only) |
| Dependabot config | `.github/dependabot.yml` (present; GitHub Actions weekly + npm workspace-grouped weekly) |
| Workflow names | `CI`, `CodeQL`, `Staging smoke` |
| Verified at | 2026-08-06, against `.github/workflows/ci.yml` directly |

## Current CI gates

The current CI workflow runs one `Checks` job on `ubuntu-latest` with a 15 minute timeout, in this order:

| Gate | Notes |
| --- | --- |
| Secret scan | Gitleaks |
| Set up pnpm / Node.js | pnpm 9.15.0, Node 22, pnpm cache |
| Install dependencies | `pnpm install --frozen-lockfile` |
| Dependency audit | `pnpm audit --audit-level high` |
| Validate security waivers | `scripts/validate-security-waivers.mjs` against `security-waivers.json` |
| Lint | `pnpm --recursive lint` |
| Generate Prisma Client | `pnpm --filter @lms/api prisma:generate` |
| Typecheck | `pnpm --recursive typecheck` |
| Tests | `pnpm --recursive test:coverage` |
| Staging smoke script tests | `bash scripts/smoke-staging.test.sh` (tests the smoke script itself, not a live staging call) |
| Apply database migrations | `pnpm --filter @lms/api prisma:migrate:deploy` against the CI Postgres service |
| API database integration tests | `pnpm --filter @lms/api test:integration:db` |
| Build | `pnpm --recursive build` |
| Install Playwright browser | Chromium with deps |
| Browser E2E | `pnpm test:e2e` |
| Accessibility baseline | `pnpm test:a11y` |
| Responsive visual matrix | `pnpm test:visual` |
| Upload Playwright failure artifacts | On failure only |
| Build API Docker image | `apps/api/Dockerfile` |
| Build Web Docker image | `apps/web/Dockerfile` |
| Scan API Docker image | Trivy, `HIGH`/`CRITICAL`, fails on unfixed findings not covered by a waiver |
| Scan Web Docker image | Trivy, `HIGH`/`CRITICAL`, fails on unfixed findings not covered by a waiver |
| CodeQL | Separate `CodeQL` workflow, `security-extended` query suite |

CI runs against an in-job Postgres 16 service container (`postgres:16-alpine`), not an external database.

## Current workflow characteristics

Current CI includes:

- `pull_request` checks.
- `push` checks for `main`.
- Concurrency cancellation by Git ref (`main` runs are not cancelled by newer pushes; other branches are).
- `contents: read`, `pull-requests: read` permissions.
- 15 minute job timeout.
- Prisma generate with auto-install disabled (`PRISMA_GENERATE_SKIP_AUTOINSTALL=true`).

Current CodeQL includes:

- `pull_request` checks.
- `push` checks for `main`.
- JavaScript/TypeScript analysis.
- `security-extended` query suite.
- read-only `actions` and `contents` permissions.
- `security-events: write` permission for code scanning upload.
- 15 minute job timeout.

## Security audit baseline

| Gate | Status |
| --- | --- |
| Dependency audit | In CI: `pnpm audit --audit-level high` |
| Secret scan | In CI: Gitleaks |
| CodeQL | In CI: separate workflow, `security-extended` |
| Container image scanning | In CI: Trivy against both built images, `HIGH`/`CRITICAL`, waiver-gated via `security-waivers.json` (see `docs/READINESS_AND_SECURITY_GATES.md`) |
| Dependabot | Present: `.github/dependabot.yml` — see `docs/DEPENDABOT_PNPM_WORKSPACE_POLICY.md` |
| Semgrep | Not present in CI |
| Branch protection verification | Not verified by this document — manual repository settings review |

## MVP readiness impact

This baseline confirms `main` has a comprehensive CI gate covering lint/typecheck/tests/build, DB migration + integration tests, browser E2E, accessibility, visual regression, container build, and container vulnerability scanning, plus supply-chain (audit, Dependabot), secret-leak (Gitleaks), and static-analysis (CodeQL) gates.

It does not run against live Railway infrastructure — CI's Postgres, migration, and smoke-script steps run against an ephemeral in-job database, not the production database. Live production/deploy verification is tracked separately in `docs/RAILWAY_PRODUCTION_SMOKE_STATUS.md`.

## Related docs

- `docs/READINESS_AND_SECURITY_GATES.md`
- `docs/DEPENDABOT_PNPM_WORKSPACE_POLICY.md`
- `docs/DEPENDENCY_UPDATE_POLICY.md`
- `docs/RAILWAY_PRODUCTION_SMOKE_STATUS.md`

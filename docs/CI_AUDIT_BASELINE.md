# PR 104 — Current Main CI and Audit Baseline

## Purpose

This document captures the current `main` CI baseline and security-audit gap baseline before adding new security gates in later PRs.

This is a status document only. It does not change CI workflows, runtime behavior, dependencies, environment variables, secrets, auth, Prisma schema, or migrations.

## Repository baseline

| Item | Baseline |
| --- | --- |
| Base branch | `main` |
| Baseline commit | `0d4cd5da1f9d8f8e1d7d2e7a8ae26902ffc936c9` |
| Baseline workflow | `.github/workflows/ci.yml` |
| Workflow name | `CI` |
| Latest verified `main` run | `26991697644` |
| Latest verified `main` result | `success` |
| Verified at | 2026-06-05 |

## Current CI gates on `main`

The current CI workflow runs one `Checks` job on `ubuntu-latest`.

| Gate | Current status in latest `main` run |
| --- | --- |
| Install dependencies | Passing |
| Lint | Passing |
| Generate Prisma Client | Passing |
| Typecheck | Passing |
| Tests | Passing |
| Build | Passing |

## Current workflow characteristics

Current CI includes:

- `pull_request` checks.
- `push` checks for `main`.
- pnpm install with frozen lockfile.
- pnpm cache through `actions/setup-node`.
- concurrency cancellation by Git ref.
- read-only `contents` permission.
- 15 minute job timeout.
- Prisma generate with auto-install disabled.

## Security audit baseline

The following security gates are not present in the current CI baseline and are intentionally left for follow-up PRs:

| Gate | Current baseline | Follow-up |
| --- | --- | --- |
| Dependency audit | Not present in CI | PR 105 |
| Secret scan | Not present in CI | PR 105 |
| CodeQL or Semgrep | Not present in CI | PR 106 |
| Dependabot or Renovate | Not present in repository config | Separate decision |
| Branch protection verification | Not verified by this PR | Manual repository settings review |
| Upload MIME/magic-byte hardening | Not changed by this PR | PR 107 |
| Upload memory/DoS hardening | Not changed by this PR | PR 107 |
| Upload negative tests | Not changed by this PR | PR 107 |

## MVP readiness impact

This baseline confirms that the current `main` branch has a green CI run for the existing quality gates.

It does not confirm:

- Railway staging deployment.
- Runtime smoke checks on staging.
- `/api/v1/health` on staging.
- Web `/` on staging.
- `prisma migrate deploy` on staging.
- Staging seed execution.
- Learner smoke flow.
- Admin smoke flow.
- Real S3 upload behavior.

Those items remain part of staging verification and smoke reporting.

## Recommended next PRs

1. PR 105 — add dependency audit and secret scan to CI.
2. PR 106 — add CodeQL or Semgrep security scan.
3. PR 107 — upload security hardening for MVP.

## Rollback

This PR is docs-only. Rollback is safe by reverting this document.

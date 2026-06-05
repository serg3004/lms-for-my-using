# CI and Audit Baseline

## Purpose

This document captures the current `main` CI baseline and security-audit gate status before staging verification work.

This is a status document only. It does not change runtime behavior, dependencies, environment variables, secrets, auth, Prisma schema, or migrations.

## Repository baseline

| Item | Baseline |
| --- | --- |
| Base branch | `main` |
| PR 104 baseline commit | `0d4cd5da1f9d8f8e1d7d2e7a8ae26902ffc936c9` |
| PR 105 base commit | `6a25e71d5e1c3faae11d0893783a47773d660b35` |
| Baseline workflow | `.github/workflows/ci.yml` |
| Workflow name | `CI` |
| Latest verified PR 104 `main` run | `26991697644` |
| Latest verified PR 104 `main` result | `success` |
| Verified at | 2026-06-05 |

## Current CI gates

The current CI workflow runs one `Checks` job on `ubuntu-latest`.

| Gate | Current status |
| --- | --- |
| Secret scan | Added in PR 105 via Gitleaks |
| Install dependencies | Passing in PR 104 baseline |
| Dependency audit | Added in PR 105 via `pnpm audit --audit-level high` |
| Lint | Passing in PR 104 baseline |
| Generate Prisma Client | Passing in PR 104 baseline |
| Typecheck | Passing in PR 104 baseline |
| Tests | Passing in PR 104 baseline |
| Build | Passing in PR 104 baseline |

## Current workflow characteristics

Current CI includes:

- `pull_request` checks.
- `push` checks for `main`.
- Gitleaks secret scanning.
- `pnpm audit --audit-level high`.
- pnpm install with frozen lockfile.
- pnpm cache through `actions/setup-node`.
- concurrency cancellation by Git ref.
- read-only `contents` permission.
- 15 minute job timeout.
- Prisma generate with auto-install disabled.

## Security audit baseline

| Gate | Current baseline | Follow-up |
| --- | --- | --- |
| Dependency audit | Added in PR 105 | Monitor CI signal after merge |
| Secret scan | Added in PR 105 | Monitor CI signal after merge |
| CodeQL or Semgrep | Not present in CI | PR 106 |
| Dependabot or Renovate | Not present in repository config | Separate decision |
| Branch protection verification | Not verified by this PR | Manual repository settings review |
| Upload MIME/magic-byte hardening | Not changed by this PR | PR 107 |
| Upload memory/DoS hardening | Not changed by this PR | PR 107 |
| Upload negative tests | Not changed by this PR | PR 107 |

## MVP readiness impact

This baseline confirms that the current `main` branch has a green CI run for the existing quality gates and now adds supply-chain and secret-leak gates for new PRs.

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

1. PR 106 — add CodeQL or Semgrep security scan.
2. PR 107 — upload security hardening for MVP.
3. PR 108 — auth/session production-readiness notes or minimal hardening.

## Rollback

This PR changes CI and this status document only. Rollback by reverting the PR 105 workflow and documentation changes.

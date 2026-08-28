# Dependency and Update Policy

Document status: active

Scope: dependency changes, lockfile changes, and update review process

This policy defines how dependencies should be added, updated, reviewed, verified, and rolled back in the LMS repository.

This document does not change dependencies, `package.json`, `pnpm-lock.yaml`, CI/CD, runtime code, Prisma schema, migrations, env values, or secrets.

## Current package manager

The repository uses:

- `pnpm@9.15.0` from the root `packageManager` field;
- Turbo root scripts for `build`, `lint`, `typecheck`, and `test`;
- package-level scripts in `apps/api/package.json` and `apps/web/package.json`.

Dependency changes must use pnpm and must keep `pnpm-lock.yaml` in sync with the changed manifests.

## Dependency ownership

| Area | Manifest | Notes |
|---|---|---|
| Root tooling | `package.json` | Workspace-level tooling such as Turbo, ESLint shared tooling, and TypeScript ESLint packages. |
| API | `apps/api/package.json` | NestJS, Prisma, Zod, API test tooling, and API runtime dependencies. |
| Web | `apps/web/package.json` | React, Vite, Vitest, routing, i18n, and frontend build tooling. |
| Lockfile | `pnpm-lock.yaml` | Must change only when dependency manifests change. |

Do not add a dependency to the root package unless it is truly workspace-level tooling.

## Allowed update types

| Type | Rule |
|---|---|
| Patch update | Allowed when scoped, reviewed, and verified. |
| Minor update | Allowed when changelog/release notes are reviewed for behavior changes. |
| Major update | Requires explicit planning and should not be mixed with feature work. |
| Security update | Prioritize if it fixes a relevant vulnerability, but still verify runtime behavior. |
| New dependency | Requires justification and should be avoided if the project can solve the task with existing dependencies. |
| Dependency removal | Requires checking imports, scripts, generated files, and CI usage. |

## Upgrade lanes

Every update must use exactly one of these lanes. A pull request must not mix
lanes, even when Dependabot proposes a wider set of changes.

### Routine patch/minor lane

- Patch updates may be grouped by workspace and dependency type.
- Minor updates may be grouped only when they share a compatibility surface;
  otherwise split them so that a regression can be reverted independently.
- Review release notes and the lockfile diff, then run the verification matrix.
- A routine update must not require data migration, public API changes, or a
  compatibility shim. If it does, move it to the major-migration lane.

### Major-migration lane

- One compatibility domain per pull request (for example Prisma CLI and Client
  are one domain, but Prisma and Zod are not).
- Start from an approved GitHub work item and record the current/target major,
  upstream migration guide, breaking surfaces, rollout and rollback strategy.
- Run the old-version baseline before changing the manifest. After the update,
  run all repository checks plus the domain-specific gates listed below.
- Do not combine a major migration with feature development, unrelated
  refactoring, another major domain, or opportunistic patch/minor updates.
- Merge domains sequentially. Rebase on the then-current `main` and regenerate
  the lockfile for every stage; do not carry a lockfile generated for a later
  stage into an earlier one.

Dependabot is an input to this process, not approval to merge. Its workspace
groups are limited to patch/minor updates. Major-version proposals must remain
outside those groups and may be implemented only through a planned stage.

## Staged major-upgrade sequence

The table below is **sequencing policy, not an active-work/status tracker**. Canonical writable ownership for implementation state is GitHub Issues/Project. The retired pre-DOC-08 ledger is preserved only as historical provenance in `docs/archive/development-ledger/DEVELOPMENT_PLAN.md` and MUST NOT be updated for new work.

Stages are intentionally ordered by compatibility risk, not by newest-version
availability. Before implementation, the GitHub work-item owner must confirm the actual
target version from upstream release notes; this policy does not pin speculative
future versions.

| Order | Compatibility domain | Required impact review and extra gates |
|---|---|---|
| 1 | Prisma CLI + `@prisma/client` | migration guide, schema and generated-client diff, `prisma generate`, migration status/check, API integration tests and rollback without a destructive DB migration |
| 2 | Zod | parse/error semantics, transforms/defaults/refinements and every API validation boundary; focused validation/contract tests |
| 3 | BullMQ + ioredis | supported pairing, connection/retry defaults, delayed/retry/DLQ semantics, worker idempotency and Redis integration/operational checks |
| 4 | NestJS platform/tooling packages | framework migration guide, adapters, decorators, OpenAPI output, auth/exception behavior and API integration tests |
| 5 | React + React DOM + router/i18n adapters | peer ranges, rendering and routing behavior, browser E2E/accessibility tests and production web build |
| 6 | Vite + Vitest and TypeScript/ESLint toolchain | Node compatibility, config/plugin changes, test transforms/coverage, lint, typecheck, tests and builds for every workspace |

A stage is actionable only when its target major and canonical GitHub work item are identified. Completion state is recorded on that GitHub work item after its dedicated PR passes the required checks and merges. “No major currently available” is a valid review result; record it on the work item and do not manufacture an update.

## PR scoping rules

Dependency PRs must be small and focused.

A dependency PR should include:

- the changed manifest file;
- the changed `pnpm-lock.yaml`;
- a short reason for each dependency added, removed, or updated;
- verification results;
- rollback notes.

A dependency PR must not silently include:

- unrelated feature work;
- unrelated refactoring;
- Prisma schema or migration changes;
- CI/CD workflow changes;
- auth/security behavior changes;
- env or secret changes;
- generated code churn unless the dependency change requires it.

If a dependency change requires runtime code changes, keep them minimal and explain why.

## Adding a new dependency

Before adding a new dependency, confirm:

1. Existing project dependencies cannot solve the task clearly.
2. The package is actively maintained.
3. The package has a compatible license for project use.
4. The package does not introduce unnecessary runtime weight.
5. The package does not duplicate an existing library role.
6. The package does not require secrets or external services without an explicit product/security decision.
7. The package is added at the narrowest package scope: root, API, or Web.

New API input validation should continue to use Zod unless a separate architecture decision changes that standard.

## Updating dependencies

Recommended update flow:

1. Identify the exact package and target version.
2. Review the changelog or release notes for breaking changes, security fixes, deprecations, and migration notes.
3. Select the routine or major-migration lane and update only the intended
   package or compatibility domain.
4. Review `package.json` and `pnpm-lock.yaml` diff.
5. Run the relevant checks.
6. Document what changed and how to roll it back.

Use grouped PRs only when packages are tightly related, for example React + React DOM, NestJS packages, or Prisma CLI + Prisma Client.

## Lockfile policy

`pnpm-lock.yaml` is part of the dependency contract.

Rules:

- Do not edit `pnpm-lock.yaml` manually.
- Do not commit lockfile-only churn without a clear reason.
- Do not update unrelated transitive dependency trees intentionally.
- If `pnpm-lock.yaml` changes, the PR must explain which manifest change caused it.
- If only `pnpm-lock.yaml` changes, the PR must explain why no manifest change is expected.
- Generate the lockfile from the repository root with the pinned package manager;
  use `pnpm install --lockfile-only` when installation is not otherwise needed.
- CI and clean installs must use `pnpm install --frozen-lockfile`.
- A major stage must not include unrelated lockfile refreshes. Revert unrelated
  resolution churn or explain why it is an unavoidable transitive consequence.

## Security audit policy

Security updates should be handled as focused PRs.

When a vulnerability is reported:

1. Identify the affected package and dependency path.
2. Check whether the vulnerable code path is used by the project.
3. Prefer the smallest safe upgrade that resolves the issue.
4. Do not suppress or ignore audit findings without an explicit note.
5. Run the relevant checks.
6. Document any remaining risk.

If the fix requires a major upgrade, create a planned upgrade PR instead of mixing it into unrelated work.

## Verification matrix

For dependency PRs, use the narrowest reliable check set.

| Change area | Required checks |
|---|---|
| Root tooling | root lint, typecheck, test, build when applicable |
| API runtime dependency | API lint, typecheck, tests, build, Prisma generate if Prisma-related |
| API dev/test dependency | API lint, typecheck, tests when applicable |
| Web runtime dependency | Web lint, typecheck, tests, build |
| Web dev/test dependency | Web lint, typecheck, tests when applicable |
| Prisma packages | Prisma generate, API typecheck, API tests, build |
| Docker/build-related dependency | build and container/deploy-specific validation if available |

If checks are not run locally, state `not run locally`. If CI is used as the source of truth, state `OK via CI` only after CI is confirmed.

## Prisma-specific dependency rules

Prisma CLI and Prisma Client should stay aligned.

When changing `prisma` or `@prisma/client`:

- update them together unless there is a documented reason not to;
- run Prisma generate;
- review generated-client assumptions;
- run API typecheck;
- run API tests;
- do not change schema or migrations unless the PR is explicitly a migration PR.

## Frontend dependency rules

For frontend packages:

- verify browser build behavior with Web build;
- check TypeScript compatibility;
- check routing/i18n behavior for packages touching React, Vite, routing, or i18n;
- avoid adding large UI frameworks without a separate product/design decision.

## Backend dependency rules

For backend packages:

- verify NestJS compatibility;
- verify ESM/Node.js compatibility;
- avoid adding packages that bypass existing Zod validation, Prisma access patterns, or auth/RBAC conventions;
- do not introduce raw SQL helpers or unsafe query patterns without a separate architecture/security review.

## Rollback policy

Rollback should be simple.

Preferred rollback options:

1. Revert the dependency PR.
2. Restore the previous manifest and lockfile entries.
3. Re-run checks.
4. If runtime code was changed for the dependency, revert those changes together.

Do not roll back by manually editing transitive lockfile sections.

## Prohibited practices

- Do not add dependencies without reading current manifests.
- Do not update all dependencies opportunistically in a feature PR.
- Do not commit dependency changes without the lockfile update when pnpm changes it.
- Do not manually edit `pnpm-lock.yaml`.
- Do not add duplicate libraries for the same role without justification.
- Do not add packages that require real secrets in the repository.
- Do not hide breaking changes inside docs-only or feature PRs.
- Do not claim checks passed if they were not run or not confirmed via CI.

## Minimum PR notes for dependency changes

A dependency PR should include:

- package(s) changed;
- old version and new version;
- why the change is needed;
- whether the change is patch, minor, major, security, add, or remove;
- changed manifest and lockfile files;
- checks run;
- rollback plan;
- known risks.

For a major stage, also include the canonical GitHub work item, upstream migration guide,
compatibility findings, rollout/rollback decision, and before/after verification.

## Non-goals

This policy does not:

- update any dependency;
- add automated dependency tooling;
- add Dependabot/Renovate configuration;
- change CI/CD;
- change package manager version;
- change Node.js version;
- change Prisma schema or migrations.
# Dependency and Update Policy

Document status: docs-only  
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
3. Update only the intended package or package group.
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

## Non-goals

This policy does not:

- update any dependency;
- add automated dependency tooling;
- add Dependabot/Renovate configuration;
- change CI/CD;
- change package manager version;
- change Node.js version;
- change Prisma schema or migrations.

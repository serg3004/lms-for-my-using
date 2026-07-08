# Dependabot pnpm workspace policy

Document status: docs-only  
Scope: Dependabot, pnpm workspace dependency updates, lockfile sync

## Problem

The repository uses a pnpm workspace with a shared root `pnpm-lock.yaml`.

Dependabot PRs must not update nested workspace manifests such as `apps/api/package.json` or `apps/web/package.json` without also updating the shared root lockfile. If that happens, CI fails on:

```bash
pnpm install --frozen-lockfile
```

with `ERR_PNPM_OUTDATED_LOCKFILE`.

## Current rule

Dependabot npm updates must be configured at workspace level, not as separate independent updates for `/apps/api` and `/apps/web`.

Use one npm update entry with:

```yaml
directories:
  - /
  - /apps/api
  - /apps/web
```

This keeps root, API, and web dependency manifests in the same Dependabot update context and allows lockfile changes to be generated together with manifest changes.

## Do not do

Do not restore separate npm Dependabot entries like this:

```yaml
- package-ecosystem: npm
  directory: /apps/api

- package-ecosystem: npm
  directory: /apps/web
```

That pattern can create PRs that update nested `package.json` files without updating the shared root `pnpm-lock.yaml`.

## Review checklist for Dependabot PRs

Before merging a Dependabot npm PR:

1. Confirm CI is green.
2. Confirm any changed workspace `package.json` has a matching `pnpm-lock.yaml` change.
3. Confirm `pnpm install --frozen-lockfile` passes in CI.
4. Do not manually edit `pnpm-lock.yaml`; regenerate it with pnpm when needed.

## Manual recovery

If Dependabot still opens a PR with a stale lockfile:

```bash
git checkout <dependabot-branch>
pnpm install --lockfile-only
git add pnpm-lock.yaml
git commit -m "fix(deps): sync pnpm lockfile"
git push
```

Then wait for CI before merging.

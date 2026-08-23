# ADR: Roles in JWT vs. DB-backed roles

**Status:** Accepted (documents an existing, already-implemented decision)
**Date:** 2026-08-22
**Context:** PR 138 — Roles in JWT: архитектурное решение

## Context

The access token issued by `AuthService.login` / `refreshSession` (`apps/api/src/modules/auth/auth.tokens.ts`) needs to carry enough identity for the API to authorize requests. Two standard approaches exist:

1. **Roles in JWT** — bake the user's role(s) into the signed token at issue time. Every subsequent request decodes the token and trusts the embedded roles until the token expires (access tokens in this codebase live 15 minutes).
2. **DB-backed roles** — the token carries only a stable identity (`sub`, `organizationId`, `email`, `jti`), and every authorization check re-reads the user's roles from the `memberships` table.

A user in this system can hold **multiple roles** (the `Membership` model has `@@unique([organizationId, userId, role])`, not a single `role` column on `User`), and roles are administered by an admin/manager through the Users/Memberships API — i.e. role changes must be able to take effect without the affected user needing to log out.

## Decision

**DB-backed roles.** This is not a new choice — it is what the codebase already does, consistently, across every place that needs a user's roles:

- `signJwt` (`auth.tokens.ts`) signs only `{ sub, organizationId, email }` plus standard claims (`jti`, `iat`, `exp`). No `roles` claim exists in the token today.
- `AuthService.withRoles()` queries `prisma.membership.findMany({ where: { userId, organizationId } })` to attach `roles` to the `CurrentUser` object returned by `/auth/login`, `/auth/refresh`, and `/auth/me`.
- `RolesGuard` (`roles.guard.ts`), the guard that enforces `@Roles(...)` policies on every protected endpoint, independently queries `membership.findMany` for the current request's user, caching the result only for the lifetime of that single request (a `Symbol`-keyed property on the request object, not a cross-request cache).

This ADR formalizes that as the intended architecture rather than an accident, and records why it should stay this way.

## Rationale

- **Immediate revocation.** An admin removing a user's `manager` membership (or disabling the account) takes effect on the user's *very next request*, because `RolesGuard` re-reads the DB every time. With roles embedded in the JWT, the change would only take effect after the 15-minute access token expired and was refreshed — a meaningful window where a de-provisioned manager could still exercise manager-only endpoints.
- **Multi-role support without payload growth.** A user can hold several roles; DB-backed lookup treats this uniformly (`membershipRoles.some(...)`) without needing to keep the token's role list in sync with membership changes across renewals.
- **Smaller, more stable token.** The JWT payload never needs to change shape when the permission model evolves (e.g. adding a new role or splitting membership scopes) — only the guard's DB query and `rolePolicies` map (`roles.ts`) change.
- **Existing session/refresh model already assumes a DB round-trip.** `getCurrentUser`, `refreshSession`, and `RolesGuard` all already hit Postgres (`session` and `membership` lookups) on the request path, so DB-backed roles add no new architectural cost — there is no "stateless JWT" property being given up that the system relies on elsewhere.

## Trade-off accepted

DB-backed roles add one `membership.findMany` query per request that hits a role-guarded endpoint (deduplicated within a request via the guard's request-scoped cache, but not across requests). This is an accepted cost: the `memberships` table is small per organization and indexed by `(organizationId, userId)` via the `@@unique` constraint, and correctness (immediate revocation) is judged more important than shaving one indexed lookup per request. If this ever becomes a measured bottleneck, the mitigation is a short-TTL cache (e.g. Redis, a few seconds) in front of the membership lookup — not moving roles into the JWT, which would reintroduce the stale-permission window described above.

## Consequences

- No code change was required to implement this decision — it already matches the codebase.
- Any future change that considers embedding roles in the JWT must explain how it will preserve immediate revocation, or must accept and document the resulting propagation delay.
- The token contract is covered by `apps/api/src/modules/auth/auth.tokens.spec.ts`, including an explicit assertion that no `role` or `roles` claim is issued. Role-guard behavior is covered by `apps/api/src/modules/auth/roles.guard.spec.ts` (allowed role, cached-within-request lookup, missing policy fails closed, disallowed role rejected, missing current user rejected) and `apps/api/src/modules/auth/api-policy.audit.spec.ts` (endpoint-to-policy coverage audit).

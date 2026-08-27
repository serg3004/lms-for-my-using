# ADR: Rate limiting — custom middleware vs. `@nestjs/throttler`

**Status:** Accepted
**Date:** 2026-08-22
**Context:** PR 139 — Rate limiting: кастомный middleware или Nest Throttler

## Context

Sensitive endpoints — `POST /api/v1/auth/login`, `POST /api/v1/auth/password-reset/request`, `POST /api/v1/auth/password-reset/confirm`, `POST /api/v1/organizations/register` — need brute-force/abuse protection. Two standard approaches exist in the Nest ecosystem:

1. **`@nestjs/throttler`** — the framework's official rate-limiting module. Out of the box it ships an in-memory storage backend; distributed (multi-instance) limiting requires plugging in a custom `ThrottlerStorage` implementation (e.g. backed by Redis) yourself.
2. **Custom middleware** — hand-rolled rate limiting wired directly into the Express pipeline in `main.ts`.

This codebase already has (2): `apps/api/src/common/middleware/api-hardening.ts`, wired into `main.ts` via `app.use(createSensitiveRouteRateLimitMiddleware(...))`. `@nestjs/throttler` is not a dependency of this project.

## Decision

**Keep the custom middleware. Do not migrate to `@nestjs/throttler`.**

## Rationale

The custom implementation already provides everything a from-scratch `ThrottlerModule` adoption would need to be re-built to match, and is already running in production:

- **Multi-tier limiting per request**: IP-scoped, per-account (SHA-256 hash of normalized `organizationId`+`email`, so raw credentials never sit in Redis keys), and a global ceiling — evaluated together via `Promise.all`, all three tiers enforced atomically per request (`api-hardening.ts:206-231`).
- **Redis-primary with fail-closed runtime behavior**: a Lua script (`ATOMIC_INCREMENT_WITH_TTL_SCRIPT`) does an atomic `INCR` + `PEXPIRE` in Redis; on a configured Redis error, security-critical routes return retryable `503` on every replica and retry Redis on the next request. Explicit startup without Redis remains a separately opted-in in-memory emergency mode. The operational modes (`REDIS-PRIMARY`, `RUNTIME-FAIL-CLOSED`, `STARTUP-IN-MEMORY`) are documented in `docs/RATE_LIMIT_FAILURE_POLICY.md`.
- **Observability hooks**: structured logs and Prometheus counters (`rateLimitRejects`, `redisErrors`) on every request, rejection, and mode change, wired in `main.ts`.
- **Already tested against the exact routes PR 139 asks for**: `apps/api/src/common/middleware/api-hardening.spec.ts` has `it.each(['/api/v1/auth/login', '/api/v1/auth/password-reset/request', '/api/v1/auth/password-reset/confirm', '/api/v1/organizations/register'])(...)` asserting 429 after the configured threshold, plus dedicated Redis failure, multi-instance fail-closed, and recovery tests.

`@nestjs/throttler`'s built-in storage is in-memory only — using it as-is in a multi-instance deployment (this API runs multiple Railway instances behind a shared Postgres/Redis) would silently give each instance its own independent counters, which is materially *weaker* than what exists today. Getting throttler to match today's behavior would mean writing a custom `ThrottlerStorage` backed by Redis with the same atomic-increment-plus-fail-closed semantics — i.e., re-implementing `api-hardening.ts` underneath a different public API, for no behavioral gain. The only real upside of `@nestjs/throttler` — decorator-based per-route policy declarations instead of the two `Set`s of route strings in `api-hardening.ts` — is a minor ergonomics improvement that doesn't justify discarding a tested, documented, already-degradation-aware implementation.

## Trade-off accepted

The custom middleware is bespoke: it isn't a well-known library, so a new contributor has to read `api-hardening.ts` and `RATE_LIMIT_FAILURE_POLICY.md` rather than lean on `@nestjs/throttler`'s documentation. This is accepted — the behavior it needs to provide (multi-tier limits, atomic Redis operations, transparent degradation, per-mode observability) is specific enough that no off-the-shelf module removes that reading requirement anyway.

## Hardening done alongside this decision

While reviewing the custom implementation for this ADR, the in-memory store (`createInMemoryRateLimitStore`) was found to never evict expired entries — its backing `Map` grows for as long as the process runs. This matters because that store is the **primary** store for the entire process lifetime whenever `ALLOW_IN_MEMORY_RATE_LIMIT=true` (`STARTUP-IN-MEMORY` mode). It is no longer used for configured Redis runtime failures after PR 224. A sustained attack rotating source IPs or registration emails against the very endpoints this limiter protects would grow that `Map` without bound. Fixed by sweeping expired entries once the store has accumulated `IN_MEMORY_STORE_SWEEP_INTERVAL` (5,000) writes since the last sweep — bounding memory growth without adding a background timer or changing the store's request-path performance characteristics. Covered by a new test (`api-hardening.spec.ts`, "sweeps expired in-memory entries so a sustained attack cannot grow the store forever").

## Consequences

- No migration to `@nestjs/throttler`; `api-hardening.ts` remains the source of truth for sensitive-route rate limiting.
- `docs/RATE_LIMIT_FAILURE_POLICY.md` remains the source of truth for degradation/fallback behavior and operational interpretation; this ADR does not duplicate it.
- The in-memory store now bounds its own memory usage under sustained load, in both of the modes where it can run for a process's entire lifetime.
- Any future proposal to adopt `@nestjs/throttler` must show it preserves atomic multi-tier limiting and Redis-outage degradation without a regression, not just route-policy ergonomics.

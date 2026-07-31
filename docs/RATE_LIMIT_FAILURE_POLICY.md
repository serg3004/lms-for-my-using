# Rate-limit failure policy

Sensitive authentication routes use Redis as the normal, shared rate-limit store. A Redis failure must never silently disable protection.

## Protected routes

| Route | Normal mode | Redis failure policy |
| --- | --- | --- |
| `POST /api/v1/auth/login` | IP, organization+normalized email, and global limits | Local emergency limiter with the same limits |
| `POST /api/v1/auth/password-reset/request` | IP, organization+normalized email, and global limits | Local emergency limiter with the same limits |
| `POST /api/v1/auth/password-reset/confirm` | IP and global limits | Local emergency limiter with the same limits |
| `POST /api/v1/organizations/register` | IP and global limits | Local emergency limiter with the same limits |

The local limiter is per API process. It is less effective than the shared Redis limit, but it preserves bounded protection while Redis is unavailable. Every sensitive request retries Redis, so the next successful operation restores distributed mode automatically. Local counters remain isolated and are not copied to Redis.

## Observability and alerting

On the first Redis error in an outage, the API:

- emits an error-level structured log with `event=rate_limit_degraded`, `mode=local-degraded`, and `alert=true`;
- reports the error to Sentry when `SENTRY_DSN` is configured;
- emits the `rate_limit_request_total` metric event for every protected request, labelled with `mode` and `route`.

Repeated failures do not create repeated alerts for the same outage. Recovery emits `event=rate_limit_recovered` with `mode=redis`. Alerting must page on `rate_limit_degraded` (or the matching Sentry issue), and resolve after `rate_limit_recovered`.

## Operations

1. Check Redis reachability, latency, connection limits, and credentials.
2. Confirm logs continue to show `rate_limit_request_total` with `mode=local-degraded`; absence means protection is not being exercised.
3. Do not scale out API instances as a mitigation: local counters are not shared.
4. After Redis recovery, confirm a `rate_limit_recovered` event and subsequent metric events with `mode=redis`.
5. Treat a prolonged degraded interval as a security incident because attackers can distribute attempts across instances.

# Railway production smoke status

Last verified: 2026-07-08

Status: **OK**

## Production endpoints

```text
web: https://web-production-b1f01.up.railway.app
api: https://api-production-2938.up.railway.app
```

## Railway web variables

```text
API_UPSTREAM_URL=https://api-production-2938.up.railway.app
```

## Verified checks

```text
GET /api/v1/health through web  OK
web -> api -> db                OK
MVP smoke test                 OK (Passed: 17, Failed: 0)
```

## Fixes applied

- PR #341: allow web nginx to proxy `/api/` to a full `API_UPSTREAM_URL` value.
- PR #342: configure nginx upstream TLS/SNI and explicit timeouts.

## Smoke command

Run from the repository root:

```bash
BASE_URL=https://web-production-b1f01.up.railway.app/api/v1 \
  pnpm dlx tsx apps/api/src/scripts/smoke-test.ts
```

Expected result:

```text
Passed: 17   Failed: 0
```

## Troubleshooting note

If `/api/v1/health` through the web URL times out again:


```bash
railway logs --service web --tail 120
```

Nginx `499` for `/api/v1/health` means the client closed the request while the web proxy was calling the upstream.

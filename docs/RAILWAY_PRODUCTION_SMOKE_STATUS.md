# Railway production smoke status

Last verified: 2026-07-08

**[2026-08-06] Stale.** ~60 PRs have merged to `main` since this was last verified (including a client-timeout/nginx-proxy fix). A fresh live smoke run against production could not be performed from this environment — outbound network access to `web-production-b1f01.up.railway.app` is blocked by the sandbox's egress policy (`403 Host not in allowlist`). The status below is the last known-good result, not a current one; re-run the smoke command from an environment with production network access before trusting it.

Status: **OK (as of 2026-07-08, unverified since)**

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

## Post-merge production verification checklist

After a GitHub PR is merged, verify Railway production separately:

1. Wait for Railway to finish the production deploy.
2. Check `GET /api/v1/health` through the web URL.
3. Check `GET /api/v1/health` through the direct API URL.
4. Run the MVP smoke test through the web URL.
5. Record the result in this document only after production is verified.

Do not treat green GitHub checks as production verification.

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

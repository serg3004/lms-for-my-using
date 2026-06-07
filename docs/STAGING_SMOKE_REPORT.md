# Staging Smoke Report

---

## Smoke #2 — 2026-06-07

**Date:** 2026-06-07
**Branch:** `main`
**Commit SHA:** `5fa966e249c0fabd683fd2e868f72f9335010a54`
**Tester:** Claude Code (automated checks) + manual

### Services

| Service | URL | Status | Notes |
|---|---|---|---|
| PostgreSQL | Railway managed | unknown | Cannot reach DB directly; API status is proxy |
| API | `https://api-production-2938.up.railway.app` | **DOWN (502)** | All endpoints return Railway 502 |
| Web | `https://web-production-b1f01.up.railway.app` | UP | HTTP 200, served at 17:20 UTC |

### Smoke results

| Check | Result | Notes |
|---|---|---|
| Web home page | OK | HTTP 200, HTML served |
| API health direct | **FAIL** | `{"status":"error","code":502,"message":"Application failed to respond"}` |
| Web → API health proxy | **FAIL** | Timeout (curl exit 28) |
| Admin login | SKIP | API down |
| Learner login | SKIP | API down |
| All learner/admin flows | SKIP | API down |

### Verdict

**NOT READY — API is down (502). Application is not functional.**

### Probable cause

Multiple PRs merged to `main` since Smoke #1, including:
- **PR 151** — Fail-fast env validation (`DATABASE_URL`, `JWT_SECRET` now validated on startup via Zod)
- **PR 152** — Health endpoint now performs `SELECT 1` against DB
- **PR 156** — Dockerfile change (removed `# syntax=docker/dockerfile:1`) — triggered Railway redeploy

Web was redeployed successfully today at 17:20 UTC (last-modified header confirmed). API is returning 502 "Application failed to respond" — Railway can reach the service port but the app is not responding, indicating a **startup crash or crash loop**.

### Required action (PR 116)

1. Open Railway dashboard → API service → **Logs**
2. Find the crash reason (likely: `Invalid API environment` from Zod validation, or `prisma migrate deploy` failure)
3. Verify Railway env vars are set:
   - `DATABASE_URL` — Railway PostgreSQL reference
   - `JWT_SECRET` — min 32 characters
   - `NODE_ENV=production`
   - `API_PORT=3000`
4. If env vars are correct, check Prisma migration logs
5. After fix: re-run smoke steps 3–16 from Smoke #1

### Changes since Smoke #1 (2026-06-06)

| PR | Change | Risk |
|---|---|---|
| PR 151 | Fail-fast env validation — crashes on startup if vars missing | **HIGH** — most likely cause of 502 |
| PR 152 | DB health check (`SELECT 1`) | Medium |
| PR 153 | Security audit tests only | None |
| PR 154 | KK locale sync (frontend) | None |
| PR 155 | Login UX (frontend) | None |
| PR 156 | Docker: remove syntax directive | Medium — triggered redeploy |
| PR 157 | Admin mobile hamburger nav (frontend) | None |
| PR 158 | CI concurrency fix | None |
| PR 159 | Frontend lazy loading | None (not yet deployed) |

---

## Smoke #1 — 2026-06-06

**Date:** 2026-06-06
**Branch:** `main`
**Commit SHA:** (not recorded)
**Tester:** manual

### Services

| Service | Status | Notes |
|---|---|---|
| Postgres | OK | Railway PostgreSQL online |
| API | OK | `https://api-production-2938.up.railway.app` |
| Web | OK | `https://web-production-b1f01.up.railway.app` |

### API deploy

- Railway API deploy status: OK
- Prisma migrations: OK, no pending migrations
- Prisma Client generation: OK after Docker image fix
- NestJS module startup: OK after auth module imports were added to guarded modules
- Health check: OK

  ```
  GET https://api-production-2938.up.railway.app/api/v1/health
  {"status":"ok"}
  ```

### Web deploy

- Railway Web deploy status: OK
- Public domain port: 80
- Web static page: OK
- Web → API nginx proxy: OK after API was set to listen on 3000 for private networking

  ```
  GET https://web-production-b1f01.up.railway.app/api/v1/health
  {"status":"ok"}
  ```

### Staging env variables (at time of Smoke #1)

**API:**
- `DATABASE_URL` — Railway PostgreSQL reference
- `FRONTEND_URL=https://web-production-b1f01.up.railway.app`
- `JWT_SECRET` — configured, min 32 characters
- `NODE_ENV=production`
- `API_PORT=3000`

**Web:**
- `PORT=8000` (note: Railway public domain target is 80; nginx listens on 80)

### Seed

```
node prisma/seed.mjs
```

Result: OK.

```
✅ Demo seed complete.
```

Demo credentials:
- Organization ID: `demo-company`
- Admin: `admin@demo.com` / `Demo1234!`
- Learner: `learner@demo.com` / `Demo1234!`

### Smoke results

| Check | Result | Notes |
|---|---|---|
| API health direct | OK | `/api/v1/health` returns `{"status":"ok"}` |
| Web home | OK | Login entry page opens |
| Web → API health proxy | OK | `/api/v1/health` returns `{"status":"ok"}` |
| Admin login | OK | `admin@demo.com` |
| Admin dashboard | OK | Page opens |
| Learner login | OK | `learner@demo.com` |
| Learner profile | OK | Profile data loads |
| Learner courses list | OK | `Workplace Safety Fundamentals` visible |
| Course details | OK | Progress shows `1/3` lessons |
| Lessons list | OK | 3 lessons visible |
| Lesson detail | OK | Material link and complete action visible |
| Mark lesson complete | OK | Success message visible |
| Progress | OK | Progress record visible |
| Assessments | OK | Safety Knowledge Assessment visible |
| Assignments | OK | Assignment list and details open |
| Certificates | OK | Empty state visible |

### Verdict

**MVP READY for demo** (as of Smoke #1).

### Known risks / non-blockers (at time of Smoke #1)

- UI is raw MVP: duplicated "Log out", mixed RU/EN text, weak layout
- Admin sections mostly "Coming soon"
- Some labels show generic "Course" / "Lesson" instead of readable names
- Demo material links point to example.com placeholders
- S3/upload not configured

### Fixes applied during staging bring-up (Smoke #1)

- Added Prisma Client generation to API Docker image build
- Added `AuthModule` imports to modules that use `AuthGuard`
- Set API runtime port to 3000 to match web nginx private proxy target
- Set web public domain target port to 80 to match nginx listen port
- Updated API `FRONTEND_URL` to Railway web public domain

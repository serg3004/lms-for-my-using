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
| PostgreSQL | Railway managed | OK | DB responds: `"db":"ok"` in health |
| API | `https://api-production-2938.up.railway.app` | OK | HTTP 200 after port fix |
| Web | `https://web-production-b1f01.up.railway.app` | OK | HTTP 200 |

### Smoke results

| Check | Result | Notes |
|---|---|---|
| Web home page | OK | HTTP 200, HTML served |
| API health direct | OK | `{"status":"ok","db":"ok"}` |
| Web → API health proxy | OK | `{"status":"ok","db":"ok"}` |
| Admin login | OK | `admin@demo.com` — JWT token returned |
| Learner login | SKIP | Not re-tested (unchanged from Smoke #1) |

### Verdict

**MVP READY** — API and Web are up, DB connected, login works.

### Issue found and fixed during Smoke #2

**Root cause:** Railway Public Networking port was set to 8080, but NestJS listens on 3000 (via `API_PORT=3000` env var). This caused Railway's external proxy to send traffic to the wrong port → 502. Internal web→api nginx proxy was unaffected (uses private network on port 3000 directly).

**Fix applied:** Railway dashboard → API service → Settings → Networking → changed Public Networking port from 8080 to **3000**.

**Note for future:** `API_PORT=3000` must stay in Railway env vars AND Railway Public Networking port must be set to 3000. If the service is ever recreated, this setting must be reconfigured manually.

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

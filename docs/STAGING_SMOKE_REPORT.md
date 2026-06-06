# Staging smoke report

Date: 2026-06-06
Environment: Railway staging
branch: `main`

## Services

| Service | Status | Notes |
| --- | --- | --- |
| Postgres | OK | Railway PostgresQL online |
| API | OK | `https://api-production-2938.up.railway.app` |
| Web | OK | `https://web-production-b1f01.up.railway.app` |

## API deploy

- Railway API deploy status: OK.
- Prisma migrations: OK, no pending migrations.
- Prisma Client generation: OK after Docker image fix.
 - Fixed by: `pnpm --filter @lms/api prisma:generate` during API Docker build.
- NestJS module startup: OK after auth module imports were added to guarded modules.

- Health check: OK.

  ```text
  GET https://api-production-2938.up.railway.app/api/v1/health
  {"status":"ok"}
  ```

## Web deploy

- Railway Web deploy status: OK.
- Public domain port: 80.
- Web static page: OK.
 - Web -> API nginx proxy: OK after API was set to listen on `3000` for private networking to match web nginx proxy target.

  ```text
  GET https://web-production-b1f01.up.railway.app/api/v1/health
  {"status":"ok"}
  ```

## Staging env variables

### API

- `DATABASE_URL`: Railway PostgreSQL reference
- `FRONTEND_URL=https://web-production-b1f01.up.railway.app`
- `JWT_SECRET`: configured, minimum 32 characters
- `NODE_ENV=production`
- `API_PORT=3000`

### Web

- `PORT=8000`
  - Note: Railway public domain target port is 80, because nginx listens on 80\. The `PORT` variable was added during troubleshooting, but web is served via nginx on port 80.

## Seed

Command:

```bash
node prisma/seed.mjs
```

Result: OK.

 ```text
✅ Demo seed complete.
```

Demo credentials:

- Organization ID: `demo-company`
- Admin: `admin@demo.com` / `Demo1234!`
- Learner: `learner@demo.com` / `Demo1234!`

## Manual smoke results

|Check | Result | Notes |
| --- | --- | --- |
| API health direct | OK | `/api/v1/health` returns `{"status":"ok"}` |
| Web home | OK | Login entry page opens |
| Web -> API health proxy | OK | `/web /api/v1/health` returns `{"status":"ok"}` |
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

## Ongoing risks / non-blockers

- UI is still a raw MVP: duplicated `Log out`, mixed RU/EN text, weak learner/admin layout.
 - Admin sections are mostly `Coming soon`.
- Some labels show generic `Course` / `Lesson` instead of readable names.
- Demo material links point to example.com placeholders.
- S3/upload is not configured for this first staging smoke.
- For the first staging pass, the above items are not Railway deploy blockers.

## Fixes applied during staging bring-up

- Added Prisma Client generation to API Docker image build.
- Added `AuthModule` imports to modules that use `AuthGuard`.
- Set API runtime port to `3000` to match web nginx private proxy target.
- Set Web public domain target port to `80` to match nginx listen port.
- Updated API `FRONTEND_URL` to the Railway Web public domain.

## Next steps

1. Keep this staging environment for regression smoke.
3. Fix the UI debt in separate minimal frontend PR(s).
4. Add a repeatable staging smoke script against the public API and Web URLs.
5. Configure real storage for uploads if material upload smoke is needed.

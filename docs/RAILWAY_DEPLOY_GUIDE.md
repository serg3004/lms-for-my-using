# Railway Deploy Guide

Complete step-by-step guide for deploying the LMS MVP to Railway staging.

---

## Prerequisites

- Railway account at [railway.app](https://railway.app)
- Railway CLI: `npm install -g @railway/cli`
- Access to this GitHub repository

---

## Architecture

```text
Railway Project
├── web   (nginx + React SPA)   → public URL
├── api   (NestJS)              → internal :3000
└── DB    (Railway Postgres)    → internal network
```

`web` proxies `/api/*` to `api:3000` via nginx.
`api` connects to `DB` via `DATABASE_URL` (Railway internal).

---

## Current demo web URL

```text
https://web-production-b1f01.up.railway.app
```

Routes:

- Login: `https://web-production-b1f01.up.railway.app/login`
- Admin: `https://web-production-b1f01.up.railway.app/admin`
- Learner: `https://web-production-b1f01.up.railway.app/learn`
- Learner courses: `https://web-production-b1f01.up.railway.app/learn/courses`
- Learner certificates: `https://web-production-b1f01.up.railway.app/learn/certificates`

Demo credentials:

| Role | Organization | Email | Password |
|---|---|---|---|
| Admin | `demo-company` | `admin@demo.com` | `Demo1234!` |
| Learner | `demo-company` | `learner@demo.com` | `Demo1234!` |

If the credentials fail, re-run the demo seed for the `api` service.

---

## Step 1 — Create Railway project

1. [railway.app](https://railway.app) → **New Project** → **Empty project**
2. Note the project name/ID.

---

## Step 2 — Add PostgreSQL

Dashboard → **New** → **Database** → **Add PostgreSQL**

Railway automatically sets `DATABASE_URL` for services in the same project.

---

## Step 3 — Deploy API service

1. Dashboard → **New** → **GitHub Repo** → select this repo
2. Settings:
   - **Root Directory**: `/` (repo root)
   - **Dockerfile Path**: `apps/api/Dockerfile`
3. Set environment variables:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | *(auto from Railway Postgres)* | — |
| `JWT_SECRET` | 64-char random string | `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://<web-service>.up.railway.app` | set after web is deployed |
| `NODE_ENV` | `production` | — |

> S3 variables are optional — uploads show 503 if not set.

4. Deploy → wait for build to finish.
5. Verify: `GET https://<api-url>/api/v1/health` → `{"status":"ok"}`

**Migrations run automatically** on API startup via `prisma migrate deploy`.

---

## Step 4 — Deploy Web service

1. Dashboard → **New** → **GitHub Repo** → same repo
2. Settings:
   - **Root Directory**: `/`
   - **Dockerfile Path**: `apps/web/Dockerfile`
3. No extra environment variables needed.
4. Deploy → wait for build.
5. Update API's `FRONTEND_URL` to the web service public URL → redeploy API.

---

## Step 5 — Run demo seed

After both services are running:

```bash
# Install Railway CLI and link project
railway login
railway link

# Run compiled seed
railway run --service api node dist/scripts/seed.js
```

Expected output:

```text
✅ Demo seed complete.

Credentials (password: Demo1234!):
  Organization UUID: 10000000-0000-4000-8000-000000000001
  Organization slug: demo-company
  Admin:   admin@demo.com
  Learner: learner@demo.com

Demo state:
  Course: Workplace Safety Fundamentals (3 lessons)
  Learner has completed 1/3 lessons — progress bar visible
  Assessment: Safety Knowledge Assessment (5 questions, 60% passing)
```

The seed is **idempotent** — safe to run multiple times.

---

## Step 6 — Smoke test

Run the automated smoke test against staging:

```bash
# From repo root
BASE_URL=https://<web-url>/api/v1 \
  node --import tsx/esm apps/api/src/scripts/smoke-test.ts
```

Or after building:

```bash
BASE_URL=https://<api-url>/api/v1 \
  railway run --service api node dist/scripts/smoke-test.js
```

Expected: all checks pass with ✓.

---

## Smoke test checklist (manual)

If you prefer to verify manually, go through this flow in the browser:

### As learner (learner@demo.com / Demo1234!)

- [ ] **Login** — go to `/login`, enter org `demo-company`, email `learner@demo.com`, password `Demo1234!` → redirected to learner home
- [ ] **Courses** — `/learn/courses` → see "Workplace Safety Fundamentals"
- [ ] **Course detail** → progress bar shows 1/3 lessons completed
- [ ] **Lessons list** → 3 lessons, lesson 1 has ✓ badge
- [ ] **Lesson 2 detail** → shows description + material link + "Завершить урок" button
- [ ] **Complete lesson 2** → button changes to "Урок завершён", go back → ✓ badge, 2/3 progress
- [ ] **Complete lesson 3** → 3/3 progress
- [ ] **Assessments** → see "Safety Knowledge Assessment"
- [ ] **Assessment detail** → "Start assessment" button visible
- [ ] **Take assessment** → answer all 5 questions, submit → result shows score and breakdown
- [ ] **Certificate** → if passed, "View certificate" button → certificate page with Print button
- [ ] **Print** → certificate renders correctly in print preview

### As admin (admin@demo.com / Demo1234!)

- [ ] **Login** → redirected to admin panel
- [ ] **Courses** → see "Workplace Safety Fundamentals"
- [ ] **Lessons** → 3 lessons listed with inline status selects
- [ ] **Materials** → 3 materials listed
- [ ] **Assessment builder** → "Safety Knowledge Assessment" with 5 questions

---

## Re-deploy

On every push to `main`, Railway auto-deploys both services.

Migrations run automatically on API startup. No manual action needed.

---

## Troubleshooting

### API health check fails

```bash
railway logs --service api --tail 50
```

Common causes:

- `DATABASE_URL` not set or incorrect
- `JWT_SECRET` missing
- Migration failed on startup (check logs for `PrismaClientInitializationError`)

### Login fails with 401

- Verify org slug is `demo-company` (not email domain)
- Verify seed ran successfully: check Railway logs for "Demo seed complete"
- Check `FRONTEND_URL` matches the actual web URL (affects CORS)

### Web shows blank page / 502

- Check `railway logs --service web`
- Verify API service is healthy: `GET /api/v1/health`
- Check nginx config: `/api/` proxy target is `api:3000`

### Seed fails with "relation does not exist"

Migrations haven't run yet. Wait for API to finish starting, check logs for:

```text
All migrations have been successfully applied.
```

Then re-run the seed.

### Certificate page shows "Certificate not found"

Verify the learner is logged in and the certificate belongs to the same user. Certificate detail data is returned by `GET /certificates/:id`.

---

## Rollback

Railway keeps all previous deployments.

Dashboard → service → **Deployments** tab → click any previous deploy → **Redeploy**

---

## Environment variables reference

### API service

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Min 32 chars, used for signing access tokens |
| `FRONTEND_URL` | ✅ | Web service public URL (for CORS) |
| `NODE_ENV` | ✅ | Set to `production` |
| `S3_ENDPOINT` | ☐ | S3-compatible endpoint URL |
| `S3_BUCKET` | ☐ | Bucket name |
| `S3_ACCESS_KEY_ID` | ☐ | Access key |
| `S3_SECRET_ACCESS_KEY` | ☐ | Secret key |
| `S3_REGION` | ☐ | Default: `auto` |
| `S3_FORCE_PATH_STYLE` | ☐ | Default: `false` (set `true` for MinIO) |
| `S3_PUBLIC_URL` | ☐ | Public base URL for uploaded files |

### Web service

No required variables. nginx is pre-configured to proxy `/api/` to the internal `api:3000`.

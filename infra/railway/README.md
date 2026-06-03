# Railway Deployment Guide

## Architecture on Railway

```
┌─────────────────────────────────────────┐
│              Railway Project            │
│                                         │
│  ┌──────────┐   ┌──────────┐  ┌──────┐ │
│  │  web     │   │  api     │  │  DB  │ │
│  │  nginx   │──▶│  NestJS  │──▶  PG  │ │
│  │  :80     │   │  :3000   │  │      │ │
│  └──────────┘   └──────────┘  └──────┘ │
└─────────────────────────────────────────┘
```

Three Railway services:
- **web** — React SPA served by nginx (Dockerfile: `apps/web/Dockerfile`)
- **api** — NestJS REST API (Dockerfile: `apps/api/Dockerfile`)
- **PostgreSQL** — Railway managed Postgres plugin

---

## First-time setup

### 1. Create Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Choose **Empty project**

### 2. Add PostgreSQL

In the project dashboard → **New** → **Database** → **PostgreSQL**

Railway will automatically create the `DATABASE_URL` variable.

### 3. Create API service

1. **New** → **GitHub Repo** → select this repository
2. Set **Root Directory**: `/` (repo root)
3. Set **Dockerfile Path**: `apps/api/Dockerfile`
4. Railway will detect `apps/api/railway.json` automatically

**Required environment variables** (set in Railway dashboard):

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | set by Railway Postgres plugin | — |
| `JWT_SECRET` | random 32+ char string | use `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://your-web.up.railway.app` | web service URL |
| `NODE_ENV` | `production` | — |

### 4. Create Web service

1. **New** → **GitHub Repo** → same repository
2. Set **Root Directory**: `/` (repo root)
3. Set **Dockerfile Path**: `apps/web/Dockerfile`
4. Railway will detect `apps/web/railway.json` automatically

No extra environment variables required for web.
The API proxy target is `api:3000` (Railway internal network).

### 5. Link services on internal network

In Railway dashboard, both services must be in the same project.
Internal hostname `api` in `infra/nginx/nginx.conf` resolves automatically
via Railway's private networking.

---

## Deployment flow

On every push to `main`:

```
GitHub push → Railway detects change
           → docker build (Dockerfile)
           → prisma migrate deploy   ← runs on API startup
           → node dist/main.js
```

The API container runs `prisma migrate deploy` before starting the server.
This is safe for multiple replicas because Prisma locks migrations.

---

## Useful Railway CLI commands

```bash
# Install
npm install -g @railway/cli

# Login
railway login

# Link local project
railway link

# View logs
railway logs --service api
railway logs --service web

# Open shell in running container
railway shell --service api

# Run one-off command (e.g. seed)
railway run --service api node dist/scripts/seed.js
```

---

## Rollback

Railway keeps previous deployments. To roll back:
Dashboard → service → Deployments tab → click previous deploy → **Redeploy**

# MVP Local Runbook

## Purpose

This runbook describes how to start the LMS MVP locally for development and pilot validation.

It is documentation only. It does not apply real migrations, does not change CI/CD, and does not add deploy scripts.

## 1. Prerequisites

Required tools:

- Node.js compatible with the current workspace.
- pnpm `9.15.0`.
- Docker with Docker Compose support.
- Git.

Recommended checks:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

## 2. Install dependencies

From the repository root:

```bash
pnpm install
```

## 3. Environment setup

Create a local environment file from the example:

```bash
cp .env.example .env
```

Minimum local values:

```text
NODE_ENV=development
API_PORT=3000
WEB_PORT=5173
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lms
JWT_SECRET=change-me-change-me-change-me-32chars
S3_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_BUCKET=lms-local
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
```

Rules:

- Do not commit `.env`.
- Keep `JWT_SECRET` at least 32 characters.
- Use local-only credentials for local development.
- Do not use production secrets in local files.

## 4. Local PostgreSQL and MinIO

The repository does not require a committed Docker Compose file for this runbook.

Use this local-only compose example if you need PostgreSQL and MinIO:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: lms
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - lms_postgres_data:/var/lib/postgresql/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - lms_minio_data:/data

volumes:
  lms_postgres_data:
  lms_minio_data:
```

Run it from a local scratch file if needed:

```bash
docker compose -f docker-compose.local.yml up -d
```

Do not commit `docker-compose.local.yml` unless a future PR explicitly adds local infrastructure files.

## 5. Prisma generate

Generate Prisma Client from the API app:

```bash
pnpm --filter @lms/api prisma:generate
```

This command is safe because it only generates client code from the existing schema.

## 6. Safe migration flow

For MVP local development, migrations must be explicit operator actions.

Safe review flow:

```bash
pnpm --filter @lms/api prisma:generate
```

Before applying anything to a real database:

- review `apps/api/prisma/schema.prisma`;
- review existing migration files;
- confirm the target database is local or disposable;
- confirm there is no production/staging database URL in `.env`.

Do not run real migrations against non-local databases without explicit approval.

If a future migration is required, prefer a separate PR with dry-run notes and operator approval.

## 7. Start the API

From the repository root:

```bash
pnpm --filter @lms/api dev
```

Expected API base URL:

```text
http://localhost:3000/api/v1
```

## 8. Start the web app

From the repository root, in a second terminal:

```bash
pnpm --filter @lms/web dev
```

Expected web URL:

```text
http://localhost:5173
```

In local development, the web app sends API requests to the relative `/api` path. Vite proxies these requests to the local API at `http://localhost:3000`.

## 9. Demo environment

Current Railway web URL:

```text
https://web-production-b1f01.up.railway.app
```

Routes:

- Login: `https://web-production-b1f01.up.railway.app/login`
- Admin: `https://web-production-b1f01.up.railway.app/admin`
- Learner: `https://web-production-b1f01.up.railway.app/learn`
- Learner courses: `https://web-production-b1f01.up.railway.app/learn/courses`
- Learner certificates: `https://web-production-b1f01.up.railway.app/learn/certificates`

Demo users:

| Role | Organization | Email | Password |
|---|---|---|---|
| Admin | `demo-company` | `admin@demo.com` | `Demo1234!` |
| Learner | `demo-company` | `learner@demo.com` | `Demo1234!` |

If login fails, verify the demo seed has run on the target Railway API service.

## 10. Local cookie auth behavior

Local MVP auth is cookie-first:

- `POST /api/v1/auth/login` sets `lms_access_token` and `lms_csrf_token`.
- In `NODE_ENV=development`, auth cookies are not marked `Secure`, so they work over local HTTP.
- In `NODE_ENV=production`, auth cookies are marked `Secure`.
- `lms_access_token` is `httpOnly` and scoped to `/api/v1`.
- `lms_csrf_token` is readable by the web app and scoped to `/`, so frontend code can attach the `x-csrf-token` header for unsafe requests.
- Unsafe cookie-auth requests such as `POST`, `PUT`, `PATCH`, and `DELETE` must send `x-csrf-token` matching the `lms_csrf_token` cookie.

Quick browser verification:

1. Open `http://localhost:5173/login`.
2. Log in with a local/demo account.
3. Confirm `GET /api/v1/auth/me` succeeds.
4. Trigger a cookie-auth unsafe request, for example logout.
5. Confirm the request includes `x-csrf-token` and succeeds.
6. Confirm removing or changing the CSRF header causes a `403`.

## 11. Health check

Check the API health endpoint:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response includes:

```json
{
  "status": "ok"
}
```

## 12. Local verification checklist

Before using the local MVP:

- Dependencies installed with `pnpm install`.
- `.env` exists and uses local-only values.
- PostgreSQL is reachable on port `5432`.
- MinIO is reachable on port `9000`.
- Prisma Client generated.
- API starts without env validation errors.
- Web app starts.
- `GET /api/v1/health` returns OK.
- Login sets auth and CSRF cookies in local HTTP dev.
- `GET /api/v1/auth/me` works after login.
- Unsafe cookie-auth request with matching CSRF succeeds.

## 13. Troubleshooting

### API fails with invalid environment

Check:

- `API_PORT` is a valid port number.
- `JWT_SECRET` is present and at least 32 characters.
- `.env` is loaded in the shell running the API.

### Prisma cannot connect

Check:

- PostgreSQL container is running.
- `DATABASE_URL` matches the local PostgreSQL credentials.
- Port `5432` is not occupied by another PostgreSQL instance.

### MinIO is unreachable

Check:

- MinIO container is running.
- `S3_ENDPOINT` is `http://localhost:9000`.
- Access key and secret match the local MinIO values.

### Web cannot reach API

Check:

- API is running on `API_PORT`.
- `FRONTEND_URL` matches the local web URL.
- Browser devtools network tab shows `/api/v1/...` requests from the web app, proxied by Vite to `http://localhost:3000`.

### Login works but `/auth/me` returns 401 locally

Check:

- The browser received `lms_access_token` after login.
- `NODE_ENV` is not set to `production` for local HTTP development.
- The API and web app are both reached through `localhost`, not mixed hosts such as `127.0.0.1` and `localhost`.

### Unsafe request returns 403

Check:

- The browser received `lms_csrf_token` after login.
- The frontend request includes `x-csrf-token`.
- The header value matches the `lms_csrf_token` cookie.

## 14. Explicit non-goals

This runbook does not:

- change CI/CD;
- add deploy scripts;
- apply real migrations;
- create production infrastructure;
- add new dependencies;
- define seed data.

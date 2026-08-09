# Railway Deploy Guide

> **Статус:** `CURRENT`
>
> **Назначение:** описать current repository deployment model для Railway без исторических public-API assumptions.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## 1. Текущая topology

### Web

**Статус:** `IMPLEMENTED` для repository config, `LIVE-VERIFY` для фактического deployment.

- Web service является публичной точкой входа.
- Nginx проксирует `/api/` во внутренний Railway API service.
- Current nginx upstream: `api.railway.internal:3000`.

### API

**Статус:** `IMPLEMENTED`

- API service должен оставаться private внутри Railway private network.
- Public Networking для API не является current repository recommendation.
- Historical direct public API URLs и manual public port fixes считаются `HISTORICAL` и не должны использоваться как current runbook.

**Правило для ИИ-агента:** `MUST NOT` включать Public Networking для API без отдельной owner/ops задачи.

---

## 2. Порты

Railway предоставляет runtime `PORT`. Current API env loader использует его как `API_PORT`, если `API_PORT` явно не задан.

### Railway

Не требуется вручную задавать:

```text
API_PORT=3000
```

только ради Railway routing.

### Internal API port

Repository/nginx contract использует API port `3000` внутри private network. Это не означает, что нужно создавать public API port 3000.

---

## 3. API startup

Current `apps/api/railway.json` запускает:

```text
prisma migrate deploy
```

перед запуском API process.

Следовательно deployment flow включает automatic migration application на startup.

**Важно:** это не означает автоматический rollback database schema при rollback application image. Migration rollback требует отдельного migration/data plan.

---

## 4. Health checks

Canonical endpoints:

```text
/api/v1/health/live
/api/v1/health/ready
```

Railway API healthcheck использует:

```text
/api/v1/health/ready
```

### Semantics

- `/health/live` — process liveness, без dependency checks.
- `/health/ready` — readiness DB + configured Redis + configured storage.
- `/health` — compatibility readiness alias.

**Правило:** `200 ready` не является доказательством полной production compliance, если optional dependency возвращает `disabled`.

---

## 5. Required production configuration

Canonical inventory — `.env.production.example` + current env validation.

### Core

Требуются current production values для:

- `DATABASE_URL`;
- `FRONTEND_URL`;
- `JWT_SECRET`;
- `NODE_ENV=production`;
- `TRUST_PROXY`.

### Redis

Preferred production mode — configured Redis.

Если Redis отсутствует, production startup допускается только через explicit emergency flag:

```text
ALLOW_IN_MEMORY_RATE_LIMIT=true
```

Это degraded per-process rate limiting, а не эквивалент distributed Redis protection.

### Storage

Storage configuration — S3-compatible и provider-neutral.

Не считать обязательным конкретный provider. Current production example допускает/рекомендует S3-compatible providers such as Cloudflare R2 or AWS S3; self-hosted MinIO остаётся compatible option.

`S3_FILE_ORIGIN` optional.

---

## 6. Demo seed

Не использовать historical command:

```text
node dist/scripts/seed.js
```

Current repository предоставляет guarded admin demo-seed workflow через package scripts/documentation.

Перед любым apply использовать `docs/ADMIN_DEMO_SEED.md` как current source и соблюдать его dry-run/apply guards.

**Правило:** production seed никогда не запускать только потому, что старый deploy guide его предлагал.

---

## 7. Storage/network validation after deploy

Repository config может подтвердить intended architecture, но actual deployment имеет статус `LIVE-VERIFY`.

После deployment проверять fresh evidence для:

- Web public availability;
- `/api/` proxy через Web;
- API internal readiness;
- Redis availability;
- storage provider/bucket/CORS;
- malware scanner availability;
- Sentry/alerting;
- current domains.

Не использовать старые Railway URLs как бессрочное evidence.

---

## 8. Rollback

### Application rollback

Railway/application rollback может вернуть предыдущую application revision/image.

### Database rollback

Database schema/data rollback — отдельная задача.

`prisma migrate deploy` применяет forward migrations; repository не гарантирует автоматический reverse migration.

Перед risky migration нужно иметь:

- compatibility plan;
- backup/restore plan;
- explicit rollback/forward-fix strategy.

См. `docs/MIGRATION_BACKUP_POLICY.md`.

---

## 9. Staging

**Current documented state:** `NO-SEPARATE-RAILWAY-STAGING`.

Repository policy сейчас не определяет отдельный Railway staging environment.

GitHub Actions environment/workflow с названием `staging` не является доказательством отдельного Railway staging deployment.

Создание отдельного staging — `OWNER-DECISION` / ops task.

---

## 10. Что считается historical

Следующие инструкции больше не current guidance:

- direct public API URL как normal topology;
- включение Railway Public Networking для API;
- ручной Public Networking port `3000` для API;
- обязательный Railway `API_PORT=3000`;
- безусловное утверждение `production storage = MinIO`;
- `node dist/scripts/seed.js`;
- rollback application image как достаточный DB rollback.

---

## 11. Правила для ИИ-агента

1. `MUST` использовать private API topology как current repository model.
2. `MUST NOT` включать API Public Networking без отдельной задачи.
3. `MUST` учитывать Railway `PORT -> API_PORT` mapping.
4. `MUST` считать `prisma migrate deploy` частью current API startup.
5. `MUST` использовать `/api/v1/health/ready` как deploy readiness probe.
6. `MUST NOT` выбирать S3 provider без live evidence/owner decision.
7. `MUST NOT` запускать historical seed command.
8. Любое actual Railway/provider state = `LIVE-VERIFY`.

## Связанные документы

- `infra/railway/README.md`
- `docs/DEPLOY_FOUNDATION.md`
- `docs/MIGRATION_BACKUP_POLICY.md`
- `docs/STORAGE_UPLOAD_STATUS.md`
- `docs/READINESS_AND_SECURITY_GATES.md`

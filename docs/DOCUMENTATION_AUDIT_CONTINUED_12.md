# Продолжение аудита актуальности документации — часть 12

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_11.md` содержат результаты №21–31. Этот файл продолжает последовательный аудит с №32.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 32 | `RAILWAY_DEPLOY_GUIDE.md` | ⚠️ Частично актуален / operational drift | Docker/Railway mechanics в основном верны, но staging terminology, API port/network policy, MinIO assumption, seed command и readiness/env reference отстали от current config |

---

## 32. `RAILWAY_DEPLOY_GUIDE.md`

**Статус:** ⚠️ частично актуален. Core deployment mechanics остаются полезными, но guide больше нельзя использовать как точную current Railway runbook без reconciliation с `apps/*/railway.json`, `.env.production.example`, `infra/railway/README.md` и migration/backup policy.

### Проверено

- `docs/RAILWAY_DEPLOY_GUIDE.md`;
- `apps/api/railway.json`;
- `apps/web/railway.json`;
- `apps/api/Dockerfile`, `apps/web/Dockerfile`;
- `infra/nginx/nginx.conf`;
- `infra/railway/README.md`;
- `.env.production.example`;
- `apps/api/src/config/env.ts`;
- `apps/api/src/modules/health/health.controller.ts`;
- `apps/api/src/modules/upload/upload.service.ts`;
- `apps/api/package.json` и `apps/api/src/scripts/`;
- `MIGRATION_BACKUP_POLICY.md`;
- historical `STAGING_SMOKE_REPORT.md`;
- current `main` после PR #527.

### Подтверждённые факты

- Railway build config действительно использует repository root и Dockerfiles `apps/api/Dockerfile` / `apps/web/Dockerfile`.
- API Railway start command выполняет `prisma migrate deploy` перед `node dist/main.js`.
- Current API Railway healthcheck — `/api/v1/health/ready`, timeout 300s; Web Railway healthcheck — `/`, timeout 60s.
- Web Docker image обслуживает React SPA через nginx; `infra/nginx/nginx.conf` проксирует `/api/` через `${API_UPSTREAM_URL}`. Docker default — `http://api.railway.internal:3000`.
- Current network design в nginx/infra docs предполагает, что public browser traffic входит через Web nginx, а API доступен Web service по Railway private networking.
- API env loader поддерживает Railway `PORT`: если `API_PORT` не задан, `PORT` автоматически мапится в `API_PORT`.
- Production API env требует `TRUST_PROXY`; Redis обязателен в production, если явно не включён emergency `ALLOW_IN_MEMORY_RATE_LIMIT=true`.
- Storage code S3-compatible и отключается, если полный набор S3 variables не задан; readiness тогда возвращает `storage: disabled`. При полной config readiness делает `HeadBucket`.
- Historical June `STAGING_SMOKE_REPORT.md` подтверждает, что Web/API/Postgres на Railway когда-то были подняты и smoke выполнялся, но это не свежий live evidence.

### Несоответствия и риски

1. **Title/purpose говорит “deploying ... to Railway staging”, но current environment policy этому противоречит.** `MIGRATION_BACKUP_POLICY.md` прямо утверждает, что отдельного staging environment нет и есть единственный Railway production environment. Historical `STAGING_SMOKE_REPORT.md` использует staging terminology для June bring-up, поэтому документы смешивают “staging smoke label” и фактическую current environment topology.

2. **Architecture/API networking section расходится с current perimeter policy.** Guide показывает API как `internal :3000`, что верно для target architecture, но troubleshooting/reference всё ещё обсуждает Railway API Public Networking port и historical direct public API behavior. Current `infra/railway/README.md` явно говорит: `Do not enable Public Networking on the API service`; весь public `/api/` traffic должен идти через Web nginx/private network.

3. **`API_PORT` reference устарел.** Guide помечает `API_PORT` required и требует вручную совпадения с Railway Public Networking port `3000`. Current `.env.production.example` прямо говорит `do NOT set API_PORT manually on Railway`; Railway injects `PORT`, а `loadApiEnv()` мапит `PORT → API_PORT`. Это важный operational conflict, способный вернуть старую port-mismatch ошибку.

4. **Health verification example слишком узкий.** Guide ожидает `GET .../api/v1/health → {"status":"ok"}`. Current `/health` является readiness alias и возвращает как минимум `status`, `db`, `redis`, `storage`; при configured dependency failure — 503. Для deploy check нужно использовать canonical `/api/v1/health/ready`, который уже указан в `apps/api/railway.json`, а `/health/live` — только для liveness.

5. **Redis отсутствует из environment reference.** Current production env contract требует `REDIS_URL` либо explicit emergency `ALLOW_IN_MEMORY_RATE_LIMIT=true`, плюс поддерживает `RATE_LIMIT_NAMESPACE`. Guide API env table этого не отражает. Production setup по guide без Redis/fallback может fail-fast на API startup.

6. **`TRUST_PROXY` отсутствует/описан как optional, хотя current production env validation требует его наличия.** `.env.production.example` задаёт ограниченный `TRUST_PROXY=loopback,linklocal,uniquelocal`; current private-nginx perimeter зависит от корректного forwarded-IP trust для rate limiting.

7. **File storage section безусловно фиксирует “MinIO on Railway” как production decision, но current production template рекомендует Cloudflare R2 или AWS S3.** Код подтверждает только S3-compatible abstraction. `infra/railway/README.md` описывает три services — Web/API/PostgreSQL — и не объявляет MinIO current mandatory service. Конкретный live provider нельзя считать current repository fact без Railway evidence.

8. **MinIO-specific public-domain instruction не является универсальным storage contract.** Public MinIO endpoint действительно может требоваться для browser direct presigned uploads при self-hosted MinIO, но current config также поддерживает `S3_FILE_ORIGIN`, R2/AWS S3, quarantine/multipart flows. Guide должен отделять self-hosted MinIO recipe от provider-neutral production requirements.

9. **Seed command устарел и фактически отсутствует.** Guide предлагает `railway run --service api node dist/scripts/seed.js`, но `apps/api/src/scripts/` не содержит `seed.ts`; current package scripts используют `prisma:seed` (`node prisma/seed.mjs`) и guarded `admin:demo-seed` (`node dist/scripts/admin-demo-seed.js`). Команда из guide не соответствует current build output.

10. **Совет “If credentials fail, re-run the demo seed” недостаточно безопасен для current seed policy.** Проект уже имеет отдельный guarded admin demo-seed flow с dry-run/apply/environment/database confirmations. Railway runbook должен ссылаться на `ADMIN_DEMO_SEED.md` и guarded command, а не советовать безусловный повтор произвольного seed script.

11. **Expected seed output устарел/неполон.** Current demo dataset содержит также manager и instructor, а canonical seed shape менялся. Hard-coded expected output в deploy guide быстро дрейфует; лучше ссылаться на `ADMIN_DEMO_SEED.md`/current seed contract.

12. **“On every push to main Railway auto-deploys both services” является external configuration claim.** Repository содержит Railway config files, но GitHub alone не подтверждает, что live Railway services сейчас подключены к auto-deploy каждому push, не paused и отслеживают именно `main`. Это должно иметь live environment verification/date.

13. **Rollback section описывает только application redeploy и недостаточен для migrations.** Redeploy previous image не откатывает уже применённую database migration/data impact. Current `MIGRATION_BACKUP_POLICY.md` требует отдельно выбирать forward-fix/restore strategy и проверять backup для destructive/risky migration.

14. **Guide не отражает current observability/security env.** `.env.production.example` дополнительно содержит `SENTRY_DSN`, `LOG_LEVEL`, storage cleanup/presign controls и malware scanner settings. Не все обязаны быть в minimal deploy path, но env reference должен либо называться intentionally minimal, либо ссылаться на canonical production template как полный source.

15. **Historical direct API URL и current private-only API policy конфликтуют.** `STAGING_SMOKE_REPORT.md` фиксирует public API URL и ручную настройку public port 3000 в June. Current `infra/railway/README.md` теперь запрещает Public Networking на API. Guide должен явно маркировать June direct-public troubleshooting как historical/superseded, а не смешивать его с current setup.

16. **Current demo URL и credentials являются live/operational assertions.** Repository может хранить их, но их доступность на 2026-08-08 не проверена в этом audit. Stable deploy guide не должен считать конкретный Railway URL бессрочно действующим без `Verified at`.

### Что изменить

1. Определить environment terminology: если отдельного staging Railway environment действительно нет, переименовать guide в production/first-deploy runbook и historical staging smoke оставить отдельным snapshot; если staging существует — обновить `MIGRATION_BACKUP_POLICY.md` с authoritative topology.
2. Сделать `infra/railway/README.md` + `apps/*/railway.json` canonical deployment config и синхронизировать guide с private-only API perimeter.
3. Удалить requirement вручную задавать `API_PORT`/public API port. Документировать Railway `PORT → API_PORT` mapping и не включать Public Networking для API при current architecture.
4. Health verification: `/health/live` для process, `/health/ready` для deploy/readiness; описать `db/redis/storage` response fields и 503 semantics.
5. Добавить current production requirements `TRUST_PROXY`, `REDIS_URL`/emergency fallback, `RATE_LIMIT_NAMESPACE`; полный env inventory лучше не дублировать, а ссылаться на `.env.production.example`.
6. Переписать storage как provider-neutral S3-compatible contract; вынести MinIO-on-Railway в отдельный optional self-hosted recipe. Current live provider указывать только с timestamp/evidence.
7. Заменить несуществующий `dist/scripts/seed.js` на canonical guarded demo-seed procedure из `ADMIN_DEMO_SEED.md`; не советовать production-like reseed без guard confirmations.
8. Убрать hard-coded seed expected output из deploy guide либо явно привязать его к конкретному seed version/SHA.
9. Разделить repository-config fact и live Railway fact: auto-deploy, service topology, URLs, MinIO/Redis presence должны иметь `Verified at` и provider evidence.
10. Rollback section связать с `MIGRATION_BACKUP_POLICY.md`: application redeploy не считается DB rollback.
11. Historical port/public-API troubleshooting пометить superseded после private-nginx perimeter change.
12. Добавить freshness header `Verified against main SHA` и authoritative links на `.env.production.example`, `infra/railway/README.md`, `MIGRATION_BACKUP_POLICY.md`, `ADMIN_DEMO_SEED.md`.

### [НЕ ПРОВЕРЕНО]

- Live Railway service topology на 2026-08-08: Web/API/Postgres/Redis/MinIO/provider state.
- Включён ли Railway auto-deploy от каждого push `main`, не paused ли services и какие branch/environment bindings используются.
- Текущий public Web URL и работоспособность перечисленных demo credentials — external smoke не выполнялся.
- Фактический production S3 provider и bucket/public-origin configuration.
- Backup/restore readiness и возможность rollback destructive migration.
- Railway CLI commands не исполнялись в audit: проверена только их согласованность с repository scripts/config, где это возможно.

### Итог

`RAILWAY_DEPLOY_GUIDE.md` сохраняет правильный skeleton deployment flow, но operational details разошлись с current config. Самые опасные расхождения — устаревший `API_PORT`/public-API setup, отсутствие current Redis/TRUST_PROXY requirements, несуществующий seed command, безусловный MinIO production assumption и application-only rollback после automatic migrations. Guide нужно синхронизировать с current private-nginx perimeter и сделать provider/live-state claims SHA/date/evidence-bound.

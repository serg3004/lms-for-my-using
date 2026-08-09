# Продолжение аудита актуальности документации — часть 3

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. `docs/DOCUMENTATION_AUDIT_CONTINUED.md` содержит №21. `docs/DOCUMENTATION_AUDIT_CONTINUED_2.md` содержит №22. Этот файл продолжает тот же последовательный аудит с №23.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 23 | `MVP_LOCAL_RUNBOOK.md` | ⚠️ Частично актуален | API/Web commands и proxy верны, но fresh local flow не поднимает рабочую среду полностью: committed compose уже существует, migrations/seed не выполняются, Redis/bucket bootstrap отсутствуют, auth section отстал от refresh flow |

---

## 23. `MVP_LOCAL_RUNBOOK.md`

**Статус:** ⚠️ частично актуален. Основные команды запуска API/Web, Vite proxy, local ports и disposable DB integration test соответствуют текущему репозиторию, но runbook больше не является надёжным end-to-end bootstrap для чистой developer machine без дополнительных недокументированных действий.

### Проверено

- `docs/MVP_LOCAL_RUNBOOK.md`;
- root `.env.example`;
- root и API `package.json` scripts;
- `apps/api/src/config/env.ts`;
- `apps/web/vite.config.ts`;
- `infra/docker/docker-compose.yml` и `docker-compose.test.yml` inventory;
- `scripts/test-api-database.sh`;
- `HealthController`, `RedisHealthService`, `UploadService.checkReadiness()`;
- current auth cookie/CSRF helpers;
- current `main` after PR #520; PR #520 меняет course/progress schema/logic и не изменяет local-runbook infrastructure/auth/bootstrap findings.

### Подтверждённые факты

- `packageManager` в root `package.json` — `pnpm@9.15.0`; runbook указывает ту же версию.
- `pnpm --filter @lms/api dev` и `pnpm --filter @lms/web dev` существуют как package scripts.
- API default port — `3000`, Web/Vite default URL — `http://localhost:5173`, а `apps/web/vite.config.ts` проксирует `/api` на `http://localhost:3000`.
- API глобальный prefix — `/api/v1`; local API base URL в runbook корректен.
- `apps/api/src/config/env.ts` действительно валидирует `DATABASE_URL`, `JWT_SECRET >= 32`, `API_PORT`, `FRONTEND_URL`; Redis optional вне production.
- Root `.env.example` содержит PostgreSQL `localhost:5432/lms`, Redis `redis://localhost:6379`, JWT secret, MinIO/S3 endpoint `localhost:9000`, bucket `lms-local` и credentials `minio/minio123`.
- В репозитории **уже существует committed local compose** `infra/docker/docker-compose.yml`: PostgreSQL 16 Alpine + MinIO с портами 5432, 9000 и 9001 и persistent volumes.
- `pnpm test:integration:db:local` существует и запускает `scripts/test-api-database.sh`; script использует `infra/docker/docker-compose.test.yml`, создаёт disposable PostgreSQL `lms_test` на `127.0.0.1:55432` по умолчанию, выполняет `prisma:migrate:deploy`, запускает API DB integration tests и всегда выполняет cleanup container/volume через traps.
- `/api/v1/health` является readiness alias: кроме `SELECT 1` он проверяет Redis и storage. Redis readiness делает connect/ping при заданном `REDIS_URL`; storage readiness выполняет `HeadBucket` при полной S3 configuration.
- Current auth cookies включают `lms_access_token`, `lms_csrf_token` и optional `lms_refresh_token`; refresh cookie имеет path `/api/v1/auth/refresh`.
- Access cookie и CSRF cookie используют `SameSite=lax`; `Secure` включается только при `NODE_ENV=production`, поэтому local HTTP действительно поддерживается.
- CSRF проверяется для unsafe requests **только когда access credential пришёл из access cookie**; bearer-auth requests CSRF не требуют.

### Несоответствия и риски

1. **Раздел Local PostgreSQL and MinIO устарел: committed compose уже есть.** Runbook говорит `The repository does not require a committed Docker Compose file for this runbook` и предлагает создать `docker-compose.local.yml` вручную, хотя current repository содержит `infra/docker/docker-compose.yml` именно с PostgreSQL и MinIO. Это дублирует infrastructure source of truth и создаёт риск расхождения image versions, healthchecks, container names и volumes.

2. **Fresh local bootstrap не применяет schema migrations.** Последовательность runbook: install → `.env` → PostgreSQL/MinIO → `prisma:generate` → API dev. `prisma:generate` создаёт только client code и не создаёт database tables. Отдельная section `Safe migration flow` говорит о review, но не даёт обязательной команды для initial local database. На чистом PostgreSQL API может стартовать, но application queries/login не смогут работать без применённой migration history.

3. **Fresh local bootstrap не выполняет seed, хотя browser verification требует local/demo account.** В API scripts существуют `prisma:migrate:deploy`, `prisma:migrate` и `prisma:seed`, но основной local flow не объясняет, когда и как безопасно применить committed migrations и создать local demo data. Step `Log in with a local/demo account` поэтому не является воспроизводимым на чистой машине из runbook alone.

4. **`.env.example` включает Redis, но local compose Redis не запускает.** Буквальный `cp .env.example .env` задаёт `REDIS_URL=redis://localhost:6379`. Ни пример compose внутри runbook, ни committed `infra/docker/docker-compose.yml` не содержат Redis service. При этом `/health` вызывает Redis readiness и при недоступном configured Redis возвращает readiness failure/503. Чтобы checklist `GET /api/v1/health returns OK` был воспроизводим, runbook должен либо поднимать Redis, либо явно удалять/не задавать `REDIS_URL` для local mode и ожидать `redis: disabled`.

5. **MinIO bucket bootstrap отсутствует.** `.env.example` задаёт `S3_BUCKET=lms-local`, а `UploadService.checkReadiness()` делает `HeadBucket`. Committed MinIO compose запускает server, но не создаёт bucket `lms-local`; runbook scratch compose тоже не содержит bucket-init service/command. Поэтому fresh MinIO process сам по себе ещё не гарантирует зелёный `/health` storage check.

6. **Health section недооценивает readiness semantics.** Runbook показывает `curl /api/v1/health` и ожидаемый минимум `{ "status": "ok" }`, но endpoint является readiness alias и зависит от DB + configured Redis + configured storage. Для диагностики лучше отдельно документировать `/health/live` и `/health/ready`, а не использовать один `/health` как простой process-alive check.

7. **Cookie auth section устарел после refresh/session hardening.** Login flow теперь может устанавливать `lms_refresh_token` вместе с access/CSRF cookies. Runbook перечисляет только access + CSRF и не описывает refresh cookie path/lifetime/HttpOnly semantics.

8. **Blanket CSRF statement имеет исключение.** Формулировка `Unsafe cookie-auth requests such as POST, PUT, PATCH, DELETE must send x-csrf-token` слишком широкая для current auth design: refresh flow использует отдельный HttpOnly refresh cookie на `/api/v1/auth/refresh` и не следует access-cookie CSRF branch. Следует описать правило как CSRF protection для unsafe requests, authenticated **через access cookie**, и отдельно задокументировать refresh endpoint semantics.

9. **Demo environment section смешивает local runbook и live Railway information.** Документ о local bootstrap содержит конкретный `web-production-...railway.app` URL и demo credentials. Это operational/live information, которое может устареть независимо от local setup. Его лучше вынести/сослаться на отдельный current environment/smoke status document и снабдить `Verified at`/SHA/date.

10. **Раздел numbering содержит два `## 14`.** `Troubleshooting` и `Explicit non-goals` имеют одинаковый номер. Это не runtime defect, но ухудшает ссылочность runbook.

11. **Root `.env` loading path требует явной проверки/формулировки.** API `loadLocalEnvFiles()` ищет `.env` и `.env.local` относительно `process.cwd()`. Runbook создаёт `.env` в repository root, а API запускается через filtered package script. В рамках GitHub-only аудита фактический runtime `cwd` этого script не воспроизводился, поэтому нельзя гарантировать, что root `.env` всегда является тем файлом, который загрузит API. Это нужно либо подтвердить автоматизированным test/run, либо документировать поддерживаемый env location однозначно.

### Что изменить

1. Использовать committed `infra/docker/docker-compose.yml` как canonical local PostgreSQL/MinIO bootstrap вместо ручного scratch compose; если scratch compose всё же нужен, объяснить, почему он отличается.
2. Добавить явный **fresh database bootstrap** после запуска PostgreSQL: для существующей committed history предпочтительно `pnpm --filter @lms/api prisma:migrate:deploy` либо другое явно выбранное repository rule; `migrate dev` оставить для создания новых migrations в development.
3. Добавить безопасный local seed step (`prisma:seed` или guarded demo seed, в зависимости от выбранного canonical contract) и явно отделить local-only data от Railway demo data.
4. Синхронизировать Redis strategy: либо добавить Redis service в canonical local compose, либо убрать `REDIS_URL` из default local bootstrap/объяснить optional mode. Health expected response должен соответствовать выбранному варианту (`ok` или `disabled`).
5. Добавить deterministic MinIO bucket creation (`lms-local`) перед readiness check либо не конфигурировать S3 в minimal local mode. Bucket-init должен быть идемпотентным.
6. Разделить health checks: `/api/v1/health/live` для process liveness, `/api/v1/health/ready` для DB/Redis/storage readiness; `/health` описать как compatibility alias readiness.
7. Обновить auth section: access + CSRF + refresh cookie, refresh path, HttpOnly/SameSite/Secure behavior и различие access-cookie CSRF vs refresh flow.
8. Вынести Railway demo URL/credentials в environment-specific status/runbook или добавить `Verified at` и authoritative source; local runbook не должен зависеть от live URL.
9. Исправить duplicate section number `14`.
10. Проверить и задокументировать canonical `.env` location для `pnpm --filter @lms/api dev`; желательно добавить простой automated env-loading test/command, если root location является supported contract.
11. Добавить короткий clean-machine acceptance sequence: infrastructure up → bucket/Redis ready → migrations → seed → API/Web → liveness/readiness → login → `/auth/me` → one unsafe CSRF-protected request.

### [НЕ ПРОВЕРЕНО]

- Команды local bootstrap фактически не запускались на чистой developer machine в рамках этого GitHub-only аудита; вывод основан на current scripts/config/code paths.
- Runtime `process.cwd()` при `pnpm --filter @lms/api dev` и, следовательно, фактическая загрузка root `.env` не воспроизводились.
- Live Railway demo URL и demo credentials на 2026-08-08 не проверялись внешним HTTP smoke; repository только хранит их в документе/seed context.
- Не проверялось наличие уже созданного локального MinIO bucket/локального Redis у конкретного разработчика; вывод относится к fresh bootstrap из repository instructions.
- Не выполнялось destructive reset/cleanup локальных persistent volumes; audit не менял local/production data.

### Итог

Runbook содержит правильные базовые команды и полезный disposable DB integration test, но перестал быть самодостаточным clean-machine bootstrap. Наиболее критичный drift — инфраструктурный: committed local compose уже существует, fresh DB schema/seed steps отсутствуют, `.env.example` включает Redis без Redis service, MinIO bucket не создаётся, а `/health` проверяет оба configured dependency. Auth section также отстал от refresh-cookie design. После синхронизации этих шагов документ снова сможет служить воспроизводимым локальным runbook, а не набором частично совместимых инструкций.

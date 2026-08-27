# PR 265 — Live Production Infrastructure Verification

**Дата проверки:** 2026-08-25
**Environment:** Railway project `reasonable-reprieve` (workspace "Сергей Афанасков's Projects"), environment `production`
**Метод:** read-only запросы к Railway API (project/service/deployment metadata, variable **names** only — значения secrets не читались и не публиковались), плюс сверка со стартовыми командами в `apps/api/Dockerfile` репозитория на момент проверки (commit `d1570ab`, тот же commit что задеплоен в prod).
**Ограничение окружения:** прямой HTTP(S) доступ к `*.up.railway.app` из этой сессии заблокирован сетевой политикой прокси (`connect_rejected`, gateway 403 на CONNECT) — публичные `/health/*` эндпоинты живым запросом не опрошены; вывод по миграциям и readiness сделан по косвенным доказательствам (Railway deployment status + startup command), а не по прямому HTTP-ответу.

Продакшен-проект идентифицирован по совпадению домена `web` (`web-production-b1f01.up.railway.app`) с URL, задокументированным в `CLAUDE.md` как «Живой сайт». Второй Railway-проект аккаунта (`carefree-essence`) с сервисами `lms-project`/`Redis`/`Postgres` — не совпадает по доменам/составу сервисов с задокументированным prod и в этой проверке не рассматривается как production LMS; при необходимости требует отдельного owner-подтверждения, что это и есть (legacy/неиспользуемый ресурс).

---

## 1. Railway service topology и resource settings — ПОДТВЕРЖДЕНО

Проект `reasonable-reprieve`, environment `production`, регион `us-west2`, 5 сервисов:

| Сервис | Источник | Replicas | Последний deploy | Статус |
|---|---|---|---|---|
| `web` | Dockerfile (`apps/web/Dockerfile`) | 1 | 2026-08-25 16:42 UTC | SUCCESS |
| `api` | Dockerfile (`apps/api/Dockerfile`) | 1 | 2026-08-25 16:42 UTC | SUCCESS |
| `malware-scanner` | Dockerfile (`services/malware-scanner/Dockerfile`) | 1 | 2026-08-25 16:42 UTC | SUCCESS |
| `minio` | image `minio/minio` | 1 | 2026-08-04 09:44 UTC | SUCCESS |
| `Postgres` | image `ghcr.io/railwayapp-templates/postgres-ssl:18.6` | 1 | 2026-08-21 15:16 UTC | SUCCESS |

Все сервисы — single replica, single region. HA-конверсия для Postgres (`haTemplateCode: postgres-ha`) доступна как опция, но **не активирована** (обычный single-instance Postgres, не Patroni/etcd кластер).

`api`/`web`/`malware-scanner` задеплоены с текущего `main` (commit `d1570ab`, merge PR #695) — прод синхронизирован с последним смердженным кодом на момент проверки.

---

## 2. Redis — ПОДТВЕРЖДЕНО ОТСУТСТВИЕ ⚠️ (finding, не просто unknown)

- В production Railway-проекте `reasonable-reprieve` **нет сервиса Redis**.
- В переменных окружения сервиса `api` **нет `REDIS_URL`** (полный список имён переменных: `ALLOW_IN_MEMORY_RATE_LIMIT`, `API_PORT`, `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `MALWARE_SCANNER_CALLBACK_SECRET`, `MALWARE_SCANNER_URL`, `METRICS_BEARER_TOKEN`, `NODE_ENV`, `S3_ACCESS_KEY_ID`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_REGION`, `S3_SECRET_ACCESS_KEY`, `TRUST_PROXY`).
- Наличие переменной `ALLOW_IN_MEMORY_RATE_LIMIT` соответствует документированному emergency-flag (`docs/RAILWAY_DEPLOY_GUIDE.md`): «Если Redis отсутствует, production startup допускается только через explicit emergency flag» — то есть прод **сейчас работает в degraded-режиме** rate limiting (per-process in-memory, не distributed), а не в предпочтительном Redis-режиме.
- Код (`apps/api/src/modules/health/redis-health.service.ts`) подтверждает: без `REDIS_URL` health check возвращает `'disabled'`, а не `'ok'`.

**Вывод:** Redis не подключён к продакшену. Это соответствует TV-032 (`docs/TODO_VERIFY.md`) — теперь подтверждено фактическим состоянием, а не «требует проверки».

---

## 3. Storage provider / bucket configuration — ЧАСТИЧНО ПОДТВЕРЖДЕНО

- Production storage — **самостоятельно хостящийся MinIO** (image `minio/minio`) внутри того же Railway-проекта, а не внешний AWS S3 или Cloudflare R2. Один volume (`/data`), одна реплика.
- `api` и `malware-scanner` сконфигурированы через `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION`/`S3_FORCE_PATH_STYLE` (сами значения не читались).
- **CORS/lifecycle настройки bucket не проверены** — для этого нужен вызов MinIO admin API/console с credentials, что выходит за рамки read-only проверки без чтения secrets. Остаётся `[НЕ ПРОВЕРЕНО]`.

**Вывод по TV-008:** provider теперь известен фактически — self-hosted MinIO (не MinIO-как-заглушка для будущего S3, а именно production-хранилище). CORS/lifecycle — остаётся `LIVE-VERIFY`.

---

## 4. Queue / DLQ topology — ПОДТВЕРЖДЕНО ОТКЛЮЧЕНО ⚠️ (finding)

- `apps/api/src/modules/background-jobs/background-jobs.module.ts` выбирает backend по наличию `REDIS_URL`: без него используется `DisabledBackgroundJobBackend`.
- В переменных `api` нет ни `REDIS_URL`, ни `BACKGROUND_JOBS_RUN_WORKER`.
- `DisabledBackgroundJobBackend.enqueue()` бросает `ServiceUnavailableException`; `getOperationalStatus()` всегда возвращает `{status: 'disabled', waiting:0, active:0, delayed:0, failed:0, deadLetter:0}` — то есть 0 везде не значит «очередь пуста», значит «очередь выключена».
- `OutboxService.onApplicationBootstrap()` запускает polling/publish-воркер только если `BACKGROUND_JOBS_RUN_WORKER === 'true'` — этой переменной в проде нет, значит **outbox-воркер не стартует**. События пишутся в таблицу `outboxEvent`, но никем не публикуются.

**Вывод:** и BullMQ-очередь, и outbox publish worker сейчас не работают в проде. DLQ как таковая не существует, потому что очередь не запущена. Это операционный риск, а не просто пробел в документации — рекомендую отдельную задачу на включение Redis + `BACKGROUND_JOBS_RUN_WORKER` в production, вне scope PR 265 (verification-only, без production mutations).

---

## 5. Prisma migration state — ПОДТВЕРЖДЕНО (косвенно, но надёжно)

- `apps/api/Dockerfile` (CMD): `prisma migrate deploy && node dist/main.js` — контейнер стартует `node dist/main.js` только если `migrate deploy` завершился с exit 0.
- Healthcheck контейнера: `wget -qO- http://localhost:3000/api/v1/health/ready || exit 1`.
- Последний deployment `api` (id `7174d165…`, commit `d1570ab`, 2026-08-25 16:42–16:44 UTC) имеет статус **SUCCESS** в Railway (не `CRASHED`/`FAILED`), что означает: `migrate deploy` прошёл успешно и `/health/ready` (DB + storage/redis-aware readiness) стал зелёным.

**Вывод:** миграции применены и API готов на момент последнего деплоя (дата зафиксирована). Прямой HTTP-опрос `/health/ready` не выполнен из-за сетевой блокировки прокси текущей сессии — при необходимости точного текущего снимка это стоит перепроверить из окружения с доступом к интернету.

---

## 6. Backup / PITR — НЕ ПОДТВЕРЖДЕНО `[LIVE-VERIFY]`

- Railway MCP `get-service-config` для сервиса `Postgres` не возвращает никаких backup/PITR-полей (только source image, networking, volume mount, HA-опции — не включённые).
- Управление бэкапами Railway Postgres обычно находится в отдельном UI-разделе ("Backups"), не отражённом в доступных read-only MCP-инструментах этой сессии.
- **Вывод:** backup/PITR-статус **не может быть подтверждён** имеющимися инструментами. Остаётся явно помечен как `[НЕ ПРОВЕРЕНО]` — требует владельца аккаунта Railway зайти в UI (Settings → Backups) вручную.

## 7. Restore test — ЯВНО ОТСУТСТВУЕТ / НЕ ПОДТВЕРЖДЕН

- Ни в репозитории (docs, CI configs), ни в доступной Railway-конфигурации нет свидетельств проведённого restore test.
- **Вывод:** помечается как `[НЕ ПРОВЕРЕНО / MISSING]` — фактических доказательств восстановления из бэкапа нет.

---

## Итог по критериям готовности PR 265

| Критерий | Статус |
|---|---|
| production DB migration state зафиксирован с датой | ✅ подтверждено (2026-08-25, deployment `7174d165`) |
| backup/PITR status подтверждён фактическим источником | ❌ не подтверждено — LIVE-VERIFY |
| restore-test status подтверждён либо явно missing | ⚠️ явно отмечено как missing/unverified |
| Redis topology подтверждена | ✅ подтверждено — **отсутствует**, degraded-режим активен |
| storage provider/bucket/configuration подтверждены | ⚠️ provider подтверждён (self-hosted MinIO); CORS/lifecycle — не подтверждены |
| queue/DLQ topology подтверждена | ✅ подтверждено — **отключена**, outbox worker не запущен |
| Railway replica/resource settings зафиксированы | ✅ подтверждено (см. раздел 1) |
| результаты имеют дату и источник доказательства | ✅ (эта таблица + разделы выше) |
| sensitive values не сохранены в документации/CI artifacts | ✅ использовались только имена переменных, не значения |
| verification не изменяет production | ✅ выполнены только read-only запросы |
| оставшиеся unknowns явно остаются `LIVE-VERIFY`/`[НЕ ПРОВЕРЕНО]` | ✅ backup/PITR, restore test, storage CORS/lifecycle |

## Рекомендованные follow-up задачи (вне scope этого PR, без production-изменений в рамках verification)

1. Решить осознанно: включать managed Redis в проде (rate limiting + background jobs/outbox) или официально принять текущий degraded-режим как whitelisted decision.
2. Подтвердить/настроить Railway Postgres backup + PITR через Railway UI и задокументировать факт (не через код).
3. Провести и задокументировать хотя бы один restore test.
4. Прояснить статус второго Railway-проекта (`carefree-essence`) — legacy/неиспользуемый ресурс или относится к LMS.

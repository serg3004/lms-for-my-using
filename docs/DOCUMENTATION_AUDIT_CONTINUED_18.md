# Продолжение аудита актуальности документации — часть 18

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_17.md` содержат результаты №21–37. Этот файл продолжает последовательный аудит с №38.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 38 | `STAGING_SMOKE_REPORT.md` | ⚠️ Корректный historical bring-up report, stale как current environment evidence | Smoke #1/#2 подтверждают June Railway bring-up; current environment topology, private-only API perimeter, PORT mapping, readiness contract и later production smoke делают старые operational instructions superseded |

---

## 38. `STAGING_SMOKE_REPORT.md`

**Статус:** ⚠️ корректный исторический bring-up report от 2026-06-06/07, но полностью stale как current staging/runbook evidence. Документ полезен для incident history, однако его нельзя использовать для current go/no-go, настройки Railway или доказательства существования отдельного staging environment сегодня.

### Проверено

- полный `docs/STAGING_SMOKE_REPORT.md`;
- Git history файла;
- exact Smoke #2 commit `5fa966e249c0fabd683fd2e868f72f9335010a54`;
- current `infra/railway/README.md`;
- current `MIGRATION_BACKUP_POLICY.md` environment model;
- current `RAILWAY_PRODUCTION_SMOKE_STATUS.md`;
- current `.github/workflows/staging-smoke.yml`;
- current `apps/api/railway.json`;
- current `apps/api/src/config/env.ts`;
- current `apps/api/src/modules/health/health.controller.ts`;
- previous audit HEAD CI #1324 / CodeQL #832;
- current `main` at `a9a2badcfd6042697f06b8fb7fad47c47c57ed72`.

### Подтверждённые исторические факты

- `STAGING_SMOKE_REPORT.md` впервые добавлен 2026-06-06 commit `fa00e13e86f9498f7732f00e64f0b96d737f831a`.
- Smoke #2 был записан 2026-06-07 и привязан к `main` SHA `5fa966e249c0fabd683fd2e868f72f9335010a54`.
- GitHub подтверждает, что этот SHA — merge PR #270 (`feat(web): admin mobile hamburger drawer navigation`).
- Smoke #2 history показывает промежуточный failure report (`7999a444...`) с API 502, затем итоговый fix report (`03760b91...`) с root cause: Railway Public Networking port 8080 не совпадал с app port 3000; dashboard port был вручную изменён на 3000.
- Final Smoke #2 зафиксировал Web 200, direct API 200, proxied API health 200 и admin login success.
- Smoke #1 от 2026-06-06 зафиксировал более широкий learner demo path: login, profile, course/lesson navigation, completion/progress, assessments, assignments и certificate empty state.
- Report прямо содержит historical production-style Railway URLs и demo credentials, что подтверждает, что June “staging” фактически выполнялся на services/domain names с `*-production-*` naming.

### Существенный drift относительно current architecture

1. **Current repository policy говорит, что отдельного staging environment нет.** `MIGRATION_BACKUP_POLICY.md` прямо фиксирует single Railway `production` environment и отсутствие staging/dry-run environment. Поэтому title `Staging Smoke Report` сегодня описывает исторический label/phase bring-up, а не current environment class.

2. **Historical direct-public API architecture superseded.** Report считает direct API public URL нормальным и исправляет Railway Public Networking port. Current `infra/railway/README.md` теперь прямо требует `Do not enable Public Networking on the API service`; public `/api/` traffic должен идти только через Web nginx/private network.

3. **Historical `API_PORT=3000`/manual Public Networking port instruction superseded.** Current `loadApiEnv()` мапит Railway-injected `PORT` в `API_PORT`, если `API_PORT` отсутствует. Поэтому current deployment contract не требует держать вручную `API_PORT=3000` и public API port 3000.

4. **Old “future note” теперь опасен как runbook guidance.** Строка, что `API_PORT=3000 must stay in Railway env vars AND Public Networking port must be 3000`, была верной для June incident fix, но сейчас прямо конфликтует с private-only API perimeter и current PORT mapping.

5. **Health contract изменился.** Report проверяет `/api/v1/health` и ожидает `{status:'ok', db:'ok'}`. Current `/health` — readiness alias и response также включает `redis` и `storage`; canonical Railway deploy probe теперь `/api/v1/health/ready`, а `/health/live` используется для liveness.

6. **Environment requirements существенно расширились.** June report перечисляет DATABASE_URL, FRONTEND_URL, JWT_SECRET, NODE_ENV, API_PORT. Current production env также требует `TRUST_PROXY`; Redis требуется, если не включён explicit emergency fallback. Storage/readiness и observability variables также появились позже.

7. **Web port note тоже historical.** Smoke #1 фиксирует `PORT=8000` при nginx listen 80 и вручную настраиваемый public target 80. Current Railway/Docker configuration нужно брать из `apps/web/railway.json`/Dockerfile/current infra docs, а не из June incident notes.

8. **S3/upload risk statement stale.** Smoke #1 говорит `S3/upload not configured`. Current code имеет полноценный S3-compatible upload/multipart/malware-scan stack; однако live production storage provider всё ещё требует external verification. Значит старую строку нельзя ни считать current gap, ни автоматически заменить на `ready` без live evidence.

9. **UI risk list исторический.** June notes про duplicate logout, mixed RU/EN, admin sections mostly coming soon и raw layout относятся к состоянию проекта на Smoke #1. Current Web architecture/i18n/admin UI с тех пор существенно изменились; эти пункты не являются current UX backlog.

10. **Smoke #2 learner login был `SKIP`.** Поэтому verdict `MVP READY` в Smoke #2 опирался на unchanged Smoke #1 learner evidence, а не на полный повтор всех user-role flows. Это нормально как historical incremental smoke, но важно не интерпретировать Smoke #2 как independent full regression run.

11. **Smoke #1 SHA не записан.** Документ содержит `Commit SHA: (not recorded)`, поэтому его широкий learner-flow evidence нельзя строго привязать к конкретной revision без дополнительной Git archaeology.

12. **Smoke #2 SHA записан и полезен — это сильная сторона документа.** В отличие от многих old status docs, часть evidence можно точно snapshot-bound к `5fa966e...`.

13. **Later production smoke supersedes current-status role этого файла.** `RAILWAY_PRODUCTION_SMOKE_STATUS.md` фиксирует last-known-good production smoke 2026-07-08 и уже сам помечен stale as of 2026-08-06. Значит June staging report должен быть purely historical; even July production smoke не считается current today.

14. **Current `Staging smoke` GitHub Action не доказывает наличие separate Railway staging environment.** Workflow manual (`workflow_dispatch`) и использует GitHub environment `staging` + `STAGING_*` vars/secrets. Это GitHub Actions environment/config label; оно само по себе не опровергает current policy о single Railway production environment.

15. **Report содержит known demo password в repository.** Это historical/demo credential, а не подтверждённый production secret. Тем не менее stable historical report не должен использовать credential presence как proof, что эти credentials всё ещё валидны. Current live validity не проверена.

### Что изменить

1. Сохранить документ как immutable historical incident/smoke artifact; не переписывать June результаты под current code.
2. Добавить top banner: `Historical Railway bring-up report — 2026-06-06/07. Not current staging or production evidence.`
3. Явно объяснить, что `staging` здесь — historical bring-up label; current `MIGRATION_BACKUP_POLICY.md` утверждает отсутствие отдельного Railway staging environment.
4. Mark Smoke #2 metadata:
   - verified commit `5fa966e249c0fabd683fd2e868f72f9335010a54`;
   - final report commit `03760b9164fb4c29094b3dc69cfc71a2b0c860e0`.
5. Smoke #1 оставить с `[НЕ ПРОВЕРЕНО] exact SHA`, а не пытаться реконструировать его молча.
6. Historical Public Networking/API_PORT fix пометить `Superseded`: current API private-only, Railway `PORT` maps automatically to `API_PORT`.
7. Не использовать direct public API URL/port instructions как troubleshooting recipe; current network guidance — `infra/railway/README.md`.
8. Health examples пометить historical; current verification использовать `/health/live` и `/health/ready`, включая DB/Redis/storage status.
9. UI/S3 known risks пометить `at time of Smoke #1`, not current backlog.
10. Для current environment evidence ссылаться на fresh environment-specific smoke artifact; stale `RAILWAY_PRODUCTION_SMOKE_STATUS.md` тоже не является current green proof.
11. Если separate staging environment будет создан снова, создать новый SHA/run-bound report, а не продолжать June historical file без clear epoch separation.
12. Добавить `Superseded by` links на current Railway/network/deployment policy docs.

### [НЕ ПРОВЕРЕНО]

- Live Railway state на 2026-08-08: Web/API/Postgres/Redis/storage, domains и networking не проверялись provider API.
- Exact Smoke #1 commit SHA — самим report не записан; дополнительная forensic reconstruction не выполнялась.
- Текущая валидность demo credentials и исторических Railway URLs не проверялась live.
- Current GitHub `staging` environment variables/secrets и то, куда они фактически указывают, не читались; workflow config подтверждает только имена `STAGING_*`, не target topology.
- Не запускался fresh `staging-smoke.yml`/production smoke: этот documentation audit проверяет historical evidence и current repository config.

### Итог

`STAGING_SMOKE_REPORT.md` — полезный и достаточно хорошо зафиксированный **исторический Railway bring-up report**, особенно Smoke #2 с exact SHA и описанием 502 port mismatch. Но его operational instructions теперь должны считаться superseded: current API должен быть private-only, Railway `PORT` автоматически мапится в API port, readiness включает DB/Redis/storage, а отдельного Railway staging environment current policy не признаёт. Документ следует заморозить как incident history и полностью исключить из current go/no-go без нового fresh smoke evidence.

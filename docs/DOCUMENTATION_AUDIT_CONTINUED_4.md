# Продолжение аудита актуальности документации — часть 4

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. `docs/DOCUMENTATION_AUDIT_CONTINUED.md` содержит №21. `docs/DOCUMENTATION_AUDIT_CONTINUED_2.md` содержит №22. `docs/DOCUMENTATION_AUDIT_CONTINUED_3.md` содержит №23. Этот файл продолжает тот же последовательный аудит с №24.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 24 | `MVP_READINESS_DASHBOARD.md` | ⚠️ Частично актуален / stale current snapshot | Сильная база для readiness aggregation, но текущие статусы отстали от `main`: OpenAPI sync, Dependabot scope, RBAC write invariant, i18n completeness, local-runbook readiness и live Railway claims требуют пересчёта |

---

## 24. `MVP_READINESS_DASHBOARD.md`

**Статус:** ⚠️ частично актуален как readiness aggregation, но устарел как current dashboard. Документ был полностью пересчитан 2026-08-06 против тогдашнего `main`/PR #505, а текущий `main` уже находится на merge PR #520 (`d4ce4d973a85d3551dfd81b6a391857caf626a8b`). За это время несколько источников, на которые dashboard опирается, были изменены либо повторно аудированы и показали drift.

### Проверено

- `MVP_READINESS_DASHBOARD.md` и его source-document inventory;
- текущий `MVP_SCOPE_LOCK.md`;
- current manual OpenAPI document;
- current `.github/dependabot.yml`;
- current `API_RBAC_MATRIX.md` и ранее проверенный instructor ownership write-path;
- current `.env.production.example` и storage/deploy guidance;
- current `CONCERNS.md`;
- результаты аудита `MVP_LOCAL_RUNBOOK.md`, `I18N_GUIDE.md`, `DEPLOY_FOUNDATION.md`, `MIGRATION_BACKUP_POLICY.md`, `API_CONTRACTS.md`, `API_RBAC_MATRIX.md`, `INSTRUCTOR_COURSE_OWNERSHIP.md`;
- branch protection state текущего `main`.

### Подтверждённые факты

- Purpose/architecture dashboard корректны: документ действительно агрегирует несколько более детальных source documents и не должен заменять их.
- Основной backend MVP surface существует: auth, organizations, users, memberships, groups, courses, lessons, materials, assignments, progress, assessments/attempts и certificates присутствуют в текущем API/Prisma surface.
- Refresh-token/session revocation и `logout-all` реализованы; dashboard правильно перестал считать auth только stateless-access-token системой.
- Object-level instructor course scoping и manager team scoping существуют; центральный RBAC/policy audit также существует и активно тестируется.
- Password reset по-прежнему намеренно является skeleton и возвращает `503`; соответствующий dashboard status в целом корректен.
- Notifications и dedicated audit-log modules по-прежнему не реализованы как отдельные product capabilities; dashboard правильно показывает их как unresolved/open product scope.
- Rate-limit code действительно поддерживает Redis и controlled in-memory fallback; `CONCERNS.md` подтверждает, что fallback warning/production readiness остаются отдельной операционной темой.
- `main` не protected (`protected: false`, required-status-check enforcement `off`), поэтому CI readiness и merge enforcement — разные вещи.

### Существенные расхождения

1. **Dashboard больше не соответствует собственному назначению “current MVP readiness state”.** Он датирован 2026-08-06 и прямо говорит, что переписан против тогдашнего `main` (PR #505). Текущий `main` — PR #520. Для status dashboard отсутствие `Verified against main SHA` делает все быстро меняющиеся числовые и operational assertions потенциально stale уже через один merge.

2. **`API documentation = Synced baseline` сейчас неверно.** Dashboard утверждает, что manual OpenAPI paths синхронизированы с current controllers. Current `openapi.document.ts` сам описывает себя как `Manual MVP API documentation skeleton` и по-прежнему не отражает весь runtime API. В предыдущем API audit подтверждены пропуски, включая `/health/live`, `/health/ready`, `POST /auth/refresh`, `GET /manager/team-summary` и ряд update/status/subresource routes. Кроме того, manual document содержит `/openapi.json`, тогда как runtime endpoint — `/api/v1/openapi`. Этот area должен быть как минимум `Partial`, а не `Synced baseline` без оговорок.

3. **`Dependency automation = Ready` завышено.** Current Dependabot npm config использует `directories: /, /apps/api, /apps/web`, но workspace также содержит реальные manifests в `/apps/e2e` и `/packages/shared`. Значит automation не охватывает весь pnpm workspace, несмотря на wording `workspace-level directories config`.

4. **`RBAC = Ready` требует уточнения после найденного write-boundary gap.** Read-side course ownership и object-level scoping работают. Однако `CoursesService.addInstructor()` не проверяет, что target user имеет active instructor membership, а Admin Courses UI может предлагать любого пользователя организации. Это не немедленный privilege escalation, но нарушает invariant relation `CourseInstructor` и делает абсолютный статус `Ready` слишком сильным до server-side eligibility validation.

5. **`Full RBAC audit = Done` переоценивает полноту документации.** Current `API_RBAC_MATRIX.md` по-прежнему перечисляет public endpoints без malware-scan callback `POST /internal/material-scans/:id/result` и текстом говорит о 8 course-scoped controllers, фактически перечисляя 9. Runtime policy audit может быть сильным, но documentation audit нельзя считать полностью “done/synced”.

6. **`Web smoke coverage = 347 web tests passing` — snapshot, а не current metric.** Это число не привязано к конкретному CI run/SHA и после PR #505 в `main` вошли новые изменения. Даже если текущий CI зелёный, dashboard не доказывает, что именно 347 tests является текущим количеством. Для current dashboard нужно ссылаться на latest successful workflow/run или хранить SHA/date рядом с числом.

7. **`Storage uploads = Ready ... MinIO deployed as its own Railway service` является live operational assertion, который repository alone не подтверждает.** Current `.env.production.example` рекомендует `Cloudflare R2 or AWS S3 in production` и помечает MinIO как self-hosted/path-style option. Ранее проверенный `infra/railway/README.md` описывает web/api/PostgreSQL, а deploy docs расходятся по MinIO. Код tenant-scoped private storage/presigned URLs подтверждён, но конкретный live provider/service должен быть `[НЕ ПРОВЕРЕНО]` либо иметь свежий Railway evidence.

8. **`Deployment = Live in production` с перечнем `web/api/Postgres/minio services running` также является stale/live claim.** Repository подтверждает Railway deployment configuration, но не текущий live service inventory. `RAILWAY_PRODUCTION_SMOKE_STATUS.md` ранее сам был отмечен как stale и требующий свежего smoke. Dashboard должен отделять `deployment config implemented` от `live topology verified`.

9. **`Rate limiting = Partial` может быть правильным code-readiness статусом, но evidence `no Redis service is provisioned on Railway` — live claim.** Current code/config подтверждает Redis support и escape hatch, а current `.env.production.example` вообще задаёт `REDIS_URL` как production-required guidance. Реальное отсутствие/наличие Redis service должно подтверждаться свежим Railway observation, а не храниться бессрочно в dashboard.

10. **Current baseline утверждает, что full admin web surface “all localized (ru/en/kk/zh)”, но i18n audit это опровергает как invariant.** Four locale bundles действительно существуют, но shared/admin UI всё ещё содержит hardcoded user-visible literals, locale persistence реализована неодинаково, parity test проверяет только `kk` против `ru`. Значит корректнее писать `four locale bundles integrated; localization incomplete/partially enforced`.

11. **Pilot go/no-go условие `Local env follows MVP_LOCAL_RUNBOOK.md` опирается на runbook, который сам сейчас неполон.** Аудит №23 подтвердил: committed local compose уже существует, основной flow не применяет migrations и seed, `.env.example` включает Redis без local Redis service, MinIO bucket bootstrap отсутствует, `/health` может быть красным на fresh setup. Поэтому dashboard не может использовать этот runbook как готовый go-condition без оговорки/исправления.

12. **Pilot summary смешивает repository readiness и product risk acceptance.** Фраза “controlled technical pilot is realistically go-able today” допустима только как decision statement при явно принятом owner risk. Сам dashboard правильно перечисляет audit log/notifications/in-memory rate limiting как known limitations, но не хранит отдельное evidence того, что pilot owner фактически принял эти риски. Следовательно, `go-able` — вывод/рекомендация, не автоматически подтверждённый fact.

13. **`CI quality gates = Ready` нужно отделить от merge enforcement.** CI/CodeQL/security checks реально существуют и запускаются, но `main` branch protection выключена. Если readiness предполагает “нельзя merge при красном CI”, dashboard должен либо добавить отдельный `Merge protection` area со статусом gap, либо явно сказать, что green CI — manual process requirement.

14. **Source documents имеют внутренние противоречия, которые dashboard сейчас агрегирует как факты.** Примеры уже подтверждены этим аудитом: `MIGRATION_BACKUP_POLICY.md` противоречит сам себе по backup requirement; `DEPLOY_FOUNDATION.md` расходится по staging/storage model; `MVP_DEFINITION_OF_DONE.md` содержит stale Required items; `MVP_LOCAL_RUNBOOK.md` не воспроизводит clean-machine setup. Dashboard должен показывать freshness/health каждого source document, иначе агрегированный `Ready` наследует их drift.

### Что изменить

1. Добавить в начало dashboard машинно читаемый snapshot header: `Verified at`, `Verified against main SHA`, `Latest CI run`, `Live environment verified at`.
2. Пересчитывать dashboard после изменений canonical source docs или ключевых runtime contracts; не оставлять “current” без freshness signal.
3. Понизить `API documentation` до `Partial` до полного runtime/manual OpenAPI reconciliation либо переименовать artifact в deliberately partial skeleton.
4. Понизить `Dependency automation` до `Partial` до добавления `/apps/e2e` и `/packages/shared` в Dependabot config.
5. Для `RBAC` разделить:
   - runtime policy enforcement/read scoping — `Ready`;
   - instructor assignment write invariant — `Gap/Partial` до role eligibility validation;
   - documentation mirror — `Partial` до исправления API_RBAC_MATRIX omissions.
6. Заменить test-count snapshots на ссылку/ID последнего successful CI и commit SHA; при желании оставить test count только как необязательный snapshot metric.
7. Для Storage/Deployment/Rate limiting разделить `code/config readiness` и `live infrastructure status`. Все live Railway assertions снабжать датой/evidence; без него помечать `[НЕ ПРОВЕРЕНО]`.
8. Исправить localization wording: four locale bundles/support — да; “all UI localized” — нет, пока остаются hardcoded strings и неполный parity/persistence contract.
9. Убрать `MVP_LOCAL_RUNBOOK.md` из безусловного go-condition до исправления clean-machine bootstrap либо явно добавить manual prerequisites (migrations, seed, Redis strategy, bucket bootstrap).
10. Добавить отдельный area `Merge protection / branch rules`: сейчас CI есть, но `main` protection выключена.
11. В go/no-go summary разделить:
    - repository checks;
    - live environment checks;
    - accepted product limitations;
    - explicit pilot-owner approval.
12. Добавить source-health/freshness column: canonical doc может быть `current`, `needs reconciliation`, `live verification required`.
13. После полного documentation audit использовать его результаты для одного controlled recalculation dashboard вместо точечных ручных статусов.

### [НЕ ПРОВЕРЕНО]

- Реальное live Railway topology на 2026-08-08: MinIO, Redis, Postgres, API/Web service state и конкретные env vars не проверялись через Railway provider.
- Фактический текущий web test count (`347` или иной) не извлекался из test reporter; проверка касается отсутствия SHA/run evidence у числа в dashboard.
- Pilot owner не опрашивался в рамках технического аудита на предмет явного принятия audit-log/notifications/rate-limit risks.
- Не выполнялся fresh external production smoke для подтверждения “live in production today”.
- Все 14 scope rows из `MVP_SCOPE_LOCK.md` не были заново пересчитаны feature-by-feature в этом отдельном шаге; audit проверял dashboard claims и ключевые source-of-truth conflicts. Полный per-feature reconciliation уже является отдельной задачей source docs.

### Итог

`MVP_READINESS_DASHBOARD.md` хорошо устроен концептуально: он агрегирует readiness и отделяет source documents. Но именно потому, что это **current status document**, его требования к freshness должны быть выше, чем у исторических policy/ledger файлов. На текущем `main` несколько зелёных статусов уже завышены: manual OpenAPI не синхронизирован, Dependabot не покрывает весь workspace, instructor assignment write invariant неполон, localization не является полностью enforced, local runbook не воспроизводит fresh bootstrap, а MinIO/Redis/production service claims требуют live evidence. Dashboard стоит пересчитать после завершения полного documentation audit и привязать каждый current/live статус к SHA/date/run evidence.

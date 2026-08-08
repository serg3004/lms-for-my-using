# Продолжение аудита актуальности документации — часть 20

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_19.md` содержат результаты №21–39. Этот файл завершает последовательный аудит результатом №40.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 40 | `TODO_VERIFY.md` | ⚠️ Существенно stale как verification queue | Полезен как historical decision registry, но многие `PROPOSED/DEFERRED/TODO VERIFY` уже имеют подтверждённое current состояние, а некоторые `ACCEPTED` смешивают code decision с непроверенным live provider state |

---

## 40. `TODO_VERIFY.md`

**Статус:** ⚠️ существенно устарел именно как очередь нерешённых вопросов. Файл частично обновлялся 2026-08-04/06, но current `main` уже ушёл дальше. Его полезно сохранить как decision registry, однако статусы нужно пересчитать против кода и отделить owner decisions от live infrastructure facts.

### Подтверждённые корректные решения

- TV-001 NestJS, TV-002 Prisma, TV-003 React+Vite+TypeScript, TV-004 Custom UI, TV-007 local MinIO, TV-010 pnpm workspaces — соответствуют current repository.
- TV-005 уже правильно получил примечание, что refresh token больше не “later”: current auth имеет refresh endpoint, Session store и rotation.
- TV-006 правильно фиксирует реальный `scrypt`, а не bcrypt/Argon2id.
- TV-011–018 out-of-MVP guardrails в основном согласуются с current scope.
- TV-025 `/api/v1` соответствует global API prefix.
- TV-028 Zod соответствует current runtime validation approach.
- TV-035 signed URLs after backend access check соответствует current private material-download design.
- TV-038 PDF, TV-039 public certificate verification URL и часть advanced export/analytics пунктов остаются разумно deferred/out-of-scope.

### Статусы, которые уже не соответствуют current implementation

1. **TV-019 `organization_id` — `PROPOSED`, хотя решение фактически реализовано.** Organization scoping является current tenant model во всех основных business entities/services и RBAC boundaries. Статус должен быть `DONE/ACCEPTED` как implementation fact.
2. **TV-026 pagination — `PROPOSED`, хотя contract уже enforced:** `page` default 1, `pageSize` default 20, max 200 в `apps/api/src/common/pagination.schema.ts`. История файла сама фиксирует production bug, из-за которого max был поднят со 100 до 200.
3. **TV-027 error format — `PROPOSED`, но canonical error envelope уже существует.** Current shape содержит `statusCode`, `error.code`, `error.message`, optional `details`, `path`, `timestamp`; proposed `requestId` отсутствует. Значит это не просто pending decision, а `PARTIAL/current contract differs`.
4. **TV-029 OpenAPI — `DEFERRED`, хотя `apps/api/src/modules/openapi/` уже существует с controller/document/tests.** Реальная проблема теперь — ручной/неполный OpenAPI drift, а не отсутствие OpenAPI вообще.
5. **TV-031 password reset — `PROPOSED`, хотя endpoints/schemas уже реализованы как намеренно unavailable skeleton.** Current service возвращает 503; отдельный status doc это фиксирует. Лучше `IMPLEMENTED SKELETON / DELIVERY DEFERRED`.
6. **TV-032 login rate limiting — `PROPOSED`, хотя sensitive-route limiting реализован:** login, reset request/confirm и organization registration защищены IP/account/global rules, Redis + emergency local fallback.
7. **TV-033 refresh token storage — `PROPOSED`, хотя httpOnly cookie/session rotation уже current behavior.** Должно быть `DONE/ACCEPTED` с ссылкой на auth session docs.
8. **TV-036 antivirus scan — `DEFERRED`, хотя code integration уже реализована:** quarantine, scanner dispatch, authenticated callback, timeout/error/infected fail-closed. Live scanner availability остаётся отдельным ops verification.
9. **TV-037 HTML certificate — `PROPOSED`, хотя learner certificate UI/API уже реализованы.** `LearnerCertificatesPage` показывает issued/revoked certificates и ведёт на certificate route.
10. **TV-040 manual certificate issuance — `DEFERRED`, хотя `POST /certificates` существует и защищён role/org/course guards.** Нужна проверка product policy/roles, но capability уже не отсутствует.
11. **TV-042 MVP reports — `PROPOSED`, хотя current scope фиксирует partial implementation через progress/certificates/assessment report endpoints и admin/manager pages.** Статус должен быть `PARTIAL`, а не чисто proposed.
12. **TV-047 Notifications `PROPOSED` конфликтует с canonical scope.** `MVP_SCOPE_LOCK.md` считает Notifications частью MVP, но current API modules не содержат notifications module. Это не обычное implementation TODO, а unresolved scope decision: build or formally remove from MVP.
13. **TV-051 staging `PROPOSED` не совпадает с current migration policy.** `MIGRATION_BACKUP_POLICY.md` фиксирует отсутствие отдельного Railway staging environment. Нужно либо принять `local + production`, либо обновить topology evidence.
14. **TV-052 Web hosting `TODO VERIFY` слишком слабый статус.** Repository содержит Railway Web service/Docker deployment config; repository-side target подтверждён. Live service availability остаётся отдельным `[НЕ ПРОВЕРЕНО]`.
15. **TV-053 DB migrations `PROPOSED: manual controlled command first` прямо конфликтует с current deploy config.** `apps/api/railway.json` запускает `prisma migrate deploy && node dist/main.js` автоматически на API start.
16. **TV-055 observability `PROPOSED`, хотя Pino logging и optional Sentry уже wired в `main.ts`.** Нужно `PARTIAL`: code hooks implemented, live Sentry/alert routing not verified.

### `ACCEPTED`, которые смешивают решение и live-state claim

- **TV-008 Production object storage = MinIO on Railway.** Git history подтверждает, что 2026-08-04 это было принято и тогда заявлено как deployed. Но current `.env.production.example`/storage architecture provider-neutral и рекомендуют R2/AWS S3, MinIO — self-hosted option. GitHub сегодня не подтверждает, что live provider всё ещё MinIO. Правильнее разделить `accepted historical/provider choice` и `current live provider: verification required`.
- **TV-009 Railway-first** как deployment architecture остаётся корректным repository decision; утверждение о конкретных production/staging services должно быть live evidence-bound.
- **TV-054 backups DEFERRED** является записанным owner decision, но комментарий о Railway backup capabilities не является доказательством, что backups/PITR сейчас включены. Current backup/restore state остаётся operational verification.

### Вопросы, которые действительно остаются verification/business decisions

- TV-022 soft-delete policy требует per-entity reconciliation: current schema использует soft-delete не универсально, а domain-specific.
- TV-024 general append-only audit log остаётся не реализован как общий модуль; существует лишь узкий durable audit для file deletion. Это также конфликтует с current MVP scope requirement.
- TV-030 invite flow остаётся product decision поверх уже существующего admin-created user flow/status model.
- TV-048 email provider действительно не подтверждён repository implementation/provider evidence.
- TV-050 reminder scheduler остаётся deferred.
- Notifications/Audit Log требуют явного owner scope decision, потому что `MVP_SCOPE_LOCK.md` считает их blocking MVP capabilities, а implementation отсутствует.
- Live Railway topology, storage provider, backup/restore, production smoke и alert routing нельзя закрыть чтением GitHub code.

### Структурная проблема файла

`TODO_VERIFY.md` одновременно используется как:

1. registry принятых архитектурных решений;
2. backlog будущих product решений;
3. verification queue;
4. live infrastructure status;
5. historical implementation notes.

Из-за этого один и тот же статус (`PROPOSED`, `ACCEPTED`, `DEFERRED`) имеет разные смыслы. Правило в §12 “если решение не принято — оставить TODO VERIFY” больше не выполняется системно: многие строки уже подтверждены кодом, но статус не пересчитан.

### Что изменить

1. Разделить минимум на `Decision registry` и `Verification queue`.
2. Для каждого item хранить `Decision status` отдельно от `Implementation status` и `Live verification status`.
3. Добавить `Verified at` / `Verified against main SHA`.
4. Пересчитать TV-019, 026, 029, 031–033, 036–037, 040, 042, 051–053, 055.
5. TV-027 отметить как `current contract differs`: canonical error envelope существует, `requestId` не реализован.
6. TV-008/054 не использовать как бессрочное live evidence; provider/backup state должен иметь timestamp/provider proof.
7. Notifications/Audit вынести в отдельные explicit owner decisions: `build for MVP` или `remove from MVP scope`; не оставлять одновременно scope-blocking и merely proposed.
8. В §11 `Decisions accepted for now` убрать stale auth wording и безусловный live MinIO claim; ссылки на dedicated current docs предпочтительнее дублирования mutable state.
9. Historical notes сохранить, но не смешивать их с current status column.
10. После reconciliation использовать `TODO VERIFY` только там, где ответ действительно нельзя получить из current code/config/docs.

### [НЕ ПРОВЕРЕНО]

- Live Railway storage provider и bucket на 2026-08-08.
- Live backup/PITR settings и restore readiness.
- Email provider/account/domain configuration.
- Live Sentry/alert routing.
- Current production/staging topology вне repository config.
- Полный per-model soft-delete matrix не пересчитан в рамках этой последней audit записи; подтверждено лишь, что policy не универсальна.
- Не выполнен fresh production smoke.

### Итог

`TODO_VERIFY.md` полезен как история решений, но как operational verification queue сейчас требует серьёзной очистки. Главный принцип для обновления: **если факт можно подтвердить current code/config — он не должен оставаться `TODO VERIFY/PROPOSED`; если утверждение зависит от Railway/provider — оно не должно становиться бессрочным `ACCEPTED` без fresh evidence.** После разделения decision/implementation/live statuses файл снова сможет безопасно направлять AI coding agents.

---

## Завершение последовательного аудита

Проверены все 40 root-документов из согласованного списка. Каталоги `docs/lms-ui-prototypes-complete/`, `docs/master-context/` и `.gitkeep` не входили в scope. Исходные документы не исправлялись; PR содержит только результаты аудита. Следующий этап — отдельная reconciliation/remediation задача по приоритету найденных расхождений.

# Аудит актуальности документации

## Назначение

Этот файл фиксирует результаты последовательной проверки документов в `docs/` на соответствие текущему состоянию ветки `main`.

Исключены из аудита:

- `docs/lms-ui-prototypes-complete/`;
- `docs/master-context/`;
- `.gitkeep` как служебный пустой файл.

Для каждого документа проверяются утверждения о коде, конфигурации, командах, тестах, CI и связанных компонентах. Неподтверждённые пункты помечаются `[НЕ ПРОВЕРЕНО]`.

## Сводка

| № | Документ | Статус | Итог |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ Актуален | Изменения не требуются |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ Частично актуален | Уточнить baseline verification либо расширить реализацию |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ Частично актуален | Обновить visibility, пути, backend pattern и bootstrap-инструкции |
| 4 | `API_CONTRACTS.md` | ⚠️ Частично актуален | Runtime contract в основном актуален; manual OpenAPI не синхронизирован полностью |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ Частично актуален | Role matrix актуальна; исправить public inventory и число course-scoped controllers |
| 6 | `ARCHITECTURE_MODULE_BOUNDARIES.md` | ⚠️ Частично актуален | API-границы в основном актуальны; Web structure и docs-only CI guidance требуют обновления |
| 7 | `AUTH_SESSION_STORE_DESIGN.md` | ⚠️ Частично актуален | Исторический PR 120 описан верно, но текущая Session model и login flow уже расширены refresh-состоянием |

---

## 1. `ACCESSIBILITY.md`

**Статус:** ✅ актуален.

### Подтверждено

- WCAG 2.1 AA соответствует Axe tags в `apps/e2e/accessibility-tests/accessibility.spec.ts`.
- `pnpm test:a11y` существует и использует `apps/e2e/playwright.accessibility.config.ts`.
- Axe gate фильтрует `critical` и `serious`.
- Проверяются `/`, `/login` и workspace ролей admin/manager/instructor/learner.
- Keyboard tests покрывают skip navigation, language menu, login form, mobile navigation и возврат focus после `Escape`.
- CI содержит обязательный шаг `Accessibility baseline` без `continue-on-error`.

### Несоответствия

Не обнаружены.

### Что изменить

Ничего.

---

## 2. `ADMIN_DEMO_SEED.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- `pnpm --filter @lms/api admin:demo-seed` существует.
- Dry-run является режимом по умолчанию; apply требует явных environment/database confirmations.
- Production блокируется по умолчанию и требует `--allow-demo-environment` для обхода guard.
- Apply и post-seed verification выполняются внутри `Prisma.$transaction`.
- Прямой `prisma/seed.mjs` и `prisma db seed` направлены через guarded path.
- Database target не выводит username/password или полный `DATABASE_URL`.

### Несоответствие

`findMissingDemoData()` проверяет только baseline subset: organization, admin, learner, course, 3 lessons, assignment, assessment и 5 questions. `prisma/seed.mjs` создаёт также manager, instructor, memberships, groups, materials, progress, answer options и другие записи.

### Что изменить

Уточнить, что dry-run/post-seed verification и `already-complete` относятся к baseline subset, либо расширить `findMissingDemoData()` до полного demo dataset.

---

## 3. `AI_AGENT_STARTER_PROMPT.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Текущий стек: NestJS/TypeScript/Prisma для API, React/Vite/TypeScript для Web, pnpm workspace.
- Docker Compose находится в `infra/docker/docker-compose.yml`.
- Backend-модули уже существуют.
- Master-context файлы находятся в `docs/master-context/`.
- `courses` использует service + `PrismaService` без отдельного repository layer; входные данные валидируются Zod schemas.

### Несоответствия

1. Репозиторий назван private, но GitHub API возвращает `visibility: public`.
2. Пути к `01_LMS_...`—`23_LMS_...` указаны как `docs/...`, а фактически находятся в `docs/master-context/...`.
3. Требование `module/controller/service/repository` не соответствует текущей структуре как минимум `courses`.
4. DTO-specific формулировка не отражает Zod-based validation.
5. Bootstrap-порядок предлагает создавать уже существующие monorepo/API/Web/Prisma/Docker/health/CI.
6. Не задан приоритет между актуальными root-документами и историческим `master-context`.

### Что изменить

Обновить visibility/пути, требовать следовать существующей структуре конкретного модуля, заменить DTO-specific правило на существующий механизм валидации, пометить bootstrap как исторический и задать приоритет current code/config + root docs над master-context drafts.

---

## 4. `API_CONTRACTS.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Глобальный prefix `/api/v1` соответствует `main.ts`.
- Error envelope соответствует `ApiErrorResponse`.
- Pagination baseline: `page=1`, `pageSize=20`, max `200`.
- Auth controller содержит login, refresh, logout, logout-all, password-reset request/confirm и `/auth/me`.
- Health controller содержит `/health`, `/health/live`, `/health/ready`.
- `AppModule` подключает описанные предметные модули.
- `env.ts` поддерживает Redis rate-limit store через `REDIS_URL` и production fallback только при `ALLOW_IN_MEMORY_RATE_LIMIT=true`.
- Runtime OpenAPI endpoint: `GET /api/v1/openapi`.

### Несоответствие

Фраза `Manual OpenAPI document synced with current controllers` неверна. `openapi.document.ts` не содержит часть runtime routes, включая `/health/live`, `/health/ready`, `POST /auth/refresh`, `GET /manager/team-summary` и ряд update/status/sub-resource endpoints. Кроме того, manual document объявляет self-path `/openapi.json`, тогда как controller публикует `/api/v1/openapi`.

### Что изменить

Либо явно назвать manual OpenAPI частичным skeleton, либо синхронизировать `openapi.document.ts` со всеми runtime endpoints и исправить self-path.

### [НЕ ПРОВЕРЕНО]

Live production URL и фактическое Railway/Redis состояние не подтверждались GitHub-данными.

---

## 5. `API_RBAC_MATRIX.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- `rolePolicies` соответствует основной таблице ролей.
- `RolesGuard` работает fail-closed при отсутствии role metadata.
- `api-policy.audit.spec.ts` проверяет явную access-классификацию production HTTP handlers и `RolesGuard` для role handlers.
- Instructor ownership реализован через `CourseAccessGuard` / `CourseAccessPolicy` с 404 для недоступного instructor ресурса и admin bypass.
- Manager team scope применяется в Prisma query через `ManagerTeamScope`.

### Несоответствия

1. В public inventory отсутствует `POST /internal/material-scans/:id/result` с `@PublicAccess()`. Endpoint дополнительно защищён callback Authorization secret через `verifyCallbackSecret()`.
2. Документ говорит о `8 controllers`, но перечисляет 9: courses, lessons, course-materials, assessments, assessment-questions, assessment-attempts, assignments, progress, certificates.

### Что изменить

Добавить malware-scan callback в public inventory с пояснением secret-based machine-to-machine защиты и исправить `8 controllers` на `9 controllers` либо убрать хрупкий счётчик.

---

## 6. `ARCHITECTURE_MODULE_BOUNDARIES.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Основные API/database paths и список API modules соответствуют репозиторию.
- `AppModule` связывает runtime modules, а `PrismaService` находится в database boundary.
- Frontend API boundary существует: `shared/apiClient.ts` — low-level client, `shared/api/*` — domain wrappers/types.
- `infra/` содержит `docker`, `nginx`, `railway`.

### Несоответствия

1. Не описан `apps/web/src/features`; текущий `features/admin-users` уже содержит UI, hooks, model, validation и mappers.
2. `apps/web/src/app/` содержит не только pages, но и feature/domain subdirectories (`admin-assignments`, `admin-courses`, `admin-lessons`, `admin-org-structure`, `assessment-builder`, `assessment-taking`, `course-builder`, `materials`).
3. Универсальное правило «каждый API domain module имеет controller/service/schema» не подходит support/policy modules вроде `course-access` и `manager-team-scope`.
4. Docs-only testing guidance расходится с `.github/workflows/ci.yml`: PR без path filters запускает полный CI даже для чистых docs changes.

### Что изменить

Добавить `features/` в Web architecture, описать гибрид `app/pages + features + shared`, различить route-owning и support/policy API modules и привести docs-only testing rule к фактическому обязательному CI.

---

## 7. `AUTH_SESSION_STORE_DESIGN.md`

**Статус:** ⚠️ частично актуален.

### Проверено

- исходная Session model и миграция PR 120;
- текущая Prisma model `Session`;
- login/session creation;
- access-token session validation;
- logout/revocation;
- refresh token storage и rotation;
- миграция refresh storage;
- исторические staging assertions.

### Подтверждённые факты

- Историческая миграция `20260606000000_add_sessions` действительно создаёт `sessions` с `id`, `jti`, `user_id`, `organization_id`, `created_at`, `expires_at`, `revoked_at`, уникальным индексом `jti`, индексами и FK.
- Текущая Prisma model `Session` по-прежнему содержит исходные поля PR 120 и индексы по user/organization и expiry.
- Access-token validation в `AuthService.getCurrentUser()` проверяет JWT, затем ищет Session по `jti` с `revokedAt: null` и `expiresAt > now`.
- Logout отзывает текущую Session через `revokedAt` по `jti`.
- Обновление от 2026-08-06 верно сообщает о появлении refresh flow на той же Session model.
- Миграция `20260728000000_add_session_refresh_storage` добавляет `refresh_token_hash`, `refresh_expires_at`, unique index для hash и индекс для refresh expiry.
- Текущий login создаёт random refresh token, хранит в Session только SHA-256 hash (`refreshTokenHash`) и `refreshExpiresAt`, а сырой refresh token возвращает для HttpOnly cookie.
- Текущий refresh flow consume/rotate использует `AuthSessionStore` и `auth.refresh-tokens.ts`; сырой refresh token в базе не хранится.

### Несоответствия

1. **Раздел `Модель данных` устарел как описание текущей Session model.** Он говорит, что `Session` хранит «только метаданные сессии» и перечисляет только `id`, `jti`, `userId`, `organizationId`, `createdAt`, `expiresAt`, `revokedAt`. Сейчас модель дополнительно хранит `refreshTokenHash` и `refreshExpiresAt`.

2. **Раздел `Safe token storage` содержит устаревшую формулировку `База хранит только jti и метаданные связи`.** Полный JWT и сырой refresh token действительно не хранятся, но база теперь хранит также криптографический hash refresh token и его expiry.

3. **Раздел `Жизненный цикл сессии` неполон для текущего login.** Сейчас login не только подписывает access JWT и создаёт Session по `jti`, но одновременно создаёт refresh token, сохраняет его hash/expiry и отдаёт refresh token через cookie flow.

4. Документ остаётся привязан к **PR 120**, а update про PR 137 добавлен отдельной вставкой. Поэтому ранние нормативно звучащие разделы и позднее обновление противоречат друг другу, если документ читать как описание текущего состояния, а не исторический snapshot.

### Что изменить

Есть два корректных варианта:

1. **Сохранить документ как исторический PR 120 record.** Тогда в начале явно пометить его как исторический snapshot, а разделы `Модель данных`, `Safe token storage` и `Жизненный цикл` — как состояние на момент PR 120; добавить ссылку на `AUTH_TOKEN_REVOCATION.md` как источник текущего refresh/session поведения.
2. **Сделать документ текущим session-store design.** Тогда обновить модель полями `refreshTokenHash`/`refreshExpiresAt`, safe-storage формулировку, login lifecycle, refresh consume/rotation и logout-all behavior, убрав формулировки о refresh как внешней будущей работе.

Для текущей структуры документа предпочтителен первый вариант: заголовок и Scope явно привязаны к PR 120, поэтому безопаснее сохранить историческую ценность и чётко отделить её от текущего design.

### [НЕ ПРОВЕРЕНО]

- Историческое утверждение, что миграция PR 120 была применена на staging «без pending migrations», не подтверждалось live/staging environment в рамках текущего аудита.
- Историческое утверждение «существующий поток login не изменён» относится к состоянию PR 120 и не может быть подтверждено текущим кодом без воспроизведения той исторической версии.

### Итог

Документ корректно фиксирует основу Session store, появившуюся в PR 120, и содержит правильное позднее замечание о refresh flow. Но он не полностью актуален как описание текущей Session model: refresh hash/expiry и расширенный login/rotation lifecycle находятся только в update, тогда как основные разделы продолжают описывать старое состояние.

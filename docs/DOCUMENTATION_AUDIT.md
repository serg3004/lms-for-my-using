# Аудит актуальности документации

## Назначение

Этот файл фиксирует результаты последовательной проверки документов в `docs/` на соответствие текущему состоянию `main`.

Исключены из аудита:

- `docs/lms-ui-prototypes-complete/`;
- `docs/master-context/`;
- `.gitkeep` как служебный пустой файл.

Для каждого документа сверяются проверяемые утверждения с кодом, конфигурацией, тестами, CI и GitHub settings. Неподтверждённые операционные утверждения помечаются `[НЕ ПРОВЕРЕНО]`.

## Сводка

| № | Документ | Статус | Итог |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ Актуален | Изменения не требуются |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ Частично актуален | Уточнить baseline verification либо расширить реализацию |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ Частично актуален | Обновить visibility, пути, backend pattern и bootstrap-инструкции |
| 4 | `API_CONTRACTS.md` | ⚠️ Частично актуален | Runtime contract в основном актуален; manual OpenAPI не синхронизирован полностью |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ Частично актуален | Role matrix актуальна; исправить public inventory и число course-scoped controllers |
| 6 | `ARCHITECTURE_MODULE_BOUNDARIES.md` | ⚠️ Частично актуален | API-границы в основном актуальны; Web structure и docs-only CI guidance требуют обновления |
| 7 | `AUTH_SESSION_STORE_DESIGN.md` | ⚠️ Частично актуален | Исторический PR 120 описан верно, но текущая Session model расширена refresh-состоянием |
| 8 | `AUTH_TOKEN_REVOCATION.md` | ⚠️ Частично актуален | Logout/revocation актуальны; общее CSRF-утверждение устарело после refresh endpoint |
| 9 | `CI_AUDIT_BASELINE.md` | ⚠️ Частично актуален | CI/CodeQL/Dependabot baseline актуален; branch protection подтверждён как выключенный |
| 10 | `CONCERNS.md` | ⚠️ Существенно требует ревизии | Несколько open concerns уже закрыты кодом; часть остаётся актуальной; live Railway claims требуют повторной проверки |

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

- Стек соответствует проекту: NestJS/TypeScript/Prisma, React/Vite/TypeScript, pnpm workspace.
- Docker Compose находится в `infra/docker/docker-compose.yml`.
- Master-context файлы находятся в `docs/master-context/`.
- `courses` использует service + `PrismaService` без отдельного repository layer; validation — Zod schemas.

### Несоответствия

1. Репозиторий назван private, GitHub возвращает `visibility: public`.
2. Пути к `01_LMS_...`—`23_LMS_...` указаны как `docs/...`, фактически они в `docs/master-context/...`.
3. Требование `module/controller/service/repository` не соответствует текущей структуре как минимум `courses`.
4. DTO-specific правило не отражает Zod-based validation.
5. Bootstrap-порядок предлагает создавать уже существующие monorepo/API/Web/Prisma/Docker/health/CI.
6. Не задан приоритет current root docs/code над историческим `master-context`.

### Что изменить

Обновить visibility и пути; требовать следовать существующей структуре модуля; заменить DTO-specific правило на существующий механизм validation; пометить bootstrap как исторический; задать приоритет current code/config + root docs над master-context drafts.

---

## 4. `API_CONTRACTS.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Глобальный prefix `/api/v1` соответствует `main.ts`.
- Error envelope соответствует `ApiErrorResponse`.
- Pagination baseline: `page=1`, `pageSize=20`, max `200`.
- Auth controller содержит login, refresh, logout, logout-all, password-reset request/confirm и `/auth/me`.
- Health controller содержит `/health`, `/health/live`, `/health/ready`.
- Redis rate-limit store поддерживается через `REDIS_URL`, production fallback — только при `ALLOW_IN_MEMORY_RATE_LIMIT=true`.
- Runtime OpenAPI endpoint: `GET /api/v1/openapi`.

### Несоответствие

Фраза `Manual OpenAPI document synced with current controllers` неверна. `openapi.document.ts` не содержит часть runtime routes, включая `/health/live`, `/health/ready`, `POST /auth/refresh`, `GET /manager/team-summary` и ряд update/status/sub-resource endpoints. Manual document также объявляет self-path `/openapi.json`, тогда как controller публикует `/api/v1/openapi`.

### Что изменить

Либо явно назвать manual OpenAPI частичным skeleton, либо синхронизировать его со всеми runtime endpoints и исправить self-path.

### [НЕ ПРОВЕРЕНО]

Live production URL и фактическое Railway/Redis состояние не подтверждаются данными GitHub.

---

## 5. `API_RBAC_MATRIX.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- `rolePolicies` соответствует основной таблице ролей.
- `RolesGuard` работает fail-closed при отсутствии role metadata.
- `api-policy.audit.spec.ts` проверяет явную access-классификацию production HTTP handlers и поведение `RolesGuard` для всех четырёх ролей.
- Instructor ownership реализован через `CourseAccessGuard` / `CourseAccessPolicy` с 404 для недоступного instructor ресурса и admin bypass.
- Manager team scope применяется в Prisma query через `ManagerTeamScope`.

### Несоответствия

1. В public inventory отсутствует `POST /internal/material-scans/:id/result` с `@PublicAccess()`; endpoint дополнительно защищён callback Authorization secret.
2. Документ говорит о `8 controllers`, но перечисляет 9 course-scoped controllers.

### Что изменить

Добавить malware-scan callback в public inventory с пояснением machine-to-machine secret protection и исправить `8` на `9` либо убрать хрупкий счётчик.

---

## 6. `ARCHITECTURE_MODULE_BOUNDARIES.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Основные API/database paths и список API modules соответствуют репозиторию.
- `AppModule` связывает runtime modules, `PrismaService` находится в database boundary.
- Frontend API boundary существует: `shared/apiClient.ts` — low-level client, `shared/api/*` — domain wrappers/types.
- `infra/` содержит `docker`, `nginx`, `railway`.

### Несоответствия

1. Не описан `apps/web/src/features`; `features/admin-users` уже содержит UI, hooks, model, validation и mappers.
2. `apps/web/src/app/` содержит не только pages, но и feature/domain subdirectories.
3. Универсальное правило «каждый API domain module имеет controller/service/schema» не подходит support/policy modules вроде `course-access` и `manager-team-scope`.
4. Docs-only testing guidance расходится с CI: PR без path filters запускает полный workflow даже для docs-only changes.

### Что изменить

Добавить `features/`, описать гибрид `app/pages + features + shared`, различить route-owning и support/policy API modules и привести docs-only testing guidance к фактическому CI.

---

## 7. `AUTH_SESSION_STORE_DESIGN.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Историческая миграция PR 120 действительно создала `sessions` с `id`, `jti`, `user_id`, `organization_id`, timestamps, expiry/revocation и индексами.
- Access-token validation ищет Session по `jti`, `revokedAt: null`, `expiresAt > now`.
- Logout отзывает Session через `revokedAt`.
- Поздняя refresh migration добавляет `refresh_token_hash`, `refresh_expires_at`, unique/indexes.
- Login хранит только SHA-256 hash refresh token и expiry; raw refresh token в БД не хранится.

### Несоответствия

Основные разделы всё ещё описывают PR 120 и утверждают, что Session хранит только `jti` и базовые metadata, хотя текущая модель содержит `refreshTokenHash` и `refreshExpiresAt`; login lifecycle также расширен refresh flow.

### Что изменить

Предпочтительно явно пометить документ как historical snapshot PR 120 и сослаться на current refresh/session design. Альтернатива — полностью обновить модель, login, rotation и logout-all sections до current state.

### [НЕ ПРОВЕРЕНО]

Исторические staging assertions PR 120 в текущем аудите не воспроизводились.

---

## 8. `AUTH_TOKEN_REVOCATION.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- Logout поддерживает bearer/access cookie, cookie flow требует CSRF.
- Logout идемпотентен для invalid/already-revoked access token.
- Logout-all отзывает Session по точным `userId` + `organizationId`.
- Bearer logout/logout-all не требуют CSRF.
- Оба logout endpoint очищают access + CSRF + refresh cookies.
- Revoked/expired access и refresh sessions отклоняются.

### Несоответствие

Общее правило `cookie-authenticated unsafe requests require a matching CSRF token` теперь слишком широкое: `POST /auth/refresh` использует HttpOnly refresh cookie, `@PublicAccess()` и не вызывает `assertValidCsrf()`.

### Что изменить

Ограничить CSRF-формулировку cookie-based logout/logout-all, добавить current-state note для refresh cookie (`SameSite=lax`, path `/api/v1/auth/refresh`) и явно пометить historical scope PR 121.

---

## 9. `CI_AUDIT_BASELINE.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- `CI`, `CodeQL`, `Staging smoke` и Dependabot configs существуют и в основном соответствуют документу.
- CI запускается на PR и push в `main`, job `Checks` имеет timeout 15 минут.
- CI использует `postgres:16-alpine` и выполняет Gitleaks, frozen install, audit/waivers, lint, Prisma generate, typecheck, coverage, migrations/integration, build, browser E2E, accessibility, visual tests, Docker builds и Trivy.
- CodeQL — отдельный JS/TS workflow с `security-extended`.
- Semgrep workflow отсутствует.

### Несоответствие

Branch protection больше не `[НЕ ПРОВЕРЕНО]`: GitHub branch state для `main` возвращает `protected: false`, protection disabled, required status checks enforcement `off`. CI выполняется, но GitHub branch settings не требуют успешных checks перед merge.

### Что изменить

Зафиксировать фактическое отсутствие branch protection, отделить наличие CI workflows от enforceability и обновить дату/источники проверки.

---

## 10. `CONCERNS.md`

**Статус:** ⚠️ существенно требует ревизии.

`CONCERNS.md` задуман как живой реестр открытых технических и продуктовых рисков, но часть записей больше не отражает текущий `main`. Проверка выполнена по текущему коду, тестам, migrations, `MVP_SCOPE_LOCK.md`, истории релевантных файлов и уже подтверждённому PR #513.

### Open concerns, которые остаются актуальными

1. **`CourseAccessPolicy.assertResourceAccess()` выполняет два последовательных DB lookup для nested `attempt` / `question`.** Первый запрос получает `courseId`, затем `assertCourseAccess()` выполняет отдельный `course.findFirst`. Concern остаётся корректным как low-priority optimization.

2. **Ручные timestamp migration names.** Миграции `20260731120000_add_course_instructors` и `20260731150000_add_manager_team_scope` по-прежнему существуют. Риск коллизии/неожиданного порядка — процедурный, а не воспроизведённая ошибка; запись можно оставить как 🟢 preventive concern, но не формулировать как установленный defect.

3. **`roles.spec.ts` содержит вручную поддерживаемый список policy names.** Это подтверждено: тест не итерирует автоматически `Object.keys(rolePolicies)`. Риск drift остаётся. При этом исходная более широкая формулировка concern устарела: `api-policy.audit.spec.ts` сейчас не только проверяет наличие `@Roles()`, а также выполняет `RolesGuard` для всех четырёх ролей и сверяет allow/deny с metadata. Поэтому concern нужно сузить именно до manual policy inventory в `roles.spec.ts`.

4. **Отсутствует явное startup warning для осознанного in-memory rate-limit режима.** Код разрешает production без `REDIS_URL` только при `ALLOW_IN_MEMORY_RATE_LIMIT=true`, но concern о том, что такой режим должен явно логироваться при startup, остаётся архитектурно обоснованным.

5. **`createCourse` + автоматическое назначение instructor не атомарны.** В `CoursesController.createCourse()` сначала вызывается `coursesService.createCourse()`, затем отдельно `courseAccess.assignInstructor()`. Общей транзакции нет; при второй ошибке курс может остаться созданным без ожидаемого assignment.

6. **Login возвращает access token и в HttpOnly cookie, и в JSON body.** `AuthController.login()` устанавливает auth cookies, но также возвращает `accessToken` в response body. Concern актуален: это уменьшает практическую пользу HttpOnly-only storage model и должно быть осознанным контрактом либо исправлено.

7. **Generic Notifications и Audit Log для MVP отсутствуют.** `MVP_SCOPE_LOCK.md` по-прежнему отмечает Notifications и Audit Log как не реализованные и относящиеся к MVP readiness. Отдельный file-deletion audit не заменяет общий продуктовый Audit Log.

### Open concerns, которые устарели и должны быть закрыты/перенесены

1. **Frontend function coverage 25% / 25.6% margin — устарело.** Текущий `apps/web/vitest.config.ts` задаёт глобальные thresholds `40` для statements/branches/functions/lines и отдельный threshold `80` для `assessment-taking/model.ts`. Старую запись про 25% следует перенести в Closed или заменить текущим coverage risk, если новый фактический процент снова близок к 40. `[НЕ ПРОВЕРЕНО]` Текущий фактический coverage percentage в этом шаге не запускался.

2. **Instructor видит все курсы организации — устарело.** `CoursesController.listCourses()` определяет instructor-only user и передаёт `instructorId`; `CoursesService.listCourses()` фильтрует через active `CourseInstructor` relation. Frontend действительно вызывает общий `listCourses()`, но серверная выборка уже owner-scoped. Concern следует закрыть.

3. **Password reset silently returns 200 — устарело.** Endpoint остаётся не реализован функционально, но `AuthService.requestPasswordReset()` и `confirmPasswordReset()` теперь выбрасывают `ServiceUnavailableException`; ложного успешного 200 больше нет. Concern следует закрыть и при необходимости заменить отдельным backlog item «password reset unavailable».

4. **429 имеет нестандартный raw JSON envelope — устарело.** `api-hardening.ts` теперь формирует 429 через `createApiErrorResponse(...)`, то есть использует канонический API error envelope. Concern следует закрыть.

5. **Flaky E2E refresh-flow concern — закрыт PR #513.** Причиной была race window между заменой access cookie и регистрацией network observers. Исправление останавливает уже смонтированное приложение через `about:blank` перед cookie mutation; PR #513 слит в `main`, последующий CI на `main` прошёл успешно. Open entry нужно перенести в Closed с фактической причиной и PR.

6. **Custom role builder как открытый MVP product question — устарело.** `MVP_SCOPE_LOCK.md` прямо фиксирует fixed roles как MVP simplification и относит `custom roles builder` к out-of-MVP. Поэтому вопрос «нужна ли кнопка Создать роль?» для MVP уже решён: нет. Отдельный вопрос о цветном badge остаётся только низкоприоритетным UI/design concern, если нейтральное отображение не принято окончательно.

### Concerns, текущий production-статус которых нельзя подтвердить только GitHub

1. **Redis в Railway production.** Код подтверждает поддержку Redis и явного in-memory fallback, но утверждения `Redis service отсутствует`, `REDIS_URL отсутствует`, `ALLOW_IN_MEMORY_RATE_LIMIT=true в live production` требуют чтения текущих Railway services/env. **[НЕ ПРОВЕРЕНО]** в рамках GitHub-only аудита.

2. **S3/R2/MinIO production configuration.** Код и `STORAGE_UPLOAD_STATUS.md` подтверждают реализованный private S3-compatible storage contract, multipart/quarantine flow и обязательные S3 env vars. При этом `CONCERNS.md` утверждает, что production storage не provisioned, а `MVP_SCOPE_LOCK.md` одновременно говорит `Files ✅` и упоминает MinIO on Railway. Это внутреннее противоречие документации. **[НЕ ПРОВЕРЕНО]** фактическое текущее Railway storage service/env; требуется live infrastructure check и затем синхронизация документов.

3. **Admin sidebar при 150%+ browser zoom.** История `admin.css` подтверждает PR #492, который ограничивал horizontal overflow, но сам concern утверждает, что 2-column layout после этого сохранился. Более позднего явно направленного fix по истории файла не найдено. **[НЕ ПРОВЕРЕНО]** текущее визуальное воспроизведение в Chromium в рамках этого шага; concern нельзя закрыть только по коду.

### Closed concerns в документе

- Старый concern о coverage ниже прежнего 25% threshold исторически корректно закрыт, но сам threshold уже поднят до 40%; closed note стоит дополнить новой конфигурацией.
- Concern про `@Optional() sessionStore` как причину неработающего logout-all остаётся корректно закрытым: текущая реализация использует Prisma-backed Session store.
- Concern «Redis unavailable => fail-open без rate limiting» остаётся корректно закрытым: при ошибке Redis middleware переключается на local degraded store и продолжает применять limits.

### Что изменить

1. Перенести в Closed как минимум устаревшие open entries: coverage 25%, instructor all-courses, password-reset false 200, raw 429 envelope, E2E refresh flake, custom-role MVP question.
2. Переписать RBAC testing concern: убрать утверждение, что central audit не проверяет guard behavior; оставить риск ручного списка policy names в `roles.spec.ts`.
3. Разделить operational concerns Redis и storage на `code/config ready` и `live infrastructure status`; live status обновлять только после реальной проверки Railway.
4. Явно отметить конфликт `CONCERNS.md` ↔ `MVP_SCOPE_LOCK.md` по production storage и устранить его после live verification.
5. Сохранить актуальными concerns про nested ownership double-query, migration naming process, explicit in-memory startup warning, non-transactional course creation/assignment, access token in JSON body и отсутствие Notifications/Audit Log.
6. Для zoom/sidebar concern добавить дату последнего реального browser reproduction или закрывающий PR; без такой проверки не считать его ни закрытым, ни подтверждённым текущим дефектом.

### Итог

`CONCERNS.md` полезен как журнал истории рисков, но сейчас его раздел Open смешивает: действительно открытые проблемы, уже закрытые кодом проблемы, исторические product questions и неподтверждённые live-infrastructure assertions. Документ требует существенной сортировки, чтобы Open снова означал только фактически актуальные и проверяемые concerns.

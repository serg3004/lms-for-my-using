# Аудит актуальности документации

## Назначение

Последовательная проверка документов в `docs/` на соответствие текущему состоянию `main`.

Исключены:
- `docs/lms-ui-prototypes-complete/`;
- `docs/master-context/`;
- `.gitkeep`.

## Сводка

| № | Документ | Статус | Итог |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ Актуален | Изменения не требуются |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ Частично актуален | Уточнить baseline verification либо расширить реализацию |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ Частично актуален | Обновить visibility, пути, backend pattern и bootstrap-инструкции |
| 4 | `API_CONTRACTS.md` | ⚠️ Частично актуален | Runtime contract в основном актуален; manual OpenAPI не синхронизирован полностью |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ Частично актуален | Role matrix актуальна; исправить public inventory и количество course-scoped controllers |
| 6 | `ARCHITECTURE_MODULE_BOUNDARIES.md` | ⚠️ Частично актуален | API-границы в основном актуальны; Web/feature и docs-only CI правила требуют обновления |

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
- На момент проверки CI run #1242 и его accessibility step завершились `success`.

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
Обновить visibility/пути, требовать следовать существующей структуре конкретного модуля, заменить DTO-specific правило на существующий механизм валидации, пометить bootstrap как исторический и явно задать приоритет current code/config + root docs над master-context drafts.

### [НЕ ПРОВЕРЕНО]
Полный security/RBAC тезис starter prompt здесь отдельно не проверялся.

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

### Проверено
- high-level структура API/Web/infra;
- фактический список API modules;
- `AppModule` wiring;
- database boundary;
- frontend `app`, `shared`, `shared/api`, `features`, `i18n`, `styles`;
- пример реального page→feature→shared dependency direction;
- применимость универсального API module ownership rule;
- docs-only testing guidance против фактического CI.

### Подтверждённые факты
- Пути `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/common`, `config`, `database`, `modules`, `apps/api/prisma/schema.prisma`, `apps/web/src/app`, `shared`, `shared/api`, `i18n`, `styles`, `docs` и `infra` существуют.
- Список из 20 API module directories в документе соответствует текущему `apps/api/src/modules/`: assessment-attempts, assessment-questions, assessments, assignments, auth, certificates, course-access, course-materials, courses, groups, health, lessons, manager, manager-team-scope, memberships, openapi, organizations, progress, upload, users.
- `apps/api/src/app.module.ts` явно импортирует runtime modules, включая `DatabaseModule`, `CourseAccessModule` и перечисленные domain/support modules.
- Database boundary соответствует текущему устройству: `apps/api/src/database/` содержит `DatabaseModule` и `PrismaService`, а schema находится в `apps/api/prisma/schema.prisma`.
- Frontend API boundary существует в заявленном виде: `apps/web/src/shared/apiClient.ts` является low-level client, а `apps/web/src/shared/api/*` содержит domain wrappers/types.
- `AdminUsersPage.tsx` подтверждает допустимое направление зависимостей: page в `app` импортирует shared UI/form helpers и feature-specific код из `features/admin-users`.
- `infra/` действительно содержит `docker`, `nginx` и `railway`.

### Несоответствия

1. **High-level Web structure неполна: отсутствует `apps/web/src/features`.** Документ описывает текущую Web-структуру как `app` + `shared` + `i18n` + `styles` и называет приложение page-oriented. В текущем репозитории уже существует `apps/web/src/features/admin-users/` с UI-компонентами, hooks, model, mappers и validation, а `AdminUsersPage.tsx` активно импортирует этот feature. Значит фактическая архитектура уже гибридная: page composition остаётся в `app`, но часть feature-specific reusable logic/components живёт в `features`.

2. **`app` владеет не только page-level composition.** Внутри `apps/web/src/app/` существуют domain/feature subdirectories (`admin-assignments`, `admin-courses`, `admin-lessons`, `admin-org-structure`, `assessment-builder`, `assessment-taking`, `course-builder`, `materials`) с models/hooks/components. Текущая таблица ответственности этого не отражает. Это не обязательно архитектурная ошибка кода, но документ как карта текущих boundaries неполон.

3. **Универсальное правило для каждого API domain module слишком широкое.** Документ говорит, что каждый API domain module должен владеть controller routes, service logic, request validation schemas, module wiring и tests. Однако в этом же списке находятся support/policy modules. `course-access` содержит guard/module/policy/tests и не владеет controller routes/request schemas; `manager-team-scope` содержит module/scope/tests и также не владеет собственным HTTP controller. Следовательно, документу нужно различать route-owning domain modules и cross-cutting/support policy modules.

4. **Docs-only testing guidance не соответствует фактическому CI.** В таблице `Testing boundary` для `Docs-only policy` указано, что code checks не требуются, если не enforced docs linting. Но `.github/workflows/ci.yml` запускается на каждом pull request без path filters и выполняет dependency audit, lint, Prisma generate, typecheck, coverage tests, migrations/integration tests, build, Browser E2E, accessibility, visual tests, Docker builds и image scans даже для docs-only PR. Текущий PR #512 это фактически подтвердил: docs-only коммиты запускают полный CI.

### Что изменить

1. Добавить `apps/web/src/features` в high-level structure и описать его boundary: feature-specific reusable UI/hooks/model/validation, используемые page composition из `app`.
2. Уточнить Web architecture как гибридную: `app` владеет routes/pages/top-level composition, а feature-specific logic может находиться либо в исторических `app/<feature>` subdirectories, либо в `features/<feature>`; желательно зафиксировать предпочтительный target pattern для новых изменений.
3. Разделить API modules как минимум на route-owning domain modules и support/policy modules. Для support modules не требовать controller/service/request schemas, если их ответственность — guard/policy/query-scope infrastructure.
4. Переписать docs-only testing rule: локальные code checks могут быть необязательны для чистого docs change, но repository CI всё равно запускает полный `CI` workflow на PR; итоговый статус должен учитывать эти обязательные checks.
5. Если `features/` является началом целевого frontend refactor, обновить non-goals/placement rules так, чтобы они не противоречили уже существующей структуре и не провоцировали новые параллельные patterns без явного решения.

### Итог

API/database/import boundaries документа в основном соответствуют текущему репозиторию. Основное устаревание относится к frontend structure: документ не учитывает появившийся `features/` boundary и существующие feature-specific subdirectories внутри `app`. Дополнительно требуется уточнить типы API modules и привести docs-only testing guidance к фактическому обязательному CI.

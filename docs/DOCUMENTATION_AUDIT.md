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
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ Частично актуален | Уточнить, что verification проверяет baseline subset, либо расширить реализацию |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ Частично актуален | Обновить visibility, пути, backend pattern и bootstrap-инструкции |
| 4 | `API_CONTRACTS.md` | ⚠️ Частично актуален | Runtime contract в основном актуален; manual OpenAPI не синхронизирован полностью |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ Частично актуален | Role matrix актуальна; исправить public inventory и количество course-scoped controllers |

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
Полный security/RBAC тезис starter prompt здесь не проверялся отдельно.

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

### Проверено
- non-role endpoint classifications;
- централизованные `rolePolicies`;
- fail-closed поведение `RolesGuard`;
- API policy audit test;
- instructor course ownership guard/policy;
- manager team-scope implementation;
- соответствие таблицы текущим policy arrays.

### Подтверждённые факты
- `apps/api/src/modules/auth/roles.ts` содержит те же основные policy→role mappings, что и таблица: organizations, users, memberships, groups, courses, lessons, materials, assignments, progress, assessments, questions/options, attempts/results, certificates, theme settings и manager team summary.
- `RolesGuard` выбрасывает `ForbiddenException('Missing role policy')`, если role metadata отсутствует; это подтверждает fail-closed поведение для role-protected handlers.
- `api-policy.audit.spec.ts` рекурсивно сравнивает production `*.controller.ts` с явным inventory и требует для каждого HTTP handler ровно одну классификацию: roles либо `public/authenticated`. Для role handlers тест также проверяет наличие `RolesGuard` и выполняет guard для всех четырёх ролей, сверяя allow/deny с metadata.
- `roles.spec.ts` действительно использует вручную поддерживаемый список audited policies и не перебирает автоматически каждый ключ `rolePolicies`; комментарий документа о best-effort mirror корректен.
- `CourseAccessGuard`/`CourseAccessPolicy` ограничивают instructor-only users назначенными курсами; admin bypass определяется как наличие `admin`, даже если у пользователя также есть `instructor`.
- `CourseAccessPolicy` для ненайденного/непринадлежащего instructor ресурса выбрасывает `NotFoundException`, что соответствует заявленному 404 вместо 403.
- `ManagerService.getTeamSummary()` применяет `ManagerTeamScope` прямо в Prisma query через `teamScope.user(actor)`, поэтому утверждение о query-level manager team scope подтверждается.
- Theme settings в `OrganizationsController` используют `themeSettingsRead` для GET и `themeSettingsWrite` для PATCH/DELETE/logo upload; policy roles совпадают с матрицей.

### Несоответствия

1. **Неполный список Public endpoints.** В разделе `Non-role endpoints` перечислены health, OpenAPI, organization registration, login, refresh и password-reset. Однако `apps/api/src/modules/course-materials/material-malware-scan.controller.ts` содержит `POST /internal/material-scans/:id/result` с `@PublicAccess()`. Endpoint не использует обычный user auth/RBAC и потому попадает в ту же access classification `public`, хотя отдельно защищён callback secret через `verifyCallbackSecret()`.

2. **Неверное количество course-scoped controllers.** Документ говорит, что `CourseAccessGuard` применяется "on 8 controllers", но тут же перечисляет: `courses`, `lessons`, `course-materials`, `assessments`, `assessment-questions`, `assessment-attempts`, `assignments`, `progress`, `certificates` — это **9** контроллеров. Даже без изменения списка число `8` математически неверно.

### Что изменить

1. В `Non-role endpoints` добавить internal malware-scan callback как `PublicAccess` endpoint и рядом явно пояснить, что он не является открытым безусловно: доступ проверяется отдельным callback Authorization secret, а не user auth/RBAC.
2. Исправить `8 controllers` на `9 controllers` в разделе object-level scope. Если список wiring в коде изменится, предпочтительно формулировать без хрупкого счётчика либо генерировать/проверять это число тестом.

### Итог

Централизованная role matrix и основные enforcement-механизмы документа соответствуют текущему коду. Документ требует двух точечных исправлений: дополнить public access inventory внутренним malware-scan callback и исправить количество перечисленных course-scoped controllers с 8 на 9.

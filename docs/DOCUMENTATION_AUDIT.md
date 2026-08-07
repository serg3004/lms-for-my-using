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
| 11 | `CSS_ARCHITECTURE.md` | ⚠️ Частично актуален | CSS layers/checks актуальны; уточнить single-entry формулировку и фактическое Stylelint ID-правило |
| 12 | `DEAD_CODE_AUDIT.md` | ⚠️ Исторический snapshot | Методика ценна, но findings и limitations нужно пересчитать по текущему `main` |

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

`CONCERNS.md` задуман как живой реестр открытых технических и продуктовых рисков, но часть записей больше не отражает текущий `main`.

### Open concerns, которые остаются актуальными

1. `CourseAccessPolicy.assertResourceAccess()` выполняет два последовательных DB lookup для nested `attempt` / `question`.
2. Ручные timestamp migration names остаются процедурным preventive concern.
3. `roles.spec.ts` содержит вручную поддерживаемый список policy names; риск drift остаётся.
4. Отсутствует явное startup warning для осознанного in-memory rate-limit режима.
5. `createCourse` + автоматическое назначение instructor не атомарны.
6. Login возвращает access token и в HttpOnly cookie, и в JSON body.
7. Generic Notifications и Audit Log для MVP отсутствуют.

### Open concerns, которые устарели

- Frontend coverage 25%: текущие global thresholds уже 40%.
- Instructor all-courses: server-side list фильтруется через active `CourseInstructor`.
- Password reset false 200: теперь `ServiceUnavailableException`.
- Raw 429 envelope: теперь `createApiErrorResponse(...)`.
- Flaky E2E refresh-flow: закрыт PR #513.
- Custom role builder как MVP question: `MVP_SCOPE_LOCK.md` фиксирует его как out-of-MVP.

### [НЕ ПРОВЕРЕНО]

Live Railway status для Redis/storage и визуальное воспроизведение sidebar при 150%+ zoom требуют внешней проверки.

### Что изменить

Пересортировать Open/Closed, сузить RBAC concern, отделить code/config readiness от live infrastructure status и устранить конфликт документов по production storage после live verification.

---

## 11. `CSS_ARCHITECTURE.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено

- `apps/web/src/styles/index.css` — единая точка импорта application-owned stylesheets.
- `index.css` объявляет canonical cascade layers и импортирует каждый stylesheet из `src/styles` ровно один раз в named layer.
- `check-css-architecture.mjs` проверяет layer order, imports, token ownership и unique custom-property definitions.
- Runtime theme меняет root token variables через `document.documentElement.style.setProperty(...)`.
- `lint:css` запускает Stylelint и architecture guard.
- CSS bundle budget — 80 KiB и проверяется после build.
- Playwright visual-regression gate присутствует в CI.

### Несоответствия и уточнения

1. `main.tsx` отдельно импортирует `@fontsource-variable/manrope/wght.css`, поэтому single-entry утверждение буквально верно только для application-owned CSS.
2. `selector-max-id: 1` разрешает любой один ID в selector и не ограничивает его `#root`.
3. Architecture guard не анализирует TS/TSX imports, поэтому запрет direct component CSS imports сейчас является convention, а не полным fail-closed enforcement.
4. Требование объяснять изменение 80 KiB budget в PR — human review policy, а не автоматическая проверка.

### Что изменить

Уточнить single-entry scope, буквально описать Stylelint ID rule, разделить architecture convention и machine enforcement для CSS imports и отделить numeric bundle gate от PR review policy.

---

## 12. `DEAD_CODE_AUDIT.md`

**Статус:** ⚠️ исторический snapshot; как current dead-code inventory не актуален.

### Проверено

- базовый commit и встроенное предупреждение об устаревании;
- оба перечисленных dead-code candidate;
- текущие layout/logout реализации;
- текущий API TypeScript/NodeNext build contract;
- `vite-env.d.ts`;
- E2E dependency, typecheck script и недавний CI status;
- ограничения методики.

### Подтверждённые факты

- Сам документ корректно сообщает, что исходный аудит выполнен 2 августа 2026 на commit `76edd162e56e2f485d069724c567501309f2cc06` и 6 августа был явно помечен как устаревшая база. Поэтому его findings уже заявлены как snapshot, а не гарантированное описание текущего `main`.
- `apps/web/src/vite-env.d.ts` по-прежнему существует и содержит ambient reference `vite/client`; его классификация как не-мёртвого declaration file остаётся корректной.
- `apps/api/src/modules/auth/auth.cookies.js` по-прежнему существует и содержит только `export * from './auth.cookies.ts';`.
- `apps/api/tsconfig.json` использует `module/moduleResolution: NodeNext`, включает только `src/**/*.ts` и не включает исходные `.js` файлы. `apps/api/package.json` запускает production через `node dist/main.js`. Эти факты по-прежнему поддерживают исходный вывод, что source `auth.cookies.js` не требуется TypeScript build/runtime и выглядит лишним compatibility adapter.
- `apps/web/src/app/LogoutButton.tsx` по-прежнему существует, но ситуация изменилась: с commit `88b23cf3` от 3 августа существует `LogoutButton.spec.tsx`, который напрямую импортирует и тестирует компонент. Поэтому утверждение документа «не импортируется ни одним файлом приложения или теста» больше неверно.
- Production layouts всё ещё не переиспользуют `LogoutButton`: проверенные `learnerLayout.tsx`, `managerLayout.tsx`, `instructorLayout.tsx` и `adminPage.tsx` импортируют `shared/logout.ts` и реализуют собственный handler/button. Это поддерживает вывод, что `LogoutButton.tsx` может оставаться **неиспользуемым production component**, хотя теперь он уже не является файлом без входящих ссылок вообще.
- Старое ограничение про E2E typecheck, который не находит `@axe-core/playwright`, больше не соответствует текущему workspace: `apps/e2e/package.json` объявляет `@axe-core/playwright` `4.12.1` и `typecheck: tsc --noEmit`; корневой `pnpm typecheck` идёт через Turbo и недавний полный CI #1256 завершился `success`. Следовательно, старую dependency-resolution проблему нельзя оставлять как current limitation.

### Несоответствия

1. **Candidate `LogoutButton.tsx` описан устаревшим способом.** Он больше не «без входящих ссылок»: его импортирует `LogoutButton.spec.tsx`. Если задача — найти именно production-dead code, формулировку нужно изменить на «не используется runtime/application composition, но имеет unit tests» и повторно подтвердить полный import graph на текущем `main`.

2. **Раздел `Ограничения и следующий шаг` содержит уже устранённую E2E dependency-проблему.** `@axe-core/playwright` сейчас присутствует в E2E package, а полный CI/typecheck проходит. Это историческое ограничение нужно либо датировать состоянием snapshot, либо удалить из current guidance.

3. **Документ не является текущим пересчётом dead code.** Встроенное предупреждение это честно признаёт, но дальнейший imperative `Что сделать: удалить файл` может быть воспринят как current action. После значительного количества последующих PR такие действия должны выполняться только после нового полного static/import audit.

4. **Knip по-прежнему не является доказанным current source of truth.** Исторический запуск был заблокирован `403`, а в текущем репозитории Knip не добавлен как штатная dependency/script. Нельзя утверждать, что современный full dead-code scan выполнен автоматически.

### Что изменить

1. Лучше сохранить файл как **historical dead-code audit snapshot**: перенести предупреждение прямо под заголовок и явно написать, что секции `Найденные кандидаты` не являются текущими инструкциями к удалению.
2. Для `LogoutButton.tsx` обновить статус: есть unit test, но проверенные production layouts по-прежнему реализуют logout отдельно; перед удалением нужен новый full import-graph check на текущем `main`.
3. Для `auth.cookies.js` отметить, что текущий NodeNext/tsconfig/start:prod contract всё ещё поддерживает его удаление как кандидата, но само удаление должно выполняться отдельным code PR с lint/typecheck/tests/build.
4. Удалить или исторически датировать limitation про отсутствующий `@axe-core/playwright`, поскольку текущий E2E workspace и CI его больше не подтверждают.
5. Если проекту нужен **current** dead-code baseline, провести новый отдельный пересчёт: lint + typecheck с unused flags, current import graph, package exports/entrypoints и специализированный scanner при доступности. Не переносить findings snapshot 2026-08-02 автоматически.

### [НЕ ПРОВЕРЕНО]

- Полный текущий граф относительных/alias/dynamic imports для всего workspace в рамках этого документационного шага заново не строился.
- Knip или аналогичный специализированный dead-code scanner на текущем `main` не запускался.
- Поэтому `LogoutButton.tsx` и `auth.cookies.js` здесь подтверждены как **кандидаты для повторной проверки**, а не как безопасные к удалению файлы в рамках текущего PR.

### Итог

Документ полезен как исторический журнал методики и состояния на 2 августа 2026 и уже содержит корректное предупреждение об устаревании. Однако текущие детали разошлись: `LogoutButton` получил тест, E2E dependency limitation исчезла, а полный scan после десятков PR не повторялся. Файл следует либо окончательно позиционировать как historical snapshot, либо полностью пересчитать на текущем `main` перед использованием его рекомендаций.

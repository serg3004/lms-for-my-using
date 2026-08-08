# Аудит актуальности документации

## Назначение

Последовательная проверка документов в `docs/` на соответствие текущему `main`.

Исключены:
- `docs/lms-ui-prototypes-complete/`;
- `docs/master-context/`;
- `.gitkeep`.

Статусы: ✅ актуален; ⚠️ частично актуален/исторический; ❌ устарел. Неподтверждённые live/операционные утверждения помечаются `[НЕ ПРОВЕРЕНО]`.

## Сводка

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ | Соответствует тестам и CI |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ | Verification проверяет baseline subset, а не весь demo dataset |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ | Устарели visibility, пути, backend pattern и bootstrap |
| 4 | `API_CONTRACTS.md` | ⚠️ | Runtime contract в основном актуален; manual OpenAPI неполон |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ | Role matrix актуальна; public inventory и count требуют правки |
| 6 | `ARCHITECTURE_MODULE_BOUNDARIES.md` | ⚠️ | Web structure и docs-only CI guidance отстали от кода |
| 7 | `AUTH_SESSION_STORE_DESIGN.md` | ⚠️ historical | PR 120 snapshot; current Session расширена refresh state |
| 8 | `AUTH_TOKEN_REVOCATION.md` | ⚠️ | Logout/revocation актуальны; универсальное CSRF-правило уже неверно |
| 9 | `CI_AUDIT_BASELINE.md` | ⚠️ | CI baseline актуален; `main` branch protection выключена |
| 10 | `CONCERNS.md` | ⚠️ | Open смешивает актуальные, закрытые и неподтверждённые concerns |
| 11 | `CSS_ARCHITECTURE.md` | ⚠️ | Layers/checks актуальны; нужны точные формулировки enforcement |
| 12 | `DEAD_CODE_AUDIT.md` | ⚠️ historical | Findings нужно пересчитать по current `main` |
| 13 | `DEPENDABOT_PNPM_WORKSPACE_POLICY.md` | ⚠️ | Dependabot scope не охватывает E2E/shared manifests |
| 14 | `DEPENDENCY_UPDATE_POLICY.md` | ⚠️ | Основные правила верны; ownership/verification/non-goals отстали от workspace |
| 15 | `DEPLOY_FOUNDATION.md` | ⚠️ | Railway mechanics актуальны; staging/storage/follow-up sections расходятся с current docs |
| 16 | `DEVELOPMENT_PLAN.md` | ⚠️ historical/current mix | Полезный implementation ledger, но статусы и PR-нумерация не являются надёжным current roadmap |
| 17 | `FRONTEND_COVERAGE_ROADMAP.md` | ⚠️ | Stage 1 gate актуален; универсальный 80% rule не machine-enforced |
| 18 | `FRONTEND_MVP_MAINTAINABILITY_AUDIT.md` | ⚠️ | Hotspot page sizes актуальны; risk methodology и production-status claims требуют уточнения |
| 19 | `I18N_GUIDE.md` | ⚠️ | Core locales/db/API верны; locale persistence, hardcoded-text rule, formatting и notifications описаны сильнее текущей реализации |
| 20 | `INSTRUCTOR_COURSE_OWNERSHIP.md` | ⚠️ | Core ownership/scoping актуальны; assignment write-path не проверяет instructor role |

---

## 1. `ACCESSIBILITY.md`

**Статус:** ✅ актуален.

### Подтверждено
- `pnpm test:a11y` существует и использует accessibility Playwright config.
- Axe tags соответствуют WCAG 2.1 A/AA; gate фильтрует `critical`/`serious`.
- Проверяются public/login и workspace ролей admin/manager/instructor/learner.
- Keyboard tests покрывают skip navigation, language menu, login, mobile navigation, focus restore.
- CI содержит обязательный `Accessibility baseline` без `continue-on-error`.

### Несоответствия
Не обнаружены.

### Что изменить
Ничего.

---

## 2. `ADMIN_DEMO_SEED.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- `pnpm --filter @lms/api admin:demo-seed` существует.
- Dry-run по умолчанию; apply требует explicit environment/database confirmations.
- Production guard требует `--allow-demo-environment`.
- Apply + post-seed verification выполняются внутри `Prisma.$transaction`.
- Прямой Prisma seed направлен через guarded path.
- Database target не логирует username/password/full URL.

### Несоответствие
`findMissingDemoData()` проверяет baseline subset: organization, admin, learner, course, 3 lessons, assignment, assessment и 5 questions. Seed создаёт также manager, instructor, memberships, groups, materials, progress, answer options и др.

### Что изменить
Либо явно назвать verification baseline subset, либо расширить `findMissingDemoData()` до полного demo dataset.

---

## 3. `AI_AGENT_STARTER_PROMPT.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
Стек соответствует NestJS/Prisma + React/Vite + pnpm workspace; Docker Compose находится в `infra/docker`; master-context — в `docs/master-context`.

### Несоответствия
- Репозиторий описан private, фактически public.
- Пути к `01_LMS_...`—`23_LMS_...` должны указывать `docs/master-context/...`.
- Требование `module/controller/service/repository` не соответствует фактическим модулям вроде `courses`.
- DTO-only формулировка не учитывает Zod schemas.
- Bootstrap предлагает создавать уже существующие monorepo/API/Web/Prisma/Docker/health/CI.
- Нет приоритета current code/root docs над historical master-context.

### Что изменить
Обновить visibility/пути, следовать существующему module pattern, обобщить validation rule и пометить bootstrap/master-context как historical/reference.

---

## 4. `API_CONTRACTS.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- `/api/v1`, error envelope, pagination defaults/max и основные auth/health routes соответствуют коду.
- Redis rate-limit store поддерживается через `REDIS_URL`; production in-memory fallback требует explicit flag.
- Runtime OpenAPI endpoint — `GET /api/v1/openapi`.

### Несоответствие
`openapi.document.ts` не синхронизирован со всеми runtime routes: отсутствуют `/health/live`, `/health/ready`, `POST /auth/refresh`, `GET /manager/team-summary` и ряд update/status/subresource endpoints. Manual document объявляет `/openapi.json`, runtime controller — `/api/v1/openapi`.

### Что изменить
Либо назвать manual OpenAPI partial skeleton, либо полноценно синхронизировать его с runtime API.

### [НЕ ПРОВЕРЕНО]
Live production URL и фактическое Railway/Redis состояние.

---

## 5. `API_RBAC_MATRIX.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
`rolePolicies`, fail-closed `RolesGuard`, API policy audit, instructor ownership guard/policy и manager query scope соответствуют коду.

### Несоответствия
- Public inventory не содержит `POST /internal/material-scans/:id/result` с `@PublicAccess()`; endpoint защищён отдельным callback secret.
- Документ говорит о 8 course-scoped controllers, но перечисляет 9.

### Что изменить
Добавить malware-scan callback с пояснением machine-to-machine secret protection и исправить count/убрать хрупкий счётчик.

---

## 6. `ARCHITECTURE_MODULE_BOUNDARIES.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
Основные API/database paths, modules, shared API boundary и `infra/{docker,nginx,railway}` актуальны.

### Несоответствия
- Не описан `apps/web/src/features`; `features/admin-users` уже полноценный feature boundary.
- `apps/web/src/app` содержит не только pages, но и feature/domain subdirectories.
- Универсальное правило «каждый API module имеет controller/service/schema» не подходит support/policy modules (`course-access`, `manager-team-scope`).
- Docs-only testing guidance расходится с CI: PR без path filters запускает полный workflow.

### Что изменить
Описать гибрид `app/pages + features + shared`, различать route-owning и support modules, привести docs-only guidance к реальному CI.

---

## 7. `AUTH_SESSION_STORE_DESIGN.md`

**Статус:** ⚠️ исторически корректен, частично актуален как current design.

### Подтверждено
PR 120 ввёл `sessions`, access validation по `jti`/revocation/expiry и logout revocation. Поздняя migration добавила `refresh_token_hash` и `refresh_expires_at`; login хранит SHA-256 hash refresh token, raw token в БД не хранится.

### Несоответствия
Основные разделы продолжают описывать старую Session model и login lifecycle, а current refresh state отражён только поздней вставкой.

### Что изменить
Предпочтительно сохранить документ как historical PR 120 snapshot и сослаться на current refresh/session design; альтернатива — полностью обновить модель/lifecycle.

### [НЕ ПРОВЕРЕНО]
Исторические staging assertions PR 120.

---

## 8. `AUTH_TOKEN_REVOCATION.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
Logout/logout-all, tenant isolation, idempotency, bearer behavior, cookie clearing и revoked-session checks соответствуют текущему коду.

### Несоответствие
Правило `cookie-authenticated unsafe requests require a matching CSRF token` слишком широкое: `POST /auth/refresh` использует HttpOnly refresh cookie и не вызывает `assertValidCsrf()`.

### Что изменить
Ограничить CSRF rule logout/logout-all, описать refresh cookie (`SameSite=lax`, path `/api/v1/auth/refresh`) и historical scope PR 121.

---

## 9. `CI_AUDIT_BASELINE.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
CI, CodeQL, staging-smoke, Dependabot, Postgres service, Gitleaks, frozen install, audit/waivers, lint/typecheck/tests/build, E2E/a11y/visual, Docker builds и Trivy соответствуют workflow-файлам. Semgrep workflow отсутствует.

### Несоответствие
GitHub возвращает для `main` `protected: false`, protection disabled, required status checks enforcement `off`. Branch protection подтверждённо выключена.

### Что изменить
Зафиксировать отсутствие branch protection и отделить наличие checks от их обязательности перед merge.

---

## 10. `CONCERNS.md`

**Статус:** ⚠️ существенно требует ревизии.

### Актуальные concerns
- manual policy inventory в `roles.spec.ts`;
- startup warning для intentional in-memory rate-limit режима;
- access token одновременно в HttpOnly cookie и JSON body;
- Notifications/Audit Log отсутствуют.

### Устаревшие/закрытые concerns
- frontend coverage 25% — thresholds уже 40%;
- instructor all-courses — server list scoped через `CourseInstructor`;
- password reset false 200 — теперь `ServiceUnavailableException`;
- raw 429 envelope — теперь canonical API error response;
- flaky refresh E2E — закрыт PR #513;
- custom role builder как MVP question — out-of-MVP;
- nested ownership double-query и non-transactional create+assignInstructor исправлены PR #515 и должны быть перенесены в Closed.

### [НЕ ПРОВЕРЕНО]
Live Railway status Redis/storage и sidebar 150%+ zoom.

### Что изменить
Пересортировать Open/Closed, отделить code/config readiness от live infrastructure status и обновить entries после PR #515.

---

## 11. `CSS_ARCHITECTURE.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
`src/styles/index.css`, cascade layers, centralized tokens, architecture guard, Stylelint, 80 KiB CSS budget и Playwright visual regression соответствуют проекту.

### Несоответствия/уточнения
- `main.tsx` отдельно импортирует `@fontsource-variable/manrope/wght.css`; single-entry rule верен только для application-owned CSS.
- `selector-max-id: 1` разрешает любой один ID, а не только `#root`.
- Guard не анализирует TS/TSX imports, поэтому запрет direct CSS imports не полностью fail-closed.
- Требование объяснить budget change в PR — human review policy, не автоматическая проверка.

### Что изменить
Уточнить scope single-entry, буквально описать ID rule и разделить conventions от machine enforcement.

---

## 12. `DEAD_CODE_AUDIT.md`

**Статус:** ⚠️ historical snapshot; не current inventory.

### Подтверждено
- Документ фиксирует snapshot commit/date.
- `vite-env.d.ts` корректно не считается dead code.
- `auth.cookies.js` остаётся кандидатом на удаление по текущему NodeNext/tsconfig/start:prod contract.
- `LogoutButton.tsx` теперь имеет unit test, поэтому больше не «без входящих ссылок», хотя production layouts его не используют.
- Старое limitation про отсутствующий `@axe-core/playwright` больше не актуально.

### Что изменить
Явно позиционировать как historical snapshot; перед удалением кандидатов повторить current import/static audit.

### [НЕ ПРОВЕРЕНО]
Полный current import graph и специализированный scanner (Knip/аналог) не запускались.

---

## 13. `DEPENDABOT_PNPM_WORKSPACE_POLICY.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- Один root `pnpm-lock.yaml`, workspace `apps/*` + `packages/*`.
- CI использует `pnpm install --frozen-lockfile`.
- Weekly Monday schedule и lockfile recovery policy актуальны.
- Dependabot config содержит groups, open PR limits и major-version ignore rules.

### Несоответствия
- npm Dependabot entry перечисляет только `/`, `/apps/api`, `/apps/web`, но manifests есть также в `/apps/e2e` и `/packages/shared`.
- Документ не описывает `workspace-prod`, `workspace-dev`, Actions group, PR limits и major ignores.
- Merge order — manual convention, а не enforced Dependabot behavior.

### Что изменить
Добавить E2E/shared manifests в policy и отдельным config PR — в `.github/dependabot.yml`; описать current grouping/limits/ignores; merge order пометить как manual.

### [НЕ ПРОВЕРЕНО]
История Dependabot PR по каждому manifest и реальный update job после потенциального config change.

---

## 14. `DEPENDENCY_UPDATE_POLICY.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- `packageManager: pnpm@9.15.0` актуален.
- Root build/lint/typecheck/test идут через Turbo.
- Один root lockfile и frozen-install policy актуальны.
- Scoped PR, changelog/release-note review, отдельные major upgrades, security priority, revert rollback и Prisma CLI/client alignment остаются правильными.
- Root `pnpm.overrides` используется для transitive security/version constraints.

### Несоответствия
- Package-level scripts/ownership описывают только Root/API/Web, но не E2E/Shared.
- Verification matrix не покрывает E2E/shared dependency changes.
- `Non-goals` говорит, что Dependabot не добавляется, хотя config уже существует.
- Policy не описывает current Dependabot automation и `pnpm.overrides`.

### Что изменить
Добавить E2E/Shared в ownership и verification, переписать `Non-goals`, описать/сослаться на Dependabot controls и override-based security remediation.

### [НЕ ПРОВЕРЕНО]
История каждого dependency PR не пересматривалась.

---

## 15. `DEPLOY_FOUNDATION.md`

**Статус:** ⚠️ частично актуален; repository-level deploy mechanics в основном верны, operational environment strategy требует синхронизации.

### Подтверждено
- Railway split-service config web + api + PostgreSQL соответствует repository config.
- Web/API Railway configs используют соответствующие Dockerfiles и healthchecks.
- API startup — `prisma migrate deploy && node dist/main.js`.
- `/health/live`, `/health/ready`, `/health` соответствуют `HealthController`.
- `prisma migrate deploy`, secret handling и rollback principles согласуются с current code/policy.

### Несоответствия
1. `Staging` описан как отдельный Railway environment, а `MIGRATION_BACKUP_POLICY.md` фиксирует отсутствие отдельного staging и CI ephemeral PostgreSQL как ближайший dry-run.
2. Storage source of truth расходится: deploy docs называют Railway MinIO, `.env.production.example` рекомендует R2/AWS S3, `infra/railway/README.md` описывает только web/api/PostgreSQL.
3. Follow-up PR 89/90/103 уже исторические: verification/smoke artifacts существуют.
4. Release checklist требует staging-before-production, хотя current migration policy staging не имеет.
5. Network perimeter API не унифицирован: Railway guide требует private-only API за nginx, исторические smoke docs используют public API URL.

### Что изменить
Унифицировать environment model, storage target, release checklist и API perimeter; перенести старые follow-up PR в historical context; сохранить health/migration/Docker/rollback sections.

### [НЕ ПРОВЕРЕНО]
Live Railway topology, MinIO/Redis provisioning, public/private API networking, env values, fresh production smoke и backup/restore readiness.

---

## 16. `DEVELOPMENT_PLAN.md`

**Статус:** ⚠️ historical implementation ledger, частично пригодный как roadmap, но не надёжный current source of truth.

### Подтверждено
- Документ последним обновлением указывает `2026-07-30`; `✅` трактуется как «реализовано и проверено в коде».
- Поздняя внутренняя нумерация `PR N` расходится с реальными GitHub PR. Например, plan item `PR 197 — Responsive visual matrix` не является GitHub PR #197; аналогично для `PR 205`.
- Responsive visual matrix уже реализован и выполняется в CI, хотя соответствующий plan item всё ещё `🔲`.
- Shared package tests/contracts по current code остаются незавершёнными: shared использует `vitest run --passWithNoTests`, test/spec files не обнаружены.
- Manual OpenAPI item исторически помечен `✅`, но current manual OpenAPI снова отстал от runtime routes.
- `PROJECT_SOURCE_OF_TRUTH.md` имеет более высокий current-source priority.

### Несоответствия
1. Внутренняя нумерация plan items неоднозначно называется `PR`.
2. Исторические `✅` воспринимаются как current truth, хотя код после них изменился.
3. Есть устаревшие `🔲`, например responsive visual matrix.
4. План смешивает historical ledger, current dashboard и future backlog.
5. Точные test counts, line/file refs и CI-green claims быстро стареют без SHA/date.

### Что изменить
- Переименовать внутренние `PR N` в `Plan item N`/`Work item N`; реальный PR хранить отдельным полем.
- Явно указать, что документ не source of truth.
- Провести full reconciliation статусов по current `main`.
- Разделить historical ledger и active backlog.
- Для snapshot claims хранить `Verified at` и `Verified against main SHA`.

### [НЕ ПРОВЕРЕНО]
Все plan items по одному не перевалидированы; историческое соответствие каждого work item GitHub PR полностью не реконструировалось.

---

## 17. `FRONTEND_COVERAGE_ROADMAP.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- Stage 1 global gate равен **40%** для statements, branches, functions и lines в `apps/web/vitest.config.ts`.
- `apps/web/package.json` содержит `test:coverage: vitest run --coverage`.
- CI запускает `pnpm --recursive test:coverage`, поэтому Web coverage gate является blocking check.
- Coverage включает production `src/**/*.{ts,tsx}` и исключает `main.tsx`, `vite-env.d.ts`, specs и `.d.ts`.
- `assessment-taking/model.ts` имеет отдельный **80%** threshold.
- После Stage 1 существуют другие domain models и `features/admin-users/validation.ts`, которые подпадают только под global gate.

### Несоответствия
1. Правило `Every new domain model or validation module must ship with at least 80% coverage` не machine-enforced: отдельный 80% threshold задан только для `assessment-taking/model.ts`.
2. Документ смешивает desired policy и automated enforcement.
3. Follow-up stages 50% и 65% остаются roadmap; current global threshold всё ещё 40%.
4. Часть областей из follow-up stages уже получила tests, но progress в документе не отражён.
5. Принцип «global thresholds only move upward» является policy; отдельного guard от уменьшения threshold не обнаружено.

### Что изменить
Разделить enforced gates и desired policy; при обязательном universal 80% rule автоматизировать per-domain enforcement; добавить progress для 50/65%, `Verified at`/SHA и уточнить идентификатор `PR 204`.

### [НЕ ПРОВЕРЕНО]
Текущие фактические проценты coverage и индивидуальное фактическое покрытие каждого domain/validation файла отдельно не измерялись.

---

## 18. `FRONTEND_MVP_MAINTAINABILITY_AUDIT.md`

**Статус:** ⚠️ частично актуален; current hotspot table и cleanup priorities в основном соответствуют `main`, но методика risk и live production claims требуют уточнения.

### Проверено
- текущие размеры direct page files в `apps/web/src/app`;
- заявленные shrink/refactor результаты для `App.tsx`, `AdminUsersPage.tsx`, `AdminAssessmentBuilderPage.tsx`;
- структура extracted feature/domain modules;
- четыре текущих cleanup target;
- смысл `Risk` column и единицы измерения;
- production/staging statement;
- behavior-preserving guardrails.

### Подтверждённые факты
- Все девять значений в `Largest current pages` соответствуют текущим размерам файлов при пересчёте `bytes / 1024`: `AdminMaterialsPage` ≈ 24.7, `AdminOrgStructurePage` ≈ 21.9, `AdminCourseBuilderPage` ≈ 20.5, `AdminCoursesPage` ≈ 19.6, `LearnerAssessmentTakingPage` ≈ 19.1, `InstructorCourseFormPage` ≈ 18.5, `AdminAssignmentCompletionPage` ≈ 18.1, `AdminThemeSettingsPage` ≈ 16.8, `AdminLessonsPage` ≈ 16.8 KiB.
- В `apps/web/src/app` это крупнейшие direct `*Page.tsx` files.
- Текущие конечные shrink values подтверждаются: `App.tsx` ≈ 1.25 KiB, `AdminUsersPage.tsx` ≈ 4.20 KiB, `AdminAssessmentBuilderPage.tsx` ≈ 14.35 KiB.
- `App.tsx` route composition вынесена в `app/routes`; `AdminUsersPage` использует `features/admin-users`; assessment builder использует вынесенные model/components/hook.
- `AdminMaterialsPage.tsx` уже использует `materials/model`, `MaterialTable`, `MaterialMetadataForm`, `useMaterialMutations`, но upload field/progress UI остаётся в page file.
- `AdminOrgStructurePage.tsx` использует `admin-org-structure/model`, но dialog orchestration остаётся в page.
- `AdminCourseBuilderPage.tsx` использует `course-builder/model` и `useCourseBuilderMutations`, но lesson list/editor/add-dialog composition остаётся в page.
- `AdminCoursesPage.tsx` использует `admin-courses/model`, но instructor-management dialog остаётся в page.
- PR #517, вошедший в `main` перед записью этого результата, меняет API users service/tests и entity techspec; frontend hotspot findings он не затрагивает.

### Несоответствия и уточнения
1. **`Size` фактически измерен в KiB, а не decimal KB.** Числа совпадают с `bytes / 1024`; обозначение `KB` технически неточно.
2. **`Risk: High/Medium` не имеет воспроизводимой методики.** Не заданы thresholds или weighting по state/effects/API calls/dialogs/complexity; это qualitative assessment.
3. **Размер root page file не равен total feature complexity.** Уменьшение page files частично достигнуто переносом logic/UI в `routes`, `features` и domain submodules. Это улучшает orchestration boundary, но page-size table не измеряет aggregate feature LOC/complexity.
4. **Утверждение `The app is deployed to production, so the old staging smoke gate no longer applies` требует live operational подтверждения.** Repository содержит historical production/staging artifacts, но deploy/migration docs расходятся по наличию отдельного staging, а production smoke status требует свежей проверки.
5. **Исторические before-size values не были повторно воспроизведены.** Current after-values подтверждены, но `21.1 → 14.4`, `14.3 → 1.2`, `12.8 → 4.2` должны быть привязаны к конкретным старым SHA, если используются как строгие измерения.
6. Формулировка `Tests only where extraction touches logic rather than pure JSX separation` не означает, что PR может пропустить CI: repository workflow всё равно запускает полный набор checks.

### Что изменить
1. Переименовать `KB` в `KiB` либо явно задать метод `file bytes / 1024`.
2. Добавить `Verified at` и `Verified against main SHA` к current-size table.
3. Явно определить `Risk` как qualitative либо задать воспроизводимые критерии.
4. Уточнить scope: таблица измеряет размер **page orchestration file**, а не total feature complexity после extraction.
5. Production/staging statement снабдить датой и authoritative live source; без live verification не использовать как бессрочный current fact.
6. Historical before-size values привязать к commit SHA либо оставить narrative history.
7. Сохранить четыре текущих cleanup priorities: current code подтверждает, что соответствующая orchestration/UI всё ещё находится в этих page files.
8. Для более устойчивой метрики дополнить page size feature-module size/complexity indicator, чтобы extraction не выглядела автоматическим снижением общей complexity только за счёт перемещения кода.

### [НЕ ПРОВЕРЕНО]
- Фактическое live состояние production и наличие/отсутствие отдельного staging environment на 2026-08-08.
- Исторические исходные размеры до выполненных refactor без checkout старых commits.
- Runtime behavior будущих cleanup extractions: в audit PR они не выполнялись.
- Полная cyclomatic/cognitive complexity каждого hotspot; проверены file-size/orchestration facts, а не специализированные complexity metrics.

### Итог
Текущая page-size table и четыре cleanup target остаются точными и полезными. Основной drift находится в методологии вокруг findings: `KB` фактически означает KiB, `Risk` не формализован, уменьшение page file не равно уменьшению total feature complexity, а production/staging statement требует свежего operational подтверждения.

---

## 19. `I18N_GUIDE.md`

**Статус:** ⚠️ частично актуален. Базовая i18n infrastructure, список locales и database/API facts соответствуют текущему коду, но locale persistence/priority, полнота перевода UI, formatting guidance и notifications section описаны как более завершённые, чем фактическая реализация.

### Проверено
- `apps/web/src/i18n/index.ts`, locale directories и locale-sync test;
- `apps/web/package.json` dependencies;
- language switching в login, public home, learner/admin/manager/instructor layouts;
- `User.locale` / `User.timezone`, Organization schema и registration schema;
- `/auth/me` current-user contract и frontend `CurrentUser` type;
- API error translation helper;
- shared date formatter;
- наличие notification module/model;
- hardcoded UI literals в shared components/layouts.

### Подтверждённые факты
- `i18next` и `react-i18next` являются текущими Web dependencies.
- `apps/web/src/i18n/index.ts` объявляет `DEFAULT_LOCALE = 'ru'`, `supportedLocales = ['ru', 'en', 'kk', 'zh']`, загружает resources для всех четырёх locales и использует `fallbackLng: 'ru'`.
- В `apps/web/src/i18n/locales/{ru,en,kk,zh}/` существуют `common.json`; login resources также регистрируются для всех четырёх языков.
- Login, public home и role layouts предоставляют ручное переключение языка. Admin и manager используют общий `LanguageSwitcher`; instructor использует `LearnerTopNav` с language switcher; learner layout содержит тот же общий switcher.
- `User` в Prisma имеет `locale String @default("ru")` и `timezone String @default("Asia/Almaty")`.
- `Organization` не имеет locale/timezone fields. В `registerOrganizationSchema` locale/timezone находятся внутри `admin`, то есть относятся к создаваемому admin user.
- `AuthService` выбирает `locale` и `timezone`, `currentUserSchema` возвращает их, а frontend `CurrentUser` type их содержит. При этом проверенные frontend flows не используют `user.locale` для инициализации i18next.
- Описание API error localization как узкого покрытия в основном точное: `apiErrorFeedback.ts` локализует login generic/`TOO_MANY_REQUESTS`, а для прочих `ApiClientError` возвращает `error.message`.
- Отдельного API module `notifications` в текущем `apps/api/src/modules` нет; generic Notifications ранее также зафиксированы как отсутствующая MVP capability.

### Несоответствия и уточнения
1. **`Locale priority` неверно описан как общий механизм приложения.** `i18n/index.ts` всегда стартует с `lng: 'ru'` и сам localStorage не читает. `LoginPage.tsx` действительно читает/записывает `lms-prototype-language`, поэтому persistence существует на login flow. Но общий `LanguageSwitcher` для authenticated layouts и switcher в `PublicHomePage` вызывают только `i18n.changeLanguage(...)` и не записывают locale в localStorage. Следовательно, правило `localStorage → default ru` не является глобальным current startup contract.
2. **Переключение языка реализовано неодинаково.** Login language switch persist-ит выбор; public home и authenticated layout switchers — нет. После SPA-навигации текущий i18next language сохраняется в памяти, но после прямой перезагрузки non-login route initialization снова начинается с `ru`, если никакой page-specific код не восстановит preference.
3. **Правило `no hardcoded UI texts` сейчас является convention/целью, а не выполненным invariant.** В текущем shared UI/layout коде есть hardcoded user-visible/default strings, например `Loading…`, `No items.`, `← Prev`, `Next →`, `Confirm`, `Cancel`, `Выйти`, а также `Main navigation`.
4. **`All four locales are implemented` нуждается в более точной формулировке.** Resources для ru/en/kk/zh действительно существуют и подключены, но current `locale-sync.spec.ts` проверяет только, что `kk` содержит все ключи `ru`. Аналогичного parity guard для `en` и `zh` в этом тесте нет. Fallback на `ru` дополнительно может скрывать пропущенные keys во время runtime.
5. **Dates/numbers section описывает желаемую практику, а не единый current implementation contract.** Shared `formatNullableDate()` использует `new Date(value).toLocaleString()` без передачи текущего `i18n.language`; это browser-locale formatting, а не явно синхронизированное с выбранным UI locale форматирование.
6. **Notifications section выглядит как current storage contract, хотя feature отсутствует.** Запись `{ translationKey, variables }` следует маркировать как future design recommendation, а не существующую модель хранения.
7. **`User.locale` persisted в Postgres, но manual language switch не синхронизирует его с backend.** Проверенные switchers не PATCH/PUT user locale и не сохраняют UI preference в `User.locale`.
8. **Default/fallback locale `ru` подтверждён, но browser locale auto-detection отсутствует.** В `i18n/index.ts` не подключён detector.

### Что изменить
1. Переписать `Locale priority` по фактическому поведению: i18next bootstrap всегда `ru`; LoginPage восстанавливает `lms-prototype-language`; login switcher persist-ит localStorage; public/authenticated switchers меняют язык только в памяти; `User.locale` не участвует в UI initialization и не обновляется switchers.
2. Либо унифицировать persistence в одном shared locale service/switcher, либо честно документировать разные поведения.
3. Сформулировать `no hardcoded UI texts` как правило для нового/изменяемого UI и отдельно завести cleanup/enforcement для существующих literals.
4. Расширить locale parity test минимум на `en`, `kk`, `zh` относительно canonical `ru` keys.
5. Добавить locale-aware formatting helper для dates/numbers либо пометить раздел как target architecture.
6. Перенести Notifications storage example в `Future design`/`Out of current MVP implementation`.
7. Явно отделить `supported resource bundles` от `fully localized UI`.
8. Добавить `Verified at` / `Verified against main SHA`.

### [НЕ ПРОВЕРЕНО]
- Полная key/value parity всех `en` и `zh` translation resources вручную не пересчитывалась.
- Полный поиск каждого hardcoded user-visible literal во всём `apps/web/src` не выполнялся.
- Должен ли выбранный язык сохраняться между устройствами через `User.locale` или только локально в браузере — продуктовый выбор.
- Будущая схема Notifications/course translations не реализовывалась и не проверялась как migration design.

### Итог
Core i18n foundation документа актуальна: четыре locale bundles, Russian default/fallback, i18next/react-i18next, `User.locale/timezone`, отсутствие organization locale и locale-agnostic API direction подтверждаются кодом. Основной drift находится в lifecycle locale preference и уровне завершённости: localStorage persistence работает только на login flow, authenticated/public switchers не persist-ят выбор, `User.locale` не синхронизируется с UI, hardcoded strings ещё существуют, parity test покрывает только `kk` против `ru`, а notifications/locale-aware formatting остаются скорее target design, чем завершённой реализацией.

---

## 20. `INSTRUCTOR_COURSE_OWNERSHIP.md`

**Статус:** ⚠️ частично актуален. Центральная модель instructor course ownership, scoping, 404-hiding, soft-delete и auto-assignment соответствуют текущему коду, но write-path назначения не гарантирует, что target user действительно имеет активную роль `instructor`.

### Проверено
- Prisma `CourseInstructor` model и indexes;
- `CourseAccessPolicy` / `CourseAccessGuard` и policy tests;
- Courses controller/service и instructor assignment tests;
- role policies для course/content operations;
- Admin Courses instructor-management UI и candidate filtering;
- demo seed assignment;
- instructor-created course transaction behavior.

### Подтверждённые факты
- `CourseInstructor` содержит `courseId`, `instructorId`, `organizationId`, `assignedAt`, `deletedAt`; composite primary key — `(courseId, instructorId)`, indexes — `(organizationId, instructorId)` и `(organizationId, courseId)`.
- Удаление назначения является soft-delete через `deletedAt`; повторное назначение использует upsert и очищает `deletedAt`.
- `GET /courses` для instructor передаёт `currentUser.id` в service filter, а `listCourses()` возвращает только undeleted courses текущей organization с активным `CourseInstructor` для этого instructor.
- `CourseAccessPolicy.assertCourseAccess()` проверяет organization, undeleted course и активную ownership row; отсутствующий, foreign или unassigned course скрывается через `NotFoundException`.
- Admin bypass подтверждён: `isInstructorScoped()` возвращает false, если среди ролей есть `admin`, даже при одновременной роли instructor; policy tests проверяют отсутствие ownership lookup для такого пользователя.
- Central policy проверяет nested ownership через parent course. Для обычных child resources используется joined relation к course; для assessment attempt/question используется вложенный путь через `assessment.course`. Policy tests подтверждают как прямой child lookup, так и two-level attempt/question path и 404 при отсутствии owned course.
- Instructor-created course получает ownership внутри той же `Prisma.$transaction`: `CoursesService.createCourse()` создаёт course и вызывает `courseAccess.assignInstructor(..., tx)`; соответствующий service test проверяет использование transaction client.
- Demo seed создаёт `instructor@demo.com`, membership с ролью `instructor` и активный `CourseInstructor` на demo course.
- Документированные assignment endpoints существуют: list/add/remove instructors; add/remove semantics покрыты service tests.

### Существенное несоответствие

1. **Write-path назначения не проверяет instructor role target user.** `assignCourseInstructorSchema` валидирует только UUID. `CoursesService.addInstructor()` проверяет, что target `User` существует в той же organization и не удалён, но не проверяет active `Membership` с `role = 'instructor'`. Значит API позволяет создать `CourseInstructor` row для learner, manager или admin пользователя.

2. **Admin UI имеет ту же семантическую дыру.** `AdminCoursesPage` загружает общий `/users?pageSize=200`, а `usersAvailableToAdd()` исключает только уже назначенные IDs. `UserSummary` в Web contract не содержит roles, поэтому UI не может отфильтровать только instructors и фактически предлагает любого пользователя организации.

3. **Это не немедленный privilege escalation, но нарушает ownership invariant.** Instructor-scoped доступ включается только когда authenticated `currentUser.roles` содержит `instructor` и не содержит `admin`. Поэтому одна ошибочная `CourseInstructor` row сама по себе не превращает learner/manager в instructor. Однако relation перестаёт означать «назначенный instructor» и может неожиданно начать давать ownership после последующего изменения membership role.

4. **Фраза `single authorization boundary` требует уточнения.** `CourseAccessPolicy` является централизованной ownership boundary для instructor course scope, но базовый RBAC всё равно отдельно enforced через `RolesGuard`/`rolePolicies`. Лучше не описывать policy как единственный authorization mechanism вообще.

5. **Раздел Tests несколько шире фактической подтверждённой проверки.** Unit tests хорошо покрывают policy, add/remove/upsert и transactional auto-assignment. В рамках этого шага не подтверждён отдельный HTTP/E2E test именно для всех трёх `/courses/:id/instructors` routes.

### Что изменить
1. Усилить `CoursesService.addInstructor()` server-side проверкой: target user должен иметь активную membership в той же organization с ролью `instructor`; не полагаться на UI filtering.
2. Добавить unit/integration tests: learner/manager/admin-only target отклоняется; active instructor принимается; deleted/inactive instructor membership обрабатывается по явно выбранному contract.
3. Обновить Admin Courses candidate source так, чтобы UI показывал только eligible instructors. Предпочтительно использовать authoritative endpoint/filter, который возвращает пользователей с активной instructor membership, вместо client-side предположений.
4. Если multi-role users допустимы, явно определить eligibility: достаточно ли наличия `instructor` среди активных memberships/roles независимо от других ролей, и как обрабатывать admin+instructor.
5. В документе добавить invariant: `CourseInstructor.instructorId` должен ссылаться на пользователя с активной instructor membership в той же organization на момент назначения.
6. Уточнить wording `single authorization boundary` до `centralized instructor ownership boundary`, сохранив отдельный baseline RBAC через RolesGuard.
7. В Tests section различать service/policy unit coverage и HTTP/E2E coverage; не заявлять последнее без отдельного подтверждения.

### [НЕ ПРОВЕРЕНО]
- Полный route-by-route HTTP/E2E coverage всех assignment endpoints в отдельном browser/integration suite не реконструировался; проверены controller/service/policy code и unit tests.
- Продуктовое правило для multi-role target users (`admin+instructor`, `manager+instructor`) не сформулировано в самом документе достаточно явно; current read-side admin bypass подтверждён, но write-side eligibility требует явного решения.
- Не проверялось, существуют ли уже production data rows `CourseInstructor`, указывающие на пользователей без instructor role; repository code этого не доказывает.

### Итог
Основная ownership архитектура документа реализована корректно и заметно сильнее старого all-courses поведения: instructor list/direct/nested access scoping, 404 hiding, admin bypass, soft-delete, transaction-safe creator assignment и demo ownership подтверждены. Главный current gap находится на write boundary: API и Admin UI называют relation `CourseInstructor`, но позволяют назначить туда любого существующего пользователя организации без проверки instructor role. Документ следует дополнить этим invariant, а код — server-side role validation и соответствующими тестами.

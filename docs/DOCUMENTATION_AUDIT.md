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
| 7 | `AUTH_SESSION_STORE_DESIGN.md` | ⚠️ | Historical PR 120 snapshot; current Session расширена refresh state |
| 8 | `AUTH_TOKEN_REVOCATION.md` | ⚠️ | Logout/revocation актуальны; универсальное CSRF-правило уже неверно |
| 9 | `CI_AUDIT_BASELINE.md` | ⚠️ | CI baseline актуален; `main` branch protection выключена |
| 10 | `CONCERNS.md` | ⚠️ | Open содержит смесь актуальных, закрытых и неподтверждённых concerns |
| 11 | `CSS_ARCHITECTURE.md` | ⚠️ | Layers/checks актуальны; нужны точные формулировки enforcement |
| 12 | `DEAD_CODE_AUDIT.md` | ⚠️ historical | Findings нужно пересчитать по current `main` |
| 13 | `DEPENDABOT_PNPM_WORKSPACE_POLICY.md` | ⚠️ | Dependabot scope не охватывает E2E/shared manifests |
| 14 | `DEPENDENCY_UPDATE_POLICY.md` | ⚠️ | Основные правила верны; ownership/verification/non-goals отстали от workspace |

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
- Команда `pnpm --filter @lms/api admin:demo-seed` существует.
- Dry-run по умолчанию; apply требует explicit environment/database confirmations.
- Production guard требует `--allow-demo-environment`.
- Apply + post-seed verification выполняются внутри `Prisma.$transaction`.
- Прямой Prisma seed направлен через guarded path.
- Database target не логирует username/password/full URL.

### Несоответствие
`findMissingDemoData()` проверяет только baseline subset: organization, admin, learner, course, 3 lessons, assignment, assessment, 5 questions. Seed создаёт также manager, instructor, memberships, groups, materials, progress, answer options и др.

### Что изменить
Либо явно назвать verification baseline subset, либо расширить `findMissingDemoData()` до полного demo dataset.

---

## 3. `AI_AGENT_STARTER_PROMPT.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
Стек проекта соответствует NestJS/Prisma + React/Vite + pnpm workspace; Docker Compose находится в `infra/docker`; master-context — в `docs/master-context`.

### Несоответствия
- Репозиторий описан private, фактически public.
- Пути к `01_LMS_...`—`23_LMS_...` должны указывать `docs/master-context/...`.
- Требование `module/controller/service/repository` не соответствует фактическим модулям вроде `courses`.
- DTO-only формулировка не учитывает Zod schemas.
- Bootstrap предлагает создавать уже существующие monorepo/API/Web/Prisma/Docker/health/CI.
- Нет приоритета current code/root docs над historical master-context.

### Что изменить
Обновить visibility/пути, требовать следовать существующему module pattern, обобщить validation rule и пометить bootstrap/master-context как historical/reference.

---

## 4. `API_CONTRACTS.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
- `/api/v1`, error envelope, pagination defaults/max и основные auth/health routes соответствуют коду.
- Redis rate-limit store поддерживается через `REDIS_URL`; production in-memory fallback требует explicit flag.
- Runtime OpenAPI endpoint — `GET /api/v1/openapi`.

### Несоответствие
`openapi.document.ts` не синхронизирован со всеми runtime routes: отсутствуют, среди прочего, `/health/live`, `/health/ready`, `POST /auth/refresh`, `GET /manager/team-summary` и ряд update/status/subresource endpoints. Manual document объявляет `/openapi.json`, runtime controller — `/api/v1/openapi`.

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
PR 120 действительно ввёл `sessions`, access validation по `jti`/revocation/expiry и logout revocation. Поздняя migration добавила `refresh_token_hash` и `refresh_expires_at`; login хранит SHA-256 hash refresh token, raw token в БД не хранится.

### Несоответствия
Основные разделы продолжают описывать старую Session model и login lifecycle, а current refresh state отражён только поздней вставкой.

### Что изменить
Предпочтительно явно сохранить документ как historical PR 120 snapshot и сослаться на current refresh/session design; альтернатива — полностью обновить модель/lifecycle.

### [НЕ ПРОВЕРЕНО]
Исторические staging assertions PR 120.

---

## 8. `AUTH_TOKEN_REVOCATION.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
Logout/logout-all, tenant isolation, idempotency, bearer behavior, cookie clearing и revoked-session checks соответствуют текущему коду.

### Несоответствие
Общее правило `cookie-authenticated unsafe requests require a matching CSRF token` уже слишком широкое: `POST /auth/refresh` использует HttpOnly refresh cookie и не вызывает `assertValidCsrf()`.

### Что изменить
Ограничить CSRF rule logout/logout-all, описать refresh cookie (`SameSite=lax`, path `/api/v1/auth/refresh`) и historical scope PR 121.

---

## 9. `CI_AUDIT_BASELINE.md`

**Статус:** ⚠️ частично актуален.

### Подтверждено
CI, CodeQL, staging-smoke, Dependabot, Postgres service, Gitleaks, frozen install, audit/waivers, lint/typecheck/tests/build, E2E/a11y/visual, Docker builds и Trivy соответствуют workflow-файлам. Semgrep workflow отсутствует.

### Несоответствие
Branch protection уже не `[НЕ ПРОВЕРЕНО]`: GitHub возвращает для `main` `protected: false`, protection disabled, required status checks enforcement `off`.

### Что изменить
Явно зафиксировать отсутствие branch protection и отделить наличие checks от их обязательности перед merge.

---

## 10. `CONCERNS.md`

**Статус:** ⚠️ существенно требует ревизии.

### Актуальные concerns
- manual policy inventory в `roles.spec.ts`;
- startup warning для intentional in-memory rate-limit режима;
- access token одновременно в HttpOnly cookie и JSON body;
- Notifications/Audit Log отсутствуют.

### Уже устаревшие/закрытые concerns
- frontend coverage 25% — thresholds уже 40%;
- instructor all-courses — server list scoped через `CourseInstructor`;
- password reset false 200 — теперь `ServiceUnavailableException`;
- raw 429 envelope — теперь canonical API error response;
- flaky refresh E2E — закрыт PR #513;
- custom role builder как MVP question — out-of-MVP;
- nested ownership double-query и non-transactional create+assignInstructor были исправлены PR #515 и должны быть перенесены в Closed после синхронизации документа.

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
- Документ сам фиксирует snapshot commit/date.
- `vite-env.d.ts` корректно не считается dead code.
- `auth.cookies.js` всё ещё выглядит кандидатом на удаление по текущему NodeNext/tsconfig/start:prod contract.
- `LogoutButton.tsx` теперь имеет unit test, поэтому больше не «без входящих ссылок», хотя production layouts всё ещё его не используют.
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
- Текущий Dependabot config содержит groups, open PR limits и major-version ignore rules.

### Несоответствия
- npm Dependabot entry перечисляет только `/`, `/apps/api`, `/apps/web`, но реальные manifests есть также в `/apps/e2e` и `/packages/shared`.
- Документ не описывает действующие `workspace-prod`, `workspace-dev`, Actions group, PR limits и major ignores.
- Merge order — manual convention, а не enforced Dependabot behavior.

### Что изменить
Добавить E2E/shared manifests в policy и отдельным config PR — в `.github/dependabot.yml`; описать current grouping/limits/ignores; merge order пометить как manual.

### [НЕ ПРОВЕРЕНО]
История Dependabot PR по каждому manifest и реальный update job после потенциального config change.

---

## 14. `DEPENDENCY_UPDATE_POLICY.md`

**Статус:** ⚠️ частично актуален.

### Проверено
- root `package.json` и `packageManager`;
- `pnpm-workspace.yaml`;
- manifests/scripts для API, Web, E2E и Shared;
- `turbo.json`;
- CI frozen install + audit;
- текущий Dependabot config;
- root `pnpm.overrides` как действующий механизм transitive security remediation.

### Подтверждённые факты
- `packageManager: pnpm@9.15.0` соответствует документу.
- Root scripts `build`, `lint`, `typecheck`, `test` действительно идут через Turbo.
- Lockfile policy остаётся корректной: один root `pnpm-lock.yaml`, CI использует `--frozen-lockfile`, ручное редактирование lockfile не требуется и не должно использоваться.
- Основные update rules (scoped PR, changelog/release-note review, major upgrades отдельно, security updates приоритетны, rollback через revert, Prisma CLI/client alignment) остаются полезными и согласуются с repository process.
- Root `package.json` уже содержит `pnpm.overrides` для transitive security/version constraints, то есть проект фактически использует override-based remediation как часть dependency contract.

### Несоответствия

1. **`Current package manager` неполно описывает package-level scripts.** Документ упоминает только `apps/api/package.json` и `apps/web/package.json`, но `apps/e2e/package.json` имеет собственные `lint`, `typecheck`, `test:a11y`, `test:visual`, а `packages/shared/package.json` — `build`, `lint`, `typecheck`, `test`.

2. **`Dependency ownership` неполон.** Таблица содержит только Root/API/Web/Lockfile и не содержит E2E и Shared. Это делает правило «dependency added at narrowest package scope: root, API, or Web» устаревшим: фактические допустимые package scopes также включают E2E и Shared.

3. **Verification matrix не покрывает E2E/shared dependency changes.** Для E2E test/tooling dependency нужен как минимум E2E lint/typecheck и релевантный Playwright gate; для Shared runtime/dev dependency нужны shared lint/typecheck/test/build и проверки потребителей, если меняется runtime/types behavior.

4. **`Non-goals` устарел.** Документ говорит, что policy не добавляет Dependabot/Renovate configuration. Dependabot configuration уже существует в `.github/dependabot.yml`, поэтому такой non-goal больше не описывает current repository state.

5. **Policy не описывает current automated dependency controls.** В repository уже действуют Dependabot groups/limits/major ignores, а root `pnpm.overrides` используется для transitive constraints/security fixes. Для current source-of-truth policy стоит либо описать эти механизмы, либо дать точные ссылки на `DEPENDABOT_PNPM_WORKSPACE_POLICY.md` и security-waiver/audit process.

6. **Root/API/Web формулируются как исчерпывающая архитектура ownership.** Это уже противоречит реальному `pnpm-workspace.yaml`, который включает `apps/*` и `packages/*`.

### Что изменить

1. Расширить `Current package manager` и `Dependency ownership` строками E2E и Shared.
2. Заменить «narrowest scope: root, API, or Web» на фактические workspace scopes; dependency должна жить в самом узком package, который её использует.
3. Добавить verification rows:
   - E2E dev/test dependency → E2E lint + typecheck + релевантный Playwright/a11y/visual check;
   - Shared runtime dependency → shared lint/typecheck/test/build + affected consumer checks;
   - Shared dev/test dependency → shared lint/typecheck/tests/build when applicable.
4. Переписать `Non-goals`: Dependabot уже существует; policy не должна утверждать обратное.
5. Явно описать либо сослаться на current Dependabot controls и допустимое использование `pnpm.overrides` для минимальной transitive security remediation.
6. Сохранить без изменений основные правила: scoped PR, no manual lockfile edits, no unrelated dependency churn, explicit rollback, verification before merge.

### [НЕ ПРОВЕРЕНО]
- История каждого dependency PR не пересматривалась; аудит проверяет current policy/config, а не соблюдение правил каждым прошлым PR.
- Текущий security-fix для `nanoid` выполняется параллельно другим агентом; его итоговый manifest/lockfile diff и CI будут проверены после merge в `main` перед следующей синхронизацией audit-ветки.

### Итог

Документ остаётся хорошей базовой policy по безопасным dependency changes, lockfile discipline, security updates и rollback. Главное устаревание — структура workspace: current policy фактически написана для root/API/Web, тогда как репозиторий уже содержит полноценные E2E и Shared packages. Дополнительно `Non-goals` и automation sections нужно привести к реальному наличию Dependabot и `pnpm.overrides`.

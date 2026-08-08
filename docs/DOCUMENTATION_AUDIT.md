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
| 15 | `DEPLOY_FOUNDATION.md` | ⚠️ | Railway config/health/migrations актуальны; staging/storage/follow-up sections противоречат current docs |

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
1. `Current package manager` неполно описывает package-level scripts: отсутствуют E2E и Shared.
2. `Dependency ownership` содержит только Root/API/Web/Lockfile и не включает E2E/Shared; narrowest scope должен учитывать все workspace packages.
3. Verification matrix не покрывает E2E/shared dependency changes.
4. `Non-goals` устарел: Dependabot config уже существует.
5. Policy не описывает current automated dependency controls и использование `pnpm.overrides`.
6. Root/API/Web формулируются как исчерпывающая ownership architecture, хотя `pnpm-workspace.yaml` включает `apps/*` и `packages/*`.

### Что изменить
1. Добавить E2E и Shared в package manager/ownership sections.
2. Определить narrowest scope по фактическим workspace packages.
3. Добавить verification rows для E2E и Shared dependencies.
4. Переписать `Non-goals`, поскольку Dependabot уже существует.
5. Описать/сослаться на Dependabot controls и допустимое `pnpm.overrides` для минимальной transitive security remediation.
6. Сохранить scoped PR, no manual lockfile edits, no unrelated churn, explicit rollback, verification before merge.

### [НЕ ПРОВЕРЕНО]
История каждого dependency PR не пересматривалась; аудит проверяет current policy/config, а не соблюдение правил каждым прошлым PR.

### Итог
Документ остаётся хорошей базовой policy по безопасным dependency changes, lockfile discipline, security updates и rollback. Главное устаревание — структура workspace и уже существующая automation.

---

## 15. `DEPLOY_FOUNDATION.md`

**Статус:** ⚠️ частично актуален; runtime/config foundation в основном верна, environment strategy и часть operational assumptions устарели или противоречат другим current docs.

### Проверено
- `apps/api/railway.json` и `apps/web/railway.json`;
- API/Web Dockerfiles;
- API health controller;
- `.env.production.example`;
- `infra/railway/README.md`;
- `RAILWAY_DEPLOY_GUIDE.md`;
- `MIGRATION_BACKUP_POLICY.md`;
- `STAGING_SMOKE_REPORT.md`;
- `RAILWAY_PRODUCTION_SMOKE_STATUS.md`;
- `PR_89_102_VERIFICATION.md`.

### Подтверждённые факты
- Railway остаётся документированным deployment target, а split-service конфигурация `web` + `api` + Railway PostgreSQL соответствует repository config.
- `apps/web/railway.json` использует Dockerfile `apps/web/Dockerfile`, healthcheck `/`, timeout 60, restart `ON_FAILURE`/3 retries.
- Web Dockerfile действительно собирает React/Vite application и обслуживает build через nginx; его container healthcheck также проверяет `/`.
- `apps/api/railway.json` использует `apps/api/Dockerfile`, start command `prisma migrate deploy && node dist/main.js`, healthcheck `/api/v1/health/ready`, timeout 300 и restart `ON_FAILURE`/3 retries.
- API Dockerfile содержит тот же production startup contract и container healthcheck `/api/v1/health/ready`.
- `HealthController` реализует:
  - `GET /health/live` — только liveness;
  - `GET /health/ready` — readiness через PostgreSQL, Redis и storage checks;
  - `GET /health` — compatibility alias, который вызывает readiness.
- Правило использовать committed `prisma migrate deploy`, а не `migrate dev`, соответствует `MIGRATION_BACKUP_POLICY.md` и текущему Railway startup.
- Production secret guidance в целом согласуется с `.env.production.example`: реальные значения не должны коммититься; `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, Redis/storage variables задаются через deployment environment.
- Rollback guidance «redeploy previous deployment для runtime-only проблемы; schema/data rollback требует отдельного решения» согласуется с migration policy на уровне принципа.

### Несоответствия

1. **Раздел `Staging` противоречит текущей migration/environment policy.** `DEPLOY_FOUNDATION.md` описывает staging как отдельное production-like Railway environment с web/api/Postgres и staging-only secrets. Однако `MIGRATION_BACKUP_POLICY.md` прямо фиксирует: **отдельного staging environment у проекта нет**, Railway project имеет один `production` environment, а ближайший migration dry-run — ephemeral PostgreSQL в CI. Одновременно исторический `STAGING_SMOKE_REPORT.md` использует production-like Railway URLs и старое понятие staging. Current source-of-truth нужно унифицировать.

2. **Storage target не имеет единого current source of truth.** `DEPLOY_FOUNDATION.md` и `RAILWAY_DEPLOY_GUIDE.md` называют self-hosted Railway MinIO текущим storage target. Но `.env.production.example` говорит: `Use Cloudflare R2 or AWS S3 in production` и описывает MinIO только через path-style/self-hosted compatibility. `infra/railway/README.md` вообще описывает только три Railway services — web, api и PostgreSQL — без MinIO. Поэтому утверждение `current MVP deployment target = minio` нельзя считать надёжным current contract без live infrastructure verification.

3. **`Follow-up candidates` устарели как список будущей работы.** Документ предлагает PR 89 verification, PR 90 env verification и PR 103 staging deploy/smoke как будущие шаги. В repository уже существуют `PR_89_102_VERIFICATION.md`, `STAGING_SMOKE_REPORT.md` и более поздний `RAILWAY_PRODUCTION_SMOKE_STATUS.md`. То есть эти пункты теперь исторические и должны быть заменены текущими verification gaps, а не оставаться как pending roadmap.

4. **Release checklist предполагает staging-before-production, которого current migration policy не имеет.** Пункты `staging deploy complete` и `staging smoke complete` не могут быть обязательными gates, если отдельного staging environment действительно нет. Нужно либо восстановить/создать staging как реальный environment, либо переписать checklist под current reality: CI migration dry-run + production deploy verification.

5. **Deployment docs расходятся по сетевой архитектуре API.** `infra/railway/README.md` требует не включать Public Networking для API и направлять `/api/` только через web nginx/private network. Исторические `STAGING_SMOKE_REPORT.md` и `RAILWAY_PRODUCTION_SMOKE_STATUS.md` фиксируют прямой public API URL. Это не обязательно ошибка `DEPLOY_FOUNDATION.md`, но его split-service target не определяет, является ли public API endpoint допустимым current contract. Для production perimeter это нужно сделать явно.

### Что изменить

1. Выбрать и зафиксировать **одну current environment model**:
   - если staging реально отсутствует — убрать staging как существующий environment из `DEPLOY_FOUNDATION.md`, заменить на CI ephemeral DB + production verification;
   - если staging должен существовать — создать/подтвердить его отдельно и затем синхронизировать `MIGRATION_BACKUP_POLICY.md`.
2. Выбрать единый current storage target и синхронизировать `DEPLOY_FOUNDATION.md`, `.env.production.example`, `RAILWAY_DEPLOY_GUIDE.md` и `infra/railway/README.md`: self-hosted MinIO либо managed R2/S3. До live verification не утверждать MinIO как факт текущего production provisioning.
3. Перенести PR 89/90/103 из `Follow-up candidates` в historical/completed context и заменить их актуальными gaps, например fresh production smoke, storage/Redis live verification и branch/release controls.
4. Переписать release checklist так, чтобы он соответствовал фактической environment strategy.
5. Явно определить network perimeter: public API разрешён или API должен быть private-only за web nginx. Синхронизировать это с Railway guide/status docs.
6. Сохранить без изменений корректные части: health endpoints, Railway healthcheck paths, Dockerfile ownership, migration deploy command, secret-handling и rollback principles.

### [НЕ ПРОВЕРЕНО]
- Фактическое live Railway topology: наличие отдельного staging environment, MinIO/Redis services, public API networking и текущие env values — GitHub repository этого не доказывает.
- Production smoke status после 2026-07-08: `RAILWAY_PRODUCTION_SMOKE_STATUS.md` сам помечен stale и требует свежего live smoke.
- Реальный backup/restore readiness перед текущим production deploy не проверялся в рамках документационного аудита.

### Итог

`DEPLOY_FOUNDATION.md` остаётся полезным описанием repository-level deploy mechanics: Dockerfiles, Railway service configs, healthchecks, migration command и rollback principles в основном соответствуют коду. Но как **current operational deployment plan** документ уже ненадёжен без правок: отдельный staging конфликтует с current migration policy, storage target расходится между MinIO и managed S3/R2 guidance, а follow-up roadmap PR 89/90/103 давно превратился в историю.

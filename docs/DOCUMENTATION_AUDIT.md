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
| 16 | `DEVELOPMENT_PLAN.md` | ⚠️ historical/current mix | Полезный implementation ledger, но статусы и PR-нумерация уже не являются надёжным current roadmap |

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
Стек проекта соответствует NestJS/Prisma + React/Vite + pnpm workspace; Docker Compose находится в `infra/docker`; master-context — в `docs/master-context`.

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
GitHub возвращает для `main` `protected: false`, protection disabled, required status checks enforcement `off`. Значит branch protection уже не `[НЕ ПРОВЕРЕНО]`, а подтверждённо выключена.

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
- Root `pnpm.overrides` фактически используется для transitive security/version constraints.

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

**Статус:** ⚠️ исторический implementation ledger, частично пригодный как roadmap, но не надёжный current source of truth без полной сверки статусов.

### Проверено
- заголовок, дата обновления, status legend и заявленное назначение документа;
- связь документа с текущими `PROJECT_SOURCE_OF_TRUTH.md` и `MVP_SCOPE_LOCK.md`;
- нумерация plan PR/work items против реальных GitHub PR;
- выборочные контрольные статусы из ранней и поздней части плана: manual OpenAPI, frontend coverage, responsive visual matrix, shared package contracts;
- текущие visual E2E tests и shared package test contract;
- реальные GitHub PR #197 и #205 как контроль неоднозначности нумерации.

### Подтверждённые факты
- Документ помечен как рабочий план и последним обновлением указывает `2026-07-30`; legend трактует `✅` как «реализовано и проверено в коде», а `🔲` как «не начато».
- В начале документа явно сказано, что Part 0 опирается на реальные GitHub PR 1–48, а `PR 49 в плане ChatGPT` продолжает эту нумерацию. В поздних разделах эта внутренняя нумерация визуально продолжает использовать термин `PR`, хотя уже не соответствует номеру реального GitHub Pull Request.
- Контрольный пример: plan item `PR 197 — Responsive visual matrix` помечен `🔲`, но текущий `apps/e2e/visual-tests/responsive-matrix.spec.ts` уже существует и проверяет 320/375/768/1024/1280/1440 px, отсутствие horizontal overflow, touch targets, responsive admin UI и 200% zoom; CI уже запускает visual regression gate. Следовательно, статус этого plan item устарел.
- Реальный GitHub PR #197 — другой change: `feat(learner): real assessment taking form with result breakdown`, merged 2026-06-04. Это доказывает, что позднее `PR 197` в плане нельзя читать как GitHub PR #197.
- Аналогично plan item `PR 205 — Shared package tests/contracts` помечен `🔲`, а реальный GitHub PR #205 — `feat(upload): harden MVP file validation`. Нумерации расходятся.
- При этом сам plan item про Shared tests по текущему коду остаётся правдоподобно незавершённым: `packages/shared/package.json` использует `vitest run --passWithNoTests`, а в `packages/shared/src` нет обнаруженных test/spec файлов.
- Plan item `PR 204 — Frontend coverage roadmap` соответствует текущему направлению: global frontend coverage threshold уже поднят до 40%, что ранее подтверждено по `apps/web/vitest.config.ts`.
- `PROJECT_SOURCE_OF_TRUTH.md` задаёт более высокий current-source priority для самого source-of-truth документа, `MVP_SCOPE_LOCK.md`, `TODO_VERIFY.md` и current code/config. Поэтому `DEVELOPMENT_PLAN.md` не должен самостоятельно переопределять текущее состояние при конфликте.

### Несоответствия

1. **Внутренняя нумерация plan work items неоднозначно называется `PR`.** После первых реальных PR номера расходятся с GitHub. Это создаёт прямой риск ссылаться на неверный Pull Request. Примеры `197` и `205` подтверждают проблему.

2. **Legend `✅ = реализовано и проверено в коде` не гарантирует current truth.** Например, plan item про синхронизацию manual OpenAPI (`PR 61`) помечен выполненным, но текущий `openapi.document.ts` снова отстал от runtime controllers. Значит `✅` отражает состояние на момент реализации, а не обязательную актуальность сегодня.

3. **Есть устаревшие `🔲`.** Responsive visual matrix (`PR 197` по внутренней нумерации плана) уже фактически реализован и выполняется в CI, но в плане остаётся «не начато».

4. **Дата и scope статусов отстали от текущего репозитория.** После 2026-07-30 были новые security/auth/readiness/maintainability изменения, PR #513–#516 и обновления canonical docs. План не содержит механизма обязательной повторной верификации старых статусов после изменения кода.

5. **Документ смешивает три разных роли:** historical implementation ledger, current status dashboard и future backlog. При таком объёме и ручном обновлении это приводит к drift: исторически верные `✅` начинают выглядеть как current assertions, а реализованные work items остаются `🔲`.

6. **Эфемерные факты быстро стареют.** В документе много точных test counts, line/file references, CI-green assertions и временных branch/PR формулировок. Без привязки к конкретному SHA/date такие сведения нельзя воспринимать как current fact.

### Что изменить

1. Добавить в начало явное правило: `DEVELOPMENT_PLAN.md` — не source of truth; при конфликте приоритет имеют `PROJECT_SOURCE_OF_TRUTH.md`, `MVP_SCOPE_LOCK.md`, `TODO_VERIFY.md`, current code/config и current CI.
2. Переименовать внутренние `PR N` в `Plan item N` / `Work item N`. Если работа реализована, хранить отдельное поле `GitHub PR: #...` с реальным номером.
3. Провести полную reconciliation статусов по текущему `main`, начиная как минимум с уже доказанных drift cases: manual OpenAPI и responsive visual matrix.
4. Разделить historical ledger и current backlog: завершённые Parts/эпики можно сохранить как исторический implementation record, а активные задачи держать в короткой current queue.
5. Для проверяемых snapshot-фактов хранить `Verified at` и `Verified against main SHA`; test counts/line numbers/CI status не оставлять как бессрочные current claims.
6. Не дублировать вручную current readiness, если он уже поддерживается в canonical docs; вместо этого ссылаться на них.
7. После полной сверки сохранить только те `🔲`, для которых current code/config действительно подтверждает отсутствие реализации.

### [НЕ ПРОВЕРЕНО]
- Все сотни plan items не перевалидированы по одному в рамках этого шага. Проверка была выборочной и намеренно использовала контрольные точки из разных частей файла; уже найденных противоречий достаточно, чтобы доказать, что документ нельзя считать полностью current без отдельной full reconciliation.
- Историческое соответствие каждого внутреннего plan item конкретному GitHub PR не реконструировалось полностью.
- Не воспроизводились все старые CI/test-count assertions, указанные в плане.

### Итог

`DEVELOPMENT_PLAN.md` остаётся ценным подробным журналом того, как проект развивался и какие work items планировались. Но текущая комбинация внутренней `PR`-нумерации, исторических `✅`, устаревших `🔲` и ручного дублирования readiness делает его ненадёжным как текущий roadmap. Перед дальнейшим использованием в качестве рабочего плана нужна полная reconciliation статусов и чёткое отделение `Plan item ID` от реальных GitHub PR.

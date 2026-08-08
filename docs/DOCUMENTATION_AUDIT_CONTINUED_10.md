# Продолжение аудита актуальности документации — часть 10

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_9.md` содержат результаты №21–29. Этот файл продолжает тот же последовательный аудит с №30.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 30 | `PROJECT_SOURCE_OF_TRUTH.md` | ⚠️ Частично актуален / требует reconciliation как canonical document | Полезные product/architecture guardrails сохранены, но source hierarchy, repository visibility, i18n, Turborepo, backend/database inventory и historical master-context references отстали от current `main` |

---

## 30. `PROJECT_SOURCE_OF_TRUTH.md`

**Статус:** ⚠️ частично актуален; как canonical navigation/source-priority документ требует приоритетной reconciliation. Общая цель, product boundary и ряд архитектурных guardrails остаются полезными, но документ смешивает нормативные решения, исторический master context и фактическое current implementation state.

### Проверено

- полный `docs/PROJECT_SOURCE_OF_TRUTH.md`;
- GitHub repository metadata/visibility;
- current root `package.json`;
- current `apps/web/src/i18n/index.ts`;
- current `apps/api/src/modules/` inventory;
- current `apps/api/prisma/schema.prisma`;
- current `docs/MVP_SCOPE_LOCK.md`;
- current `docs/TODO_VERIFY.md`;
- actual `docs/master-context/01_...23_...` inventory;
- current `main` at `a3fa777f0d9cb57e0daded474ad1028ee35c59e7` (PR #525).

### Что подтверждено как актуальное

- Product purpose и core learning loop в §1 остаются релевантными: admin → group/course → assignment/access → learner lesson/progress → assessment/certificate → manager/admin reporting.
- Architectural choice `modular monolith first`, NestJS + TypeScript, React + Vite + TypeScript, PostgreSQL, Prisma, pnpm workspace, Railway-first и Docker portability соответствуют current repository direction.
- Backend как authoritative boundary для permissions/RBAC и frontend hiding только как UX — правильный и current security principle.
- Organization scoping остаётся фундаментальной multi-tenant boundary для business data.
- Future-scope guardrails (не добавлять microservices/Kubernetes/SCORM/xAPI/LTI/native mobile/AI product features без отдельного решения) остаются полезными.
- API base `/api/v1` и fixed roles learner/instructor/manager/admin соответствуют current implementation.
- Local S3-compatible storage via MinIO и production abstraction как S3-compatible provider являются устойчивой архитектурной формулировкой, если не привязывать её к конкретному live provider без evidence.

### Существенные несоответствия

1. **Repository visibility неверна.** §2 и §12 говорят `private GitHub monorepo` / `Создать private GitHub repo`, но GitHub metadata current repository: `private: false`, `visibility: public`. Это уже не историческая мелочь: документ объявляет себя главным source of truth и повторяет security/product assumption, который фактически не выполняется.

2. **`Build orchestration: Turborepo optional` устарело.** Root `package.json` запускает `dev`, `build`, `lint`, `typecheck`, `test` через `turbo`. Turborepo уже является фактической workspace orchestration, а не просто optional future choice.

3. **`UI language: Russian` больше не описывает current product.** `apps/web/src/i18n/index.ts` поддерживает `ru`, `en`, `kk`, `zh`, default/fallback — `ru`. Корректнее: Russian default/fallback + four supported locale bundles; при этом full localization enforcement остаётся partial по результатам отдельного i18n audit.

4. **Auth summary слишком упрощён.** Документ говорит `JWT access token + refresh token in httpOnly cookie`. Current auth/session design включает Session records, revocation, refresh token hash/expiry, access-cookie/header credential resolution и CSRF semantics для access-cookie unsafe requests. Для canonical document лучше ссылаться на `AUTH_SESSION_STORE_DESIGN.md`/`AUTH_TOKEN_REVOCATION.md`, а не фиксировать упрощённую одну строку, которая быстро стареет.

5. **Главный список документов содержит неверные/неполные пути.** §4 перечисляет `01_LMS_...`—`23_LMS_...` как будто они находятся рядом с current root docs. Фактически они лежат в `docs/master-context/`. Это уже было подтверждено отдельным audit `AI_AGENT_STARTER_PROMPT.md`.

6. **Historical master-context artifacts не помечены как historical/reference.** `01_...23_...` — исходный master context, но current code/root docs уже неоднократно расходятся с этими drafts. Canonical source document должен явно сказать: `docs/master-context/**` — historical intent/reference, не current implementation source.

7. **Priority order в §5 смешивает нормативные решения и фактические implementation facts.** В списке есть owner decision → `PROJECT_SOURCE_OF_TRUTH` → `MVP_SCOPE_LOCK` → GitHub Issue → Architecture Map → API Contracts → Database Model → Product Backlog, но **current code/tests/Prisma schema отсутствуют как отдельный источник фактического поведения**. В результате stale canonical doc формально может “победить” реально работающий код при вопросе “что сейчас реализовано”.

8. **`TODO_VERIFY.md` используется как high-priority current decision source без freshness qualification.** §4 ставит его третьим главным документом. Но current `TODO_VERIFY.md` сам содержит быстро стареющие/частично устаревшие claims, включая accepted production MinIO-on-Railway assumption и старые auth wording. Он полезен как decision queue, но не должен автоматически определять current implementation facts.

9. **`Architecture Map`, `Database Model`, `Product Backlog` в §5 неоднозначны.** В current root docs нет документов именно с такими canonical names; ближайшие artifacts находятся в `docs/master-context/03_...`, `04_...`, `07_...`, то есть historical drafts. Если подразумеваются другие current docs, нужно указать точные пути.

10. **§7 backend module inventory устарел как “по факту”.** Current `apps/api/src/modules/` содержит `memberships`, `course-access`, `manager-team-scope`, `manager`, `openapi`, `course-materials`, `upload`, `assessment-attempts`, `assessment-questions` и другие current boundaries. Документ частично поясняет `roles` и `files`, но всё равно не отражает current module topology и смешивает product capabilities с physical Nest module directories.

11. **§8 minimal frontend zones смешивает реализованные и отсутствующие зоны без статусов.** `Notifications` и `Audit Log` перечислены рядом с реальными UI zones, хотя current scope/audit подтверждают отсутствие notifications/audit-log product modules. Для source-of-truth документа это должно быть `implemented / partial / planned`, а не единый flat list.

12. **§9 database foundation является ранней target model, а не current Prisma schema.** В списке есть `roles`, `user_roles`, `course_modules`, `files`, `course_assignments`, `assignment_targets`, `enrollments`, `lesson_progress`, `course_progress`, `notifications`, `audit_logs`. Current Prisma использует, среди прочего, `Membership`, `CourseInstructor`, `GroupMember`, `ManagerGroup`, `CourseMaterial`, `MultipartUpload`, `Assignment`, `Progress`, `Session`, assessment child models и `MaterialFileDeletionAudit`; отдельные `course_modules`, `enrollments`, `notifications`, `audit_logs` отсутствуют. Это одно из самых критичных расхождений, потому что документ объявляет DB foundation как source of truth.

13. **§10 Definition of Ready для GitHub Issue полезен, но §5 ставит GitHub Issue выше архитектурных/API/DB docs при условии “если не противоречит source of truth”.** Для autonomous agents этого недостаточно: issue может быть старым. Нужен explicit freshness rule: issue/task contract применим только если проверен против current code, current canonical decisions и newer owner decisions.

14. **§11 Definition of Done упрощён относительно current CI/security contract.** Typecheck/lint/tests/build и migrations/docs/RBAC — правильная база, но current CI также содержит dependency/security gates, browser E2E, accessibility, visual regression, container scans. Canonical DoD лучше ссылаться на actual CI workflow/quality policy, а не держать сокращённый список как будто он полный.

15. **§12 “первый практический порядок” давно выполнен и больше не должен находиться в current source-of-truth как startup checklist.** Private repo, docs, monorepo, pnpm, API/Web, PostgreSQL/Prisma, compose, health, CI, M1 уже существуют или изменились. Этот раздел либо historical bootstrap, либо его нужно заменить current onboarding/source-navigation checklist.

16. **Snapshot freshness недостаточна для главного source document.** Файл обновлён 2026-08-06 и сам говорит `PR #505+`, тогда как current main уже PR #525. Для главного навигационного документа нужен `Verified against main SHA` и явный separation между stable principles и mutable realization state.

### Главная архитектурная проблема source hierarchy

Сейчас один список пытается отвечать сразу на два разных вопроса:

1. **Что проект решил/что должно быть?** — owner decisions, scope lock, ADR/current policy docs.
2. **Что реально реализовано сейчас?** — current code, Prisma schema/migrations, tests, CI/runtime config.

Эти источники нельзя безоговорочно складывать в одну линейную priority chain. Если current implementation расходится с desired decision, это **drift/gap**, а не повод объявить одну сторону “истиной” для обоих вопросов.

### Что изменить

1. Разделить source hierarchy минимум на три класса:
   - **Normative/product decisions:** latest explicit owner decision → `PROJECT_SOURCE_OF_TRUTH.md` stable principles → `MVP_SCOPE_LOCK.md` + approved exceptions/ADR;
   - **Current implementation facts:** current `main` code → Prisma schema/migrations → tests → CI/runtime config;
   - **Historical/reference:** `docs/master-context/**`, historical plans/logs/snapshots.
2. Явно задать conflict rule: если normative decision и current implementation расходятся, фиксировать `implementation drift`/`documentation drift`, не выдавать desired state за current fact.
3. Исправить repository visibility либо зафиксировать owner decision, что public repository теперь принят.
4. Заменить `Turborepo optional` на current fact: Turborepo используется root orchestration.
5. Обновить UI language: `ru` default/fallback, supported `ru/en/kk/zh`; ссылаться на `I18N_GUIDE.md` для деталей и caveats.
6. Обновить auth summary и сделать ссылки на dedicated auth/session/revocation docs вместо подробного stale-prone one-liner.
7. В §4 указать полные пути `docs/master-context/...` и маркировать весь каталог как historical/reference, если это соответствует текущей policy.
8. Заменить неоднозначные `Architecture Map / API Contracts / Database Model / Product Backlog` на точные current paths. Для current runtime API использовать root `API_CONTRACTS.md`; для DB fact source — `apps/api/prisma/schema.prisma` + migrations, а не historical draft.
9. Переписать §7 как current module map либо сослаться на `ARCHITECTURE_MODULE_BOUNDARIES.md`; не поддерживать два расходящихся вручную списка.
10. Переписать §8 со статусами implemented/partial/not implemented либо сослаться на current readiness/scope docs.
11. Удалить §9 как “current database foundation” и заменить ссылкой на Prisma schema + коротким stable domain summary. Historical target model можно оставить только с явной маркировкой.
12. `TODO_VERIFY.md` переопределить как decision backlog/verification queue, а не фактический current source.
13. Definition of Done привязать к current repository workflow/quality docs и branch-enforcement reality; не дублировать сокращённый CI список вручную.
14. §12 перенести в historical bootstrap/onboarding archive либо переписать как current onboarding sequence.
15. Добавить `Stable principles` и `Mutable snapshot` sections; для mutable части хранить `Verified at`, `Verified against main SHA`.
16. После завершения полного documentation audit обновить `PROJECT_SOURCE_OF_TRUTH.md` одним controlled reconciliation PR первым среди canonical docs, потому что его ошибки распространяются на поведение будущих AI agents и review decisions.

### [НЕ ПРОВЕРЕНО]

- Не принято бизнес-решение, должен ли GitHub repository снова стать private или public visibility теперь является допустимым новым состоянием.
- Не проверялся каждый исторический `docs/master-context/11_...23_...` документ на отдельные contradictions; каталог проверен как inventory/reference source, полный audit этого каталога исключён текущей пользовательской задачей.
- Не выполнялась live Railway/provider verification; production storage/deployment provider claims оцениваются только как repository-documentation assertions.
- Не проверялась каждая frontend route/page против flat list §8; достаточно подтверждено наличие i18n и отсутствие Notifications/Audit product modules для доказательства drift статусов.
- Не выполнялся полный schema diff против каждой строки historical §9; current Prisma schema прямо подтверждает ключевые structural replacements/absence перечисленных legacy entities.

### Итог

`PROJECT_SOURCE_OF_TRUTH.md` нельзя считать полностью надёжным current source of truth в его нынешнем виде, хотя его **stable principles** в основном разумны. Наиболее серьёзная проблема — не отдельные stale строки, а модель источников: desired decisions, current implementation facts и historical master context смешаны в одну priority chain. Для автономных агентов это риск систематически принимать устаревший документ за фактическое состояние кода. Документ нужно приоритетно переработать в navigation/decision charter: stable product/architecture principles отдельно, current implementation truth отдельно, historical references отдельно, все mutable snapshots — только с SHA/date evidence.

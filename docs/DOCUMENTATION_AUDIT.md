# Аудит актуальности документации

> **Консолидировано после PR #512.**
>
> Этот файл является единым результатом последовательного аудита 40 root-документов из `docs/`. До консолидации результаты были разбиты на `DOCUMENTATION_AUDIT.md` и `DOCUMENTATION_AUDIT_CONTINUED.md`—`DOCUMENTATION_AUDIT_CONTINUED_20.md`.
>
> Continuation-файлы удалены только для упрощения структуры `docs/`. Дословные pre-consolidation версии остаются доступны в Git history через merge commit PR #512 `4f1a377adcec687843f60ddcb7e2b5977f67273b` и blob SHA из manifest ниже.
>
> Из scope исключались `docs/lms-ui-prototypes-complete/`, `docs/master-context/` и `.gitkeep`. Исходные 40 документов этим cleanup не исправляются; файл сохраняет audit evidence и направления последующего reconciliation/remediation.

## Manifest исходных audit-файлов

| Файл до консолидации | Blob SHA |
|---|---|
| `docs/DOCUMENTATION_AUDIT.md` | `8f1ff3ce7482a074acc115d4be2e1fdea05e426c` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED.md` | `79dba700a5b38df3b1962e517e7ea37d13cc2f86` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_2.md` | `ad4591f79b6035cedf7807b1f54424c802d3d15a` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_3.md` | `6d9bfb319d33dd0ec3a64bde4440e914dab74aa7` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_4.md` | `814e751e476f818907583ce24e823746fab749df` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_5.md` | `f7ee1019fe4d2a02cb127b3fc9fd1754a442a23e` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_6.md` | `41d2917c485468b835d072229bc80c77676e3b1d` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_7.md` | `6be9fc150b300bb13d37573aa33db7c613f6b280` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_8.md` | `f6849c1f697459279b2910875d06750c3394a7e6` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_9.md` | `3b925bb735e7fb98d45ae6c2f30c83fdb5ef9455` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_10.md` | `ac433cfdd061e40b371c697a18a4ac356a765afa` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_11.md` | `fe34da1cabf068d5ce05349dcb94516c24d349d1` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_12.md` | `8edf5f32e8cad458f9178834301fc73f9cf3510c` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_13.md` | `724d38556a98a6ac530285e73f264a856af257b5` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_14.md` | `9753a8051406e88a7d38d0835e2963072de646d3` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_15.md` | `3b0694b9d27c0a41325dd17f828347a6a12044ac` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_16.md` | `119e586ad81c2a13387e4d5983609745fc48098e` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_17.md` | `ff887e6ee5c9b8f74e8f0373e5fb8bdd6c4bd1ca` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_18.md` | `c94e537e64389c40fd2b1055b57f91595023483c` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_19.md` | `3f136430b30713bd541dfc3a23976042d8d094e3` |
| `docs/DOCUMENTATION_AUDIT_CONTINUED_20.md` | `8850b8efc158ab9a3c3b544c10fd7b4585cbf8d6` |

## Сводка 40 документов

| № | Документ | Статус | Ключевой вывод |
|---:|---|---|---|
| 1 | `ACCESSIBILITY.md` | ✅ актуален | A11y/keyboard checks и CI baseline соответствуют репозиторию. |
| 2 | `ADMIN_DEMO_SEED.md` | ⚠️ частично актуален | Guarded seed корректен, verification проверяет только baseline subset. |
| 3 | `AI_AGENT_STARTER_PROMPT.md` | ⚠️ частично актуален | Stale visibility, master-context paths, bootstrap и repository-layer assumptions. |
| 4 | `API_CONTRACTS.md` | ⚠️ частично актуален | Runtime contract в основном верен, manual OpenAPI неполон и дрейфует. |
| 5 | `API_RBAC_MATRIX.md` | ⚠️ частично актуален | Role policies в основном верны; inventory/count и malware callback требуют обновления. |
| 6 | `ARCHITECTURE_MODULE_BOUNDARIES.md` | ⚠️ частично актуален | Не отражает current Web/features layout и фактический CI behavior. |
| 7 | `AUTH_SESSION_STORE_DESIGN.md` | ⚠️ historical/current mix | Current Session уже содержит refresh hash/expiry и rotation. |
| 8 | `AUTH_TOKEN_REVOCATION.md` | ⚠️ частично актуален | Revocation верен; blanket CSRF statement не соответствует refresh-cookie flow. |
| 9 | `CI_AUDIT_BASELINE.md` | ⚠️ частично актуален | CI сильнее snapshot, Semgrep отсутствует, `main` не защищён required checks. |
| 10 | `CONCERNS.md` | ⚠️ частично актуален | Смешивает реальные gaps и уже закрытые concerns. |
| 11 | `CSS_ARCHITECTURE.md` | ⚠️ частично актуален | Основная архитектура верна, guard/selector/font/budget детали требуют уточнения. |
| 12 | `DEAD_CODE_AUDIT.md` | ⚠️ historical snapshot | Несколько old candidates уже неверны или закрыты. |
| 13 | `DEPENDABOT_PNPM_WORKSPACE_POLICY.md` | ⚠️ частично актуален | Не покрывает `/apps/e2e` и `/packages/shared`. |
| 14 | `DEPENDENCY_UPDATE_POLICY.md` | ⚠️ частично актуален | Core policy верна, ownership scopes неполны и automation wording stale. |
| 15 | `DEPLOY_FOUNDATION.md` | ⚠️ частично актуален | Railway mechanics в основном верны, live/staging/storage assumptions дрейфуют. |
| 16 | `DEVELOPMENT_PLAN.md` | ⚠️ historical/current mix | Internal PR IDs не равны GitHub PR, ledger давно не current roadmap. |
| 17 | `FRONTEND_COVERAGE_ROADMAP.md` | ⚠️ частично актуален | Global 40% и assessment 80% реальны; universal 80% не enforced. |
| 18 | `FRONTEND_MVP_MAINTAINABILITY_AUDIT.md` | ⚠️ частично актуален | Hotspots актуальны, methodology/live claims требуют snapshot binding. |
| 19 | `I18N_GUIDE.md` | ⚠️ частично актуален | ru/en/kk/zh верны, persistence/sync/hardcoded/date gaps остаются. |
| 20 | `INSTRUCTOR_COURSE_OWNERSHIP.md` | ⚠️ частично актуален | Критический gap: assignment write-path не гарантирует instructor role. |
| 21 | `MIGRATION_BACKUP_POLICY.md` | ⚠️ частично актуален | Migration flow верен; backup/staging/drift enforcement claims требуют reconciliation. |
| 22 | `MVP_DEFINITION_OF_DONE.md` | ⚠️ historical minimum | Seed/auth/migration/branch-enforcement requirements устарели. |
| 23 | `MVP_LOCAL_RUNBOOK.md` | ⚠️ частично актуален | Compose/bootstrap/Redis/MinIO/health/auth guidance неполна или stale. |
| 24 | `MVP_READINESS_DASHBOARD.md` | ⚠️ stale snapshot | OpenAPI/Dependabot/RBAC/i18n/test/live readiness claims требуют пересчёта. |
| 25 | `MVP_SCOPE_LOCK.md` | ⚠️ частично актуален | Visibility/storage/scope exceptions и Notifications требуют owner reconciliation. |
| 26 | `PASSWORD_RESET_STATUS.md` | ✅ в основном актуален | Intentional 503 skeleton описан корректно; HTTP-boundary evidence ограничено. |
| 27 | `PILOT_CHECKLIST.md` | ⚠️ частично актуален | Seed/migration/auth/OpenAPI/source-doc/live evidence устарели. |
| 28 | `PRODUCTION_HARDENING_BACKLOG.md` | ⚠️ существенно stale | Многие пункты уже реализованы; реальные gaps — branch protection, workspace coverage, ops. |
| 29 | `PROJECT_LOG.md` | ⚠️ retired historical record | Неверный successor claim и internal PR numbering требуют historical banner. |
| 30 | `PROJECT_SOURCE_OF_TRUTH.md` | ⚠️ частично актуален | Canonical navigation смешивает normative, implementation и historical facts. |
| 31 | `PR_89_102_VERIFICATION.md` | ⚠️ historical snapshot | 89–102 — internal work-item IDs; многие blockers позже закрыты. |
| 32 | `RAILWAY_DEPLOY_GUIDE.md` | ⚠️ operational drift | Public API/API_PORT/MinIO/seed/rollback guidance частично superseded. |
| 33 | `RAILWAY_PRODUCTION_SMOKE_STATUS.md` | ⚠️ historical stale | Last-known-good сохранён, но current production не подтверждён. |
| 34 | `RATE_LIMIT_FAILURE_POLICY.md` | ⚠️ частично актуален | Runtime outage и startup-without-Redis semantics смешаны. |
| 35 | `READINESS_AND_SECURITY_GATES.md` | ⚠️ частично актуален | Checks существуют, но merge enforcement выключен; health HTTP payload drift обнаружен. |
| 36 | `RECOMMENDATIONS.md` | ⚠️ mixed backlog | R1/R2.1 частично реализованы, R2.2/R2.3/R4 открыты, R3 требует product decision. |
| 37 | `SHARED_IMPORT_POLICY.md` | ⚠️ в основном актуален | ESLint блокирует root import; package root/test aliases всё ещё существуют. |
| 38 | `STAGING_SMOKE_REPORT.md` | ⚠️ historical bring-up | June smoke полезен как incident history, но current topology его supersedes. |
| 39 | `STORAGE_UPLOAD_STATUS.md` | ⚠️ в основном актуален | Code contract силён; live provider/scanner/scheduler/backfill не доказаны repository. |
| 40 | `TODO_VERIFY.md` | ⚠️ существенно stale | Verification queue смешивает уже реализованные решения, business decisions и live facts. |

## Основные классы расхождений

### 1. Historical snapshot используется как current guidance
Особенно это касается `PROJECT_LOG.md`, `PR_89_102_VERIFICATION.md`, `STAGING_SMOKE_REPORT.md`, старых DoD/readiness/backlog документов и PR-specific auth design docs. Рекомендация: сохранять историю, но добавлять snapshot/SHA/superseded markers и не использовать historical status как current truth.

### 2. Canonical/source-of-truth drift
Главные документы: `PROJECT_SOURCE_OF_TRUTH.md`, `MVP_SCOPE_LOCK.md`, `TODO_VERIFY.md`, `DEVELOPMENT_PLAN.md`. Они смешивают нормативные решения, implementation facts, historical material и live state. Рекомендация: разделить эти категории и добавить freshness/SHA-bound verification.

### 3. Security/readiness configured, но не полностью merge-enforced
CI/CodeQL/Gitleaks/audit/Trivy и readiness checks существуют, однако `main` не защищён required status checks. Trivy использует `--ignore-unfixed`; часть alerting/metrics claims не подтверждена repository. Отдельно найден drift между raw health 503 dependency payload и global exception normalization.

### 4. Railway docs содержат superseded public-API architecture
Current repository guidance ориентирована на private API за Web/nginx и Railway private networking, тогда как historical docs сохраняют direct public API, Public Networking и ручной `API_PORT=3000`. Это нужно явно маркировать superseded и убрать из current runbook guidance.

### 5. Live infrastructure state смешан с repository facts
GitHub code/config не доказывает current storage provider, scanner availability, Redis live state, backups/PITR, Railway topology, fresh smoke или Sentry/alert routing. Эти утверждения должны иметь timestamp/provider/run evidence либо `[НЕ ПРОВЕРЕНО]`.

### 6. Реальные implementation gaps, обнаруженные аудитом
Наиболее значимые:
- instructor assignment write-path не гарантирует instructor role;
- health 503 dependency payload не переживает global exception normalization;
- Notifications/Audit scope конфликтует с отсутствующей реализацией;
- learner course list progress/next lesson gaps;
- visual guest mock не изолирует refresh route;
- Dependabot не покрывает весь workspace;
- branch protection отсутствует.

## Что этот аудит намеренно не делает

- не исправляет исходные 40 документов;
- не меняет код;
- не меняет repository settings;
- не включает branch protection;
- не меняет production;
- не закрывает business decisions.

Этот файл сохраняет **evidence layer**: что было проверено, какие расхождения подтверждены и какие направления следует исправлять отдельным reconciliation/remediation этапом. Для дословных детальных записей каждого шага используйте merge commit PR #512 и blob SHA из manifest выше.

# План разработки LMS

**Обновлён:** 2026-06-07  
**Статус:** Рабочий документ — совместная разработка Claude Code + ChatGPT

---

## Легенда статусов

```
✅ СДЕЛАНО                 — реализовано и проверено в коде
⚠️ ЧАСТИЧНО               — сделано не полностью или не так как заявлено
🚨 ЗАЯВЛЕНО/НЕ СДЕЛАНО    — ChatGPT отчитался, но в коде не реализовано
🔲 НЕ НАЧАТО              — запланировано, работы не велись
📋 ТОЛЬКО ДОКИ            — создан .md файл, код не написан
```

---

# ЧАСТЬ 1 — Исходный план ChatGPT (PR 49–83)

---

## PR 49 — fix cookie auth for local MVP ✅

- Настроить secure cookie behavior по environment
- Исправить CSRF cookie path
- Проверить login → /auth/me → unsafe request with CSRF
- Обновить MVP_LOCAL_RUNBOOK
- Добавить/обновить auth cookie tests

---

## PR 50 — remove stale frontend token checks ⚠️

- Убрать getAuthToken() checks из learner/admin страниц
- Полагаться на ProtectedRoute и apiClient 401 handling
- Удалить или сузить legacy authToken compatibility layer
- Проверить learner courses/assignments/assessments/certificates pages
- Добавить smoke/unit tests на cookie-first frontend auth behavior

> **Факт:** `authToken.ts` переделан в заглушку (`getAuthToken` возвращает строку `'cookie-auth'`), но файл не удалён. Задача выполнена наполовину.

---

## PR 51 — align learner RBAC with learner frontend 📋

- Провести audit learner frontend API calls
- Сопоставить их с backend rolePolicies
- Разрешить learner read только там, где это безопасно
- Не расширять create/admin permissions
- Добавить backend tests на learner read access и forbidden admin actions
- Обновить RBAC_MATRIX/API docs

> **Факт:** Обновлён только `RBAC_MATRIX.md`. Реального аудита кода не было.

---

## PR 52 — fix certificate read scope ✅

- Разделить own certificate access и privileged certificate access
- Learner видит только свои certificates
- Admin/manager/instructor видят organization certificates
- Проверить /certificates и /certificates/:id
- Добавить tests на learner own/cross-user и admin org-level access

---

## PR 53 — normalize rate limit error response 🔲

- Привести 429 response к ApiErrorResponse contract
- Вернуть statusCode, error.code, error.message, path, timestamp
- Не обходить общий error format
- Добавить tests на rate limited auth/register routes
- Проверить frontend apiClient error parsing

---

## PR 54 — complete protected frontend route behavior 🚨

- Довести ProtectedRoute после исправления cookie auth
- Redirect unauthenticated на /login
- Сохранять original location и возвращать пользователя после login
- Добавить forbidden state
- Подготовить canAccess/role-aware extension
- Добавить tests на protected redirect

> **Факт:** `ProtectedRoute.tsx` написан корректно — есть loading, unauthenticated, forbidden, canAccess. **Но в `App.tsx` нигде не подключён. Мёртвый код.**

---

## PR 55 — role-aware navigation and route visibility ⚠️

- Показывать admin/learner navigation только подходящим ролям
- Скрывать недоступные разделы
- Не заменять backend RBAC
- Добавить route metadata для required roles
- Проверить admin dashboard links и learner nav
- Добавить tests на visibility по ролям

> **Факт:** Базовая проверка ролей в навигации была ещё до этого PR. `canAccess` в ProtectedRoute есть, но нигде не применяется. Route metadata не добавлена.

---

## PR 56 — replace visible technical ids in learner UI 🚨

- Убрать UUID/technical IDs из learner UI
- Заменить assignment/course/assessment IDs на readable names/titles
- Если API не отдаёт нужные titles — описать contract gap или добавить enrichment
- Проверить learner assignments, assessments, certificates, progress
- Добавить UI tests/smoke checks

> **Факт:** UUID до сих пор видны в `LearnerAssignmentsPage`, `LearnerCertificatesPage`. Не сделано.

---

## PR 57 — frontend UX consistency pass ✅

- Унифицировать loading/error/empty states
- Использовать PageState/EmptyState/StatusBadge везде одинаково
- Привести формы, кнопки, списки, таблицы, spacing к одному стилю
- Проверить mobile layout
- Убрать raw loading/error там, где уже есть shared UI

---

## PR 58 — API client cleanup and typed domain modules ✅

- Разбить большой apiClient.ts на domain modules
- authApi, coursesApi, lessonsApi, assignmentsApi, assessmentsApi, certificatesApi
- Оставить общий request/error/CSRF слой
- Подключить shared ApiErrorResponse type
- Упростить imports в страницах
- Добавить tests для apiRequest 401/403/429/error parsing

---

## PR 59 — backend smoke test for real MVP flow ⚠️

- Добавить backend integration/smoke scenario
- Register organization/admin или seed setup
- Login, Create course, lesson, assignment
- Record progress, Issue certificate
- Проверить, что backend MVP flow работает end-to-end

> **Факт:** `mvp-flow.smoke.spec.ts` существует (189 строк), но **использует моки Prisma**, не реальную БД. Это unit-тест, не настоящий smoke против реальной базы.

---

## PR 60 — basic web unit and smoke tests ✅

- Login render/error state
- ProtectedRoute loading/redirect/authenticated states
- apiClient 401/403/429 handling
- StatusBadge/PageState/EmptyState
- Learner courses/assignments/assessments page smoke
- Не добавлять тяжёлый Playwright первым шагом

---

## PR 61 — sync manual OpenAPI with current controllers ✅

- Сверить controllers/routes с openapi.document.ts
- Добавить missing endpoints
- Обновить auth cookie/CSRF behavior
- Обновить 429 ApiErrorResponse
- Отметить disabled password reset

---

## PR 62 — make local env loading explicit ✅

- Проверить, как API загружает .env локально
- Подключить dotenv/config для local dev
- Явно задокументировать exported env workflow
- Сохранить production env priority
- Добавить tests/docs для env behavior

---

## PR 63 — safe api startup and error logging ✅

- Добавить понятное startup logging
- Логировать port, env mode, frontend origin без secrets
- Логировать bootstrap failures
- Не логировать tokens/cookies/passwords/auth headers
- Использовать Nest Logger без новой dependency

---

## PR 64 — API response contract consistency ⚠️

- Проверить list/detail/create response shapes
- Согласовать naming/status/error patterns
- Убрать frontend-specific guesses
- Проверить shared ApiErrorResponse usage
- Задокументировать contract conventions
- Подготовить базу для переносов типов в shared

> **Факт:** `api-response.ts` создан — инфраструктура есть. Системного аудита всех ответов не проводилось.

---

## PR 65 — CI and quality gates hardening ⚠️

- Убедиться, что CI стабильно запускает lint/typecheck/tests/build/prisma generate
- Добавить missing web/api test scripts coverage
- Проверить pnpm frozen lockfile после dependency changes
- Добавить branch/PR checklist в docs

> **Факт:** `ci.yml` обновлён (+9 строк). Полнота hardening не ясна.

---

## PR 66 — MVP readiness dashboard and docs sync ✅

- Обновить README/API_STATUS под реальный статус
- Добавить MVP readiness table
- Отметить implemented/partial/disabled/stub/planned/not implemented
- Синхронизировать RBAC, OpenAPI, runbook notes

---

## PR 67 — document current storage upload status 📋

- Проверить S3/MinIO status
- Если upload не реализован — явно задокументировать как placeholder/planned
- Обновить README/API_STATUS/OpenAPI

---

## PR 68 — clarify password reset status 📋

- Явно отметить password reset как disabled/skeleton
- Не делать полную реализацию без отдельного security PR
- Добавить coverage/docs на ServiceUnavailable behavior

---

## PR 69 — move selected api response types to shared ⚠️

- Перенести 1–2 простых API response types в shared
- Обновить frontend/backend imports

---

## PR 70 — verify/expand local demo seed data ✅

- Добавить/уточнить demo accounts: admin, instructor, learner
- Course, lesson, assessment, progress/certificate sample
- Убедиться, что MVP можно показать сразу после seed

---

## PR 71 — full learner/admin RBAC audit 🔲

- Сначала audit, не fixes
- Сопоставить frontend API calls и backend role policies
- Проверить learner/admin scopes, ownership и org scope
- Создать follow-up PRs для конкретных дыр

---

## PR 72 — frontend form validation standard ⚠️

- Единый подход к form validation, единые error messages
- Disabled/loading submit states
- Reusable form field patterns
- Применить к ключевым admin/learner формам

> **Факт:** `formValidation.ts` создан (23 строки), применён только в `LoginPage`.

---

## PR 73 — reusable admin page toolkit ⚠️

- PageHeader, DataTable, FormField, Toolbar, ConfirmDialog, EmptyState
- Сделать добавление новых admin CRUD pages быстрее

> **Факт:** `adminPage.tsx` создан — есть `AdminPageLayout`, `AdminPageHeader`, `AdminCard`. Нет: DataTable, FormField, Toolbar, ConfirmDialog.

---

## PR 74 — API pagination/filter/sort consistency plan 🔲

- Проверить list endpoints
- Определить pagination, search/filter/sort conventions
- Зафиксировать contract перед массовым ростом данных

---

## PR 75 — frontend happy-path smoke tests 🔲

- Login page renders, Admin shell opens
- Learner course page loads, Protected redirect works

---

## PR 76 — document migration and backup policy 🔲

- Migration review flow, clean DB/staging checks
- Backup before production migration, rollback plan

---

## PR 77 — plan deploy foundation 🔲

- Выбрать deployment target
- Описать env strategy, healthcheck, migrations и rollback

---

## PR 78 — plan full stack docker strategy 🔲

- Определить infra-only, full dev, production compose
- Решить, нужны ли API/Web Dockerfile

---

## PR 79 — dependency/update policy 🔲

- Описать как обновлять dependencies
- Lockfile policy, security audit policy

---

## PR 80 — architecture/module boundaries doc 🔲

- Описать API modules, shared package, web app structure
- Где хранить types, API calls, UI components

---

## PR 81 — admin CRUD expansion plan 🔲

- Определить какие admin CRUD pages нужны для MVP
- Зафиксировать order of implementation

---

## PR 82 — product permission and workflow matrix 🔲

- Описать основные пользовательские сценарии для каждой роли
- Для каждого указать API, frontend page, role, status

---

## PR 83 — post-MVP maintainability backlog 🔲

- Real file upload, Full password reset
- Refresh sessions/session store
- Production deploy automation
- Advanced reporting, E2E Playwright suite

---

# ЧАСТЬ 2 — Обновлённый план Claude Code (PR 84–103)

*Составлен на основе аудита кода. Приоритизирован для запуска MVP на Railway.*

---

## БЛОК 0 — Критические исправления

---

## PR 84 — fix: wire ProtectedRoute into App.tsx

**Проблема:** ProtectedRoute существует но нигде не используется — мёртвый код.

Что входит:
- Обернуть `/learn/*` и `/admin/*` в ProtectedRoute в App.tsx
- Проверить redirect неаутентифицированных на `/login`
- Убедиться что `location.state.from` сохраняется и восстанавливается после входа
- Добавить тест что защита реально работает

---

## PR 85 — refactor: replace App.tsx pathname chain with React Router Routes

**Проблема:** App.tsx — 300+ строк `if (pathname === ...)`. Не масштабируется.

Что входит:
- Заменить на `<Routes>` / `<Route>` из react-router-dom
- Вложенные маршруты для `/learn/*` и `/admin/*`
- Подключить ProtectedRoute как layout-обёртку
- Роль-зависимый доступ через `canAccess` prop

---

## PR 86 — fix: remove authToken.ts legacy shim

**Проблема:** `authToken.ts` существует как заглушка — не удалён.

Что входит:
- Удалить `authToken.ts` и `authToken.spec.ts`
- Убедиться что ни одна страница его не импортирует
- Завершить PR 50

---

## БЛОК 1 — Railway деплой

---

## PR 87 — feat: Dockerfile for API (NestJS)

Что входит:
- Multi-stage сборка: `node:20-alpine` build → run
- `pnpm install` → `prisma generate` → `nest build`
- Non-root пользователь в контейнере
- `PORT` через env var
- Health check: `GET /api/v1/health`
- `.dockerignore`

---

## PR 88 — feat: Dockerfile for Web (React + nginx)

Что входит:
- Multi-stage: `node:20-alpine` build → `nginx:alpine`
- `pnpm install` → `vite build`
- `nginx.conf`: SPA routing (`try_files $uri /index.html`), proxy `/api/v1` → API сервис, gzip, security headers
- `.dockerignore`

---

## PR 89 — feat: Railway configuration

Что входит:
- `railway.json` — два сервиса: `api` и `web`
- PostgreSQL plugin на Railway
- `prisma migrate deploy` при старте API
- Healthcheck для обоих сервисов
- `infra/railway/README.md` — пошаговая инструкция деплоя

---

## PR 90 — feat: production environment setup

Что входит:
- `.env.production.example` со всеми обязательными переменными
- CORS настройка для production домена
- Документация: какие переменные задать в Railway dashboard
- Инструкция: первый деплой → migrate → seed

---

## БЛОК 2 — Admin CRUD

---

## PR 91 — feat: admin user management UI

Что входит:
- Список пользователей с именем, email, ролью, статусом
- Форма создания: email, ФИО, пароль, роль
- Деактивация пользователя
- Подключить к `GET/POST /api/v1/users`
- Использовать `AdminPageLayout` / `AdminPageHeader` из `adminPage.tsx`

---

## PR 92 — feat: admin course management UI

Что входит:
- Список курсов (название, статус, кол-во уроков)
- Форма создания курса (название, slug, описание)
- Изменение статуса: `draft → published → archived`
- Подключить к `GET/POST /api/v1/courses`

---

## PR 93 — feat: admin lesson management UI

Что входит:
- Список уроков курса с порядком
- Форма создания/редактирования (название, описание, порядок, статус)
- Изменение порядка уроков
- Подключить к `GET/POST /api/v1/courses/:id/lessons`

---

## PR 94 — feat: admin materials management UI (links only)

*Без file upload на этом этапе — только ссылки.*

Что входит:
- Список материалов курса/урока
- Форма: название, URL ссылки, тип (file/link)
- Удаление материала
- Подключить к `GET/POST /api/v1/courses/:id/materials`

---

## PR 95 — feat: admin assignment management UI

Что входит:
- Список назначений (курс, кому назначен, статус, дедлайн)
- Форма: выбор курса + пользователь или группа + дата дедлайна
- Отмена назначения
- Подключить к `GET/POST /api/v1/assignments`

---

## PR 96 — feat: admin assessment builder UI

Что входит:
- Создание теста (название, passing score, max attempts)
- Добавление вопросов: single choice, multiple choice, true/false
- Варианты ответов с отметкой правильного
- Публикация/архивирование теста
- Подключить к `GET/POST /api/v1/assessments`

---

## БЛОК 3 — Файловое хранилище

---

## PR 97 — feat: backend file upload service (S3-compatible)

Что входит:
- AWS S3 SDK (работает с Cloudflare R2, MinIO, AWS S3)
- `POST /api/v1/upload` — multipart upload, возвращает `fileUrl`
- Presigned URL для скачивания
- Env: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- Привязать к `CourseMaterial.fileUrl`

---

## PR 98 — feat: frontend file upload in admin materials

Что входит:
- File picker в форме создания материала
- Upload progress
- Поддержка PDF, изображений, видео
- Отображение ссылок на скачивание в Learner UI

---

## БЛОК 4 — Learner flow

---

## ✅ PR 99 — feat: learner lesson completion flow

Что входит:
- `LessonDetailPage` показывает описание урока и материалы
- Кнопка "Завершить урок" → `POST /api/v1/progress`
- Прогресс курса реально считается и отображается
- Idempotent: повторная отметка не дублирует запись

---

## ✅ PR 100 — feat: learner assessment taking (real)

Что входит:
- Реальная форма: вопросы, варианты ответов, навигация
- Отправка ответов → `POST /api/v1/assessments/:id/attempts`
- Отображение результата: прошёл/не прошёл, процент, разбор ошибок
- Блокировка если превышен `maxAttempts`

---

## ✅ PR 101 — feat: auto certificate issuance after assessment pass

Что входит:
- После успешного теста → автоматически `POST /api/v1/certificates`
- `LearnerCertificateDetailPage` — HTML-страница сертификата
- Имя пользователя, название курса, дата, организация
- Кнопка "Распечатать" (`window.print()`)

---

## БЛОК 5 — Финальная готовность

---

## ✅ PR 102 — feat: complete demo seed data

Что входит:
- Организация `demo-company`
- Admin: `admin@demo.com` / пароль
- Learner: `learner@demo.com` / пароль
- 1 курс → 3 урока → материалы (ссылки)
- 1 тест → 5 вопросов → passing score 60%
- Learner частично прошёл курс (для демонстрации прогресса)

---

## ✅ PR 103 — feat: Railway staging deploy + full MVP smoke

Что входит:
- Деплой на Railway staging
- Применение миграций
- Запуск seed
- Проверка полного цикла: login → курс → уроки → тест → сертификат
- `docs/RAILWAY_DEPLOY_GUIDE.md` — полная инструкция запуска

---

# ЧАСТЬ 3 — CI, Staging, Production Hardening (PR 104–131)

*Выполняется после завершения MVP (PR 84–103). Цель — стабильный CI, безопасный деплой, production-ready auth и тест-покрытие.*

---

## БЛОК 6 — CI и безопасность (PR 104–109)

---

## PR 104 — CI audit baseline ✅

- Зафиксирован текущий commit SHA как baseline перед staging
- Подтверждено: CI включает lint, Prisma generate, typecheck, tests, build
- Результат: `docs/CI_AUDIT_BASELINE.md`

---

## PR 105 — dependency audit и secret scan в CI ✅

- Добавлен `pnpm audit --audit-level high` в GitHub Actions
- Добавлен Gitleaks secret scanning
- Не затронут runtime-код, env/secrets

---

## PR 106 — CodeQL security scan ✅

- Добавлен SAST: CodeQL для JS/TS с `security-extended` ruleset
- Файл: `.github/workflows/codeql.yml`
- Покрывает SQLi/XSS/auth/security smells автоматически

---

## PR 107 — upload security hardening ✅

- Усилена проверка типа файла: extension + magic bytes, не только client-provided mimetype
- Файл: `apps/api/src/modules/upload/upload.validation.ts` + тесты

---

## PR 108 — auth/session production readiness notes ✅

- Зафиксированы production gaps: нет refresh/session store, нет token revocation, custom JWT, in-memory rate limit
- Файл: `docs/AUTH_SESSION_PRODUCTION_READINESS.md`
- Минимальные code changes только

---

## PR 109 — frontend maintainability cleanup ✅

- Аудит размеров MVP-страниц, упрощён course list
- Файл: `docs/FRONTEND_MVP_MAINTAINABILITY_AUDIT.md`
- UI behavior не затронут

---

## БЛОК 7 — Staging (PR 110–117)

---

## PR 110 — MVP smoke test foundation 🔲

- Backend/API smoke tests: `/api/v1/health`, auth happy path, unauthorized/protected routes
- Frontend render smoke tests для всех MVP-critical страниц (Vitest/Jest)
- Использовать существующий стек без новых зависимостей
- Full Playwright E2E — отдельный PR 127

---

## PR 111 — Railway staging deploy execution 🔲

- Проверить Railway/Docker/start scripts/config в repo
- Repo-side fix только если deploy падает из-за кода/config
- Пользователь настраивает Railway dashboard, PostgreSQL, env vars, secrets вручную
- Критерий готовности: Railway build/deploy завершён, есть staging Web URL и API URL

---

## PR 112 — staging migration and seed verification 🔲

- Выполнить/проверить `prisma migrate deploy` на staging
- Выполнить/проверить seed: `railway run --service api node dist/scripts/seed.js`
- Подтвердить demo credentials: `admin@demo.com`, `learner@demo.com`, `Demo1234!`, `demo-company`
- Зафиксировать: commit SHA, migration status, seed status, ошибки если есть

---

## PR 113 — full learner MVP smoke verification 🔲

- Проверить learner flow на staging: login → courses → course detail → lessons → lesson detail → materials → progress → assessment (5 вопросов) → result → certificate → print
- Зафиксировать pass/fail по каждому шагу
- Если найден blocker — создать отдельный fix PR по конкретной ошибке

---

## PR 114 — full admin MVP smoke verification 🔲

- Проверить admin flow на staging: login → users → courses → lessons → materials → assignments → assessment builder → results/certificates
- Upload smoke: valid file, invalid file rejected, too large rejected
- Зафиксировать pass/fail по каждому шагу

---

## PR 115 — staging smoke report и MVP readiness checklist 🔲

- Создать/обновить docs/status файл
- Зафиксировать: date, commit SHA, Web URL, API URL, DB/migration status, seed status, результаты smoke, blockers, known limitations, rollback notes
- Итог: MVP ready / not ready. Нет неподтверждённых "pass"

---

## PR 116 — fix staging blockers found during smoke 🔲

- Fix только подтверждённых blockers из PR 113/114/115
- Один независимый blocker = один маленький PR
- После исправления повторить релевантный smoke step и зафиксировать retest
- Не делать refactor без необходимости

---

## PR 117 — post-MVP production hardening backlog 🔲

- Зафиксировать backlog с приоритетами P0/P1/P2 (не реализовывать):
  - refresh/session store; token revocation; замена custom JWT на `jose`; Redis-backed rate limit; stronger upload scanning; malware scan; coverage threshold; full Playwright E2E; Dependabot/Renovate; branch protection; production observability; backup restore drill
- Зафиксировать уже закрытое: dependency audit, secret scan, CodeQL, basic upload hardening
- Для каждого пункта указать будущий PR/этап

---

## БЛОК 8 — Production hardening (PR 118–131)

---

## PR 118 — auth/session minimal tests and hardening 🔲

- Tests for login/logout, unauthorized access, role guard behavior, Cookie/CSRF unsafe request behavior
- Minimal hardening только если можно без env/schema/migration
- Компенсирует docs-only PR 108

---

## PR 119 — frontend cleanup: рефактор admin pages ✅

- `AdminLessonsPage`, `AdminMaterialsPage`, `AdminAssessmentBuilderPage` переведены на `AdminPageLayout` / `AdminPageHeader` / `AdminCard`
- Удалён дублирующийся inline sidebar HTML из каждой страницы
- navItems с `isCurrent` для подсветки активного пункта меню
- UX/API/routes/auth behavior не затронуты

---

## PR 120 — refresh/session store design + Prisma migration 🔲

- Session/refresh token Prisma model и migration
- Safe token storage design
- Tests для session creation/expiration
- Staging migration verification; существующий login flow не должен быть сломан

---

## PR 121 — token revocation and logout hardening 🔲

- Revoke current refresh/session при logout
- Optional logout-all endpoint
- Tests для revoked session

---

## PR 122 — replace custom JWT with `jose` 🔲

- Заменить custom JWT implementation на `jose`
- Сохранить JWT payload contract
- Tests для sign/verify/expired/invalid tokens
- Dependency audit после добавления зависимости

---

## PR 123 — Redis-backed rate limit 🔲

- Redis-backed limiter вместо in-memory
- Env config задокументирован; safe fallback/error behavior
- Tests для limit behavior; работает со staging Redis

---

## PR 124 — stronger upload scanning 🔲

- Более глубокая валидация файлов: archive/Office validation, safer filename/metadata handling
- Дополнительные negative tests
- Upload tests green, staging upload smoke pass

---

## PR 125 — malware scan integration 🔲

- Выбрать scanner/service; интеграция с upload flow
- Error/timeout behavior; tests/mocks
- Malicious/suspicious file rejected или quarantined; upload happy path сохраняется

---

## PR 126 — coverage threshold ✅

- `collectCoverageFrom` добавлен в `apps/api/jest.config.cjs`, исключены `scripts/`, `*.module.ts`, `main.ts`
- Пороги: statements 60%, branches 45%, functions 60%, lines 60%
- CI gate активен — падает при снижении ниже порога
- Фактический coverage: ~69% statements, ~79% branches, ~72% functions

---

## PR 127 — full Playwright E2E ❌ УДАЛЕНО

- Playwright написан, 2 smoke теста, CI job добавлен
- **Удалён** (`apps/e2e/`, `.github/workflows/e2e.yml`) по решению владельца
- Причина: Railway cold start race condition — CI стартует раньше чем деплой завершается; flaky тесты добавляли 5–6 минут ожидания без реальной пользы
- Вместо E2E — unit tests + ручная проверка после деплоя

---

## PR 128 — Dependabot / Renovate 🔲

- Config с grouping rules, schedule, security update behavior
- Не создавать шум без правил группировки

---

## PR 129 — branch protection 🔲

- Проверить и настроить: required CI, required CodeQL, no direct push, PR required
- Зафиксировать статус — подтверждается пользователем

---

## PR 130 — production observability 🔲

- Health/logging/error tracking plan или интеграция
- Runtime error visibility, deployment status visibility
- Basic alerts если инфра доступна

---

## PR 131 — backup restore drill 🔲

- Backup и restore procedure
- Test restore drill на non-production DB
- Зафиксировать RPO/RTO assumptions

---

## Итоговая карта ЧАСТЬ 3

```
БЛОК 6: CI и безопасность        PR 104–109   6 PR  ✅ СДЕЛАНО
БЛОК 7: Staging                  PR 110–117   8 PR  🔲 НЕ НАЧАТО (частично устарело)
БЛОК 8: Production hardening     PR 118–131  14 PR  ⚠️ 119✅ 126✅ 127❌ остальные 🔲
──────────────────────────────────────────────────────────────
ИТОГО ЧАСТЬ 3:                               28 PR
```

> Примечание: PR 151/152/153 удалены как дубли (покрываются PR 127, 129, 131).

---

# ЧАСТЬ 4 — Новые фичи и архитектура (PR 132–150)

*Добавлено 2026-06-07. Выполнять после стабилизации hardening (PR 118–131).*

---

## PR 132 — Frontend i18n: русский MVP-интерфейс 🔲

- Убрать дубль `Log out` в навигации
- Перевести все видимые UI-тексты через i18n keys
- Default язык — `ru`
- Привести навигацию learner и admin к единому виду
- Заменить `Course / Lesson` на реальные названия там, где данные уже есть

**Критерии готовности:**
- `Log out` присутствует в навигации ровно один раз
- Grep по исходникам не находит hardcoded EN-строк в JSX вне i18n-ключей
- Приложение запускается с `lang=ru` по умолчанию

---

## PR 133 — Demo content cleanup 🔲

- Исправить идемпотентность seed (upsert вместо create там, где нужно)
- Заменить все `example.com` ссылки на корректные demo-заглушки
- Привести названия курсов, уроков и материалов к нормальным русским названиям
- Применить seed на Railway staging

**Критерии готовности:**
- Двойной запуск `npx prisma db seed` не увеличивает количество записей
- Grep по `seed.mjs` не находит `example.com`
- Staging содержит актуальные demo-данные

---

## PR 134 — Repeatable staging smoke script 🔲

- Написать скрипт (`scripts/smoke.sh` или `scripts/smoke.ts`): API health, Web health, Web→API proxy
- URL и токены — через env-переменные, без хардкода
- Написать инструкцию запуска в `scripts/SMOKE.md`
- Проверить скрипт против реального staging

**Критерии готовности:**
- Скрипт запускается одной командой и завершается с exit code 0 на staging
- Все три проверки (API, Web, proxy) явно присутствуют в скрипте
- `scripts/SMOKE.md` содержит инструкцию с примером команды запуска

---

## PR 135 — Storage/upload: аудит и план внедрения 🔲

- Прочитать текущий upload module и зафиксировать фактическое состояние
- Сверить `STORAGE_UPLOAD_STATUS.md` с реальным кодом
- Проверить MinIO/S3 placeholders: что реализовано, что заглушка
- Написать `STORAGE_PLAN.md` с конкретными шагами, env-переменными, оценкой трудозатрат

**Критерии готовности:**
- `STORAGE_UPLOAD_STATUS.md` содержит статус каждого метода upload: `implemented` / `stub` / `missing`
- `STORAGE_PLAN.md` содержит пошаговый план с конкретными env-переменными (без значений) и оценкой в часах

---

## PR 136 — Password reset flow 🔲

- Реализовать request password reset flow
- Реализовать confirm password reset flow
- Хранить reset token только в хешированном виде с TTL и флагом одноразовости
- Не раскрывать, существует ли email в системе (одинаковый ответ для существующего и несуществующего)
- Добавить Zod-валидацию входных данных
- Добавить тесты happy path и negative cases

**Критерии готовности:**
- POST /auth/reset-password-request возвращает одинаковый ответ для существующего и несуществующего email
- POST /auth/reset-password с валидным токеном меняет пароль
- Повторное использование токена возвращает 400/410
- Истёкший токен отклоняется
- Старый пароль после reset возвращает 401

---

## PR 137 — Refresh token flow и session lifecycle 🔲

*Требует завершённого PR 120.*

- Спроектировать access token + refresh token lifecycle
- Добавить refresh endpoint
- Хранить refresh token в httpOnly cookie
- Оставить access token короткоживущим
- Реализовать rotation refresh token
- Добавить тесты: refresh, expired refresh, revoked refresh, invalid refresh

**Критерии готовности:**
- POST /auth/refresh с валидным refresh token возвращает новый access token
- POST /auth/refresh с истёкшим/revoked токеном возвращает 401
- Refresh token недоступен из JavaScript (`document.cookie` не содержит refresh token)
- Существующие POST /auth/login и GET /auth/me не сломаны

---

## PR 138 — Roles in JWT: архитектурное решение 🔲

- Проанализировать текущую модель ролей и membership
- Выбрать один подход: DB-backed roles или roles в JWT
- Зафиксировать решение как `docs/ADR_ROLES_IN_JWT.md`
- Если роли в JWT — обновить sign/verify/current-user flow и покрыть тестами
- Если DB-backed — зафиксировать как осознанный trade-off

**Критерии готовности:**
- Файл `docs/ADR_ROLES_IN_JWT.md` существует с явным выбором и обоснованием
- Role guard behavior покрыт тестами в обоих случаях

---

## PR 139 — Rate limiting: кастомный middleware или Nest Throttler 🔲

- Сравнить текущий custom rate limiter с `@nestjs/throttler`
- Выбрать: оставить custom middleware или мигрировать на ThrottlerModule
- Зафиксировать решение в `docs/ADR_RATE_LIMITING.md`
- Покрыть тестами auth/register/reset endpoints (429 при превышении)
- Зафиксировать fallback behavior при недоступном Redis

**Критерии готовности:**
- `docs/ADR_RATE_LIMITING.md` содержит явный выбор с обоснованием
- Auth/register/reset endpoints возвращают 429 после превышения лимита

---

## PR 140 — OpenAPI generation через Nest Swagger 🔲

- Добавить `@nestjs/swagger`
- Подключить Swagger/OpenAPI generation в backend
- Описать основные DTO/response/error contracts
- Настроить генерацию OpenAPI документа
- Удалить или пометить deprecated устаревший ручной OpenAPI-файл

**Критерии готовности:**
- GET /api-json (или аналог) возвращает валидный OpenAPI JSON
- Все публичные и защищённые endpoints присутствуют в спецификации
- Auth requirements (Bearer token) отражены в спецификации

---

## PR 141 — Frontend data loading architecture 🔲

- Выбрать подход: `@tanstack/react-query` или внутренний data-loading hook
- Зафиксировать выбор в `docs/ADR_DATA_LOADING.md`
- Вынести общий паттерн загрузки данных
- Применить к минимум 3 страницам с повторяющимся паттерном
- Добавить тесты для loading/success/error states

**Критерии готовности:**
- `docs/ADR_DATA_LOADING.md` содержит выбор и обоснование
- Минимум 3 страницы используют новый паттерн
- Grep подтверждает отсутствие дублирующего `useEffect + try/catch` в этих файлах

---

## PR 142 — UI foundation: design system decision 🔲

- Проанализировать текущие `global.css`, `ui.css`, `admin.css`
- Выбрать направление: Tailwind/shadcn или CSS design system
- Зафиксировать решение в `docs/ADR_DESIGN_SYSTEM.md`
- Привести базовые UI primitives (button, input, badge) к единому виду
- Добавить минимальные render tests для базовых компонентов

**Критерии готовности:**
- `docs/ADR_DESIGN_SYSTEM.md` содержит явный выбор с обоснованием
- Button, input, badge имеют единообразный внешний вид во всех местах использования
- Каждый базовый primitive покрыт минимум одним render тестом

---

## PR 143 — Shared application layout 🔲

- Создать или актуализировать общий Layout компонент
- Вынести sidebar/topbar из отдельных страниц в Layout
- Реализовать role-aware navigation для learner и admin
- Определить поведение для manager/instructor (если роли есть, но зоны не готовы)
- Убрать дублирующуюся навигацию на страницах, где это безопасно

**Критерии готовности:**
- Grep по страницам не находит дублирующих навигационных компонентов вне Layout
- Learner видит только learner-навигацию, admin — только admin-навигацию
- Mobile viewport (≤768px) не ломает layout

---

## PR 144 — Manager workspace 🔲

- Определить реальные MVP-сценарии manager
- Добавить routes для manager workspace
- Реализовать dashboard, team progress view, overdue view
- Если API не хватает — явно включить backend changes или вынести отдельный PR
- Добавить тесты render/data states и access control

**Критерии готовности:**
- Manager при логине попадает в отдельную зону, недоступную learner и admin
- Данные в dashboard берутся из реального API (нет hardcoded mock-данных)
- ProtectedRoute корректно ограничивает доступ для других ролей

---

## PR 145 — Instructor workspace 🔲

- Определить границы instructor MVP
- Добавить instructor routes
- Реализовать список курсов инструктора или явно зафиксировать отсутствие backend ownership model
- Не смешивать instructor workspace с admin-only behavior
- Добавить access tests и обновить role/navigation docs

**Критерии готовности:**
- Instructor видит только свои курсы, не чужие
- Instructor не имеет доступа к admin-only routes
- Role/navigation docs обновлены и соответствуют реальным routes

---

## PR 146 — Curator role: решение по доменной модели 🔲

- Решить, нужна ли роль `curator` (в Prisma enum её нет)
- Если нужна — подготовить Prisma migration, обновить guards, policies, seed, tests
- Если не нужна — убрать curator из roadmap/docs и заменить на существующую роль
- Зафиксировать решение в `docs/ADR_CURATOR_ROLE.md`

**Критерии готовности:**
- `docs/ADR_CURATOR_ROLE.md` существует с явным решением и обоснованием
- Нет расхождения между Prisma enum и документацией по ролям

---

## PR 147 — DB-backed organization theme 🔲

- Спроектировать `OrganizationTheme` модель
- Добавить Prisma migration
- Добавить API: GET /theme и PATCH /theme (только для admin)
- Подключить frontend к реальным данным темы
- Добавить fallback default theme при отсутствии записи в БД
- Добавить тесты для API и применения темы во frontend

**Критерии готовности:**
- `prisma migrate deploy` выполняется без ошибок
- PATCH /theme от learner возвращает 403
- Frontend применяет тему из API (нет hardcoded цветов/токенов в компонентах)
- При отсутствии записи в БД отображается default theme

---

## PR 148 — Admin appearance page alignment 🔲

*Требует завершённого PR 147.*

- Выбрать canonical route: `/admin/theme-settings` или `/admin/appearance`
- Привести navigation и docs к выбранному route
- Подключить страницу к DB-backed theme из PR 147
- Убрать fake save — если backend не готов, кнопка Save явно неактивна или отсутствует

**Критерии готовности:**
- В codebase существует ровно один canonical route для appearance
- Save реально сохраняет настройки в БД
- Нет кнопки Save, которая не делает ничего или показывает фиктивный success

---

## PR 149 — Certificate PDF generation/download 🔲

- Выбрать способ PDF generation (puppeteer, pdfkit, браузерный print-to-pdf)
- Реализовать backend или frontend PDF generation — без fake download
- Добавить endpoint или UI action для скачивания
- Проверить access: пользователь видит только свои сертификаты
- Добавить тесты для access control и not found cases

**Критерии готовности:**
- GET /certificates/:id/pdf возвращает валидный PDF (Content-Type: application/pdf)
- GET /certificates/:id/pdf чужого сертификата возвращает 403
- GET /certificates/:id/pdf несуществующего сертификата возвращает 404
- PDF содержит имя пользователя, название курса и дату выдачи

---

## PR 150 — Reports and analytics MVP 🔲

- Определить минимальный reports MVP
- Реализовать отчёт по прогрессу пользователей
- Реализовать отчёт по выданным сертификатам
- Реализовать отчёт по просроченным назначениям (если данные доступны)
- Добавить CSV export если это часть MVP
- Добавить тесты для access control и empty/data states

**Критерии готовности:**
- Минимум один отчёт отображает реальные данные из БД (нет hardcoded mock-данных)
- Empty state показывает понятное сообщение, а не пустую таблицу
- Learner не имеет доступа к admin-отчётам
- Документация явно перечисляет, какие отчёты готовы, а какие нет

---

## Итоговая карта ЧАСТЬ 4

```
Новые фичи и архитектура         PR 132–150  19 PR  🔲 НЕ НАЧАТО
```

---

# ЧАСТЬ 4б — Качество, безопасность и production-готовность (PR 151–160)

*Добавлено 2026-06-07 на основе аудита готовности репозитория. Источник: lms_audit_pr_work_plan_final.md.*

---

## PR 151 — Fail-fast env validation с тестами 🔲

**Проблема:** PR 62/90 добавили базовую загрузку env, но запуск API без `DATABASE_URL` или с невалидным `NODE_ENV` не завершается с exit code 1 и читаемым сообщением — нет тестов на эти сценарии.

**Что делаем:**
- Расширить Zod-схему env для API: обязательный `DATABASE_URL`, явная валидация `NODE_ENV` (`development` | `production` | `test`)
- При невалидном env — завершение с exit code 1 и читаемым сообщением до инициализации Nest
- Проверить соответствие `.env.example` и `.env.production.example` фактической Zod-схеме
- Убедиться, что локальные env-файлы не подгружаются в production/CI
- Добавить тесты: happy path и негативный сценарий невалидного env

**Критерии готовности:**
- Запуск API без `DATABASE_URL` завершается с exit code 1 и читаемым сообщением — покрыто тестом
- Запуск API с невалидным `NODE_ENV` завершается с exit code 1 — покрыто тестом
- `grep` по `.env.example` не находит ключей, отсутствующих в Zod-схеме, и наоборот
- lint, typecheck, tests, build — зелёные

---

## PR 152 — DB health check: реальная проверка БД 🔲

**Проблема:** `GET /health` возвращает формальный `ok` без проверки соединения с БД — создаёт иллюзию готовности сервиса при недоступной базе.

**Что делаем:**
- Доработать health endpoint: проверять доступность БД через Prisma (`$queryRaw\`SELECT 1\``)
- Возвращать явное поле `db: "ok"` при успехе
- При недоступной БД — возвращать HTTP 503, не 200
- Добавить graceful shutdown через NestJS lifecycle hooks (`app.enableShutdownHooks()`)
- Response body health не содержит DATABASE_URL, stack trace или внутренних путей
- Добавить тест успешного health check и mock-сценарий недоступной БД

**Критерии готовности:**
- GET /health при доступной БД возвращает HTTP 200 с полем `db: "ok"` — покрыто тестом
- GET /health при недоступной БД возвращает HTTP 503, не 200 — покрыто mock-сценарием
- Response body не содержит DATABASE_URL или stack trace — проверено вручную
- lint, typecheck, tests, build — зелёные

---

## PR 153 — Security audit: публичные endpoints, CORS и формат ошибок 🔲

**Проблема:** Публичные API endpoints не инвентаризированы, формат ошибок может раскрывать stack trace и SQL-текст, CORS не проверен на ограничение по origin. PR 53/118/139 покрывают части, но не проводили сквозной аудит.

**Что делаем:**
- Инвентаризировать все публичные API endpoints и зафиксировать список
- Проверить, что каждый публичный endpoint покрыт Zod-валидацией на вход
- Убедиться, что response body ошибок не содержит stack trace, SQL-текст или внутренние пути
- Проверить CORS: разрешён только явно указанный frontend origin
- Проверить CSRF-поведение для небезопасных методов (POST/PATCH/DELETE)
- Добавить тесты: POST с невалидным body → 400 с понятным сообщением, не 500

**Критерии готовности:**
- Список публичных endpoints зафиксирован в документации или комментарии PR
- POST с невалидным body на любой публичный endpoint возвращает 400, не 500 — покрыто тестом
- Response body ошибок не содержит stack trace, SQL-текст или внутренние пути — проверено по sample ответов
- CORS разрешает только явно указанный frontend origin — проверено
- lint, typecheck, tests, build — зелёные

---

## PR 154 — KK локаль: аудит и синхронизация ключей 🔲

**Проблема:** PR 132 покрывает только RU локаль. KK локализация не проверена на полноту — отсутствующие ключи и непереведённые строки не обнаруживаются автоматически.

**Что делаем:**
- Проверить `kk` локаль на непереведённые или отсутствующие ключи относительно `ru`
- Синхронизировать ключи между `ru` и `kk` — все ключи `ru` должны присутствовать в `kk`
- Добавить script-check или тест на missing translation keys
- Проверить fallback язык — явно задан в конфигурации i18n
- Проверить loading и error тексты в ProtectedRoute и login flow на обоих языках

**Критерии готовности:**
- Скрипт или тест проверки ключей не находит ключей, присутствующих в `ru`, но отсутствующих в `kk`
- Fallback язык явно задан в конфигурации i18n
- Loading и error тексты в ProtectedRoute и login отображаются на активном языке
- lint, typecheck, tests, build — зелёные

---

## PR 155 — Login page UX: layout, доступность и responsive 🔲

**Проблема:** Login page функционально работает, но не готова как качественный вход в LMS: нет ограничения ширины формы, не реализован show/hide пароля, accessibility-сценарии не закрыты.

**Что делаем:**
- Добавить dedicated layout для login page, ограничить ширину формы на desktop (max-width: 400–480px)
- Проверить mobile поведение формы (viewport 375px)
- Добавить show/hide password
- Проверить и исправить: labels, `aria-invalid`, `aria-describedby`, `role="alert"`, `role="status"`
- Исправить `autocomplete` для полей organization/email/password
- Проверить focus states и touch targets (≥44×44px)
- Убедиться, что login redirect не сломан
- Обновить render/unit тесты login page

**Критерии готовности:**
- Login form имеет max-width ≤480px на desktop — проверено в браузере
- На viewport 375px форма не выходит за границы экрана и все поля доступны — проверено в браузере
- Каждое поле имеет явный `<label>` или `aria-label` — проверено в DevTools
- Сообщение об ошибке читается screen reader: есть `role="alert"` или `aria-live` — проверено в DevTools
- Show/hide password кнопка работает корректно
- Touch targets не менее 44×44px — проверено в DevTools mobile mode
- Render тест login page зелёный
- lint, typecheck, tests, build — зелёные

---

## PR 156 — Admin mobile: hamburger и drawer навигация 🔲

**Проблема:** PR 143 упоминает mobile viewport вскользь, но не определяет конкретную реализацию. Admin sidebar на малых экранах не адаптирован: нет hamburger-кнопки и drawer.

**Что делаем:**
- Добавить mobile hamburger control в `AdminPageLayout`
- Реализовать drawer/sidebar open-close state
- Добавить закрытие по overlay и клавише Escape
- Проверить focus management при открытии/закрытии drawer
- Убедиться, что desktop sidebar (≥1024px) не изменился визуально
- Добавить responsive wrappers для admin таблиц: `overflow-x: auto` внутри контейнера
- Обновить или добавить smoke/render тесты на наличие mobile navigation controls

**Критерии готовности:**
- На viewport ≤768px admin sidebar скрыт по умолчанию и открывается через hamburger — проверено в браузере
- Drawer закрывается кликом по overlay и нажатием Escape — проверено в браузере
- Desktop layout (viewport ≥1024px) не изменён визуально — проверено в браузере
- Admin таблицы на viewport 375px не вызывают горизонтальный скролл страницы — проверено в браузере
- lint, typecheck, tests, build — зелёные

---

## PR 157 — Frontend: lazy loading, bundle split и env-driven API base 🔲

**Проблема:** Frontend импортирует страницы статически — learner/admin код попадает в общий bundle без необходимости. API base path захардкожен в коде.

**Что делаем:**
- Перевести route pages на `React.lazy` там, где это безопасно
- Добавить `Suspense` fallback с локализованным loading текстом
- Убедиться, что protected routes и redirects не ломаются
- Настроить Vite build split/manual chunks для admin и learner зон
- Перевести API base URL на `VITE_API_BASE_URL` из env
- Сохранить dev proxy для локального режима
- Задокументировать frontend env-переменные

**Критерии готовности:**
- Admin и learner pages присутствуют как отдельные chunks в `dist/assets/` после `vite build` — проверено по именам файлов
- При медленной загрузке показывается Suspense fallback, а не пустой экран — проверено в браузере (throttle)
- ProtectedRoute и login redirect работают корректно — покрыто тестами
- `VITE_API_BASE_URL` читается из env, не захардкожен — `grep -r "api/v1" src/` не находит прямых строк вне env-конфига
- `vite build` завершается без ошибок
- lint, typecheck, tests, build — зелёные

---

## PR 158 — SEO/meta, favicon, manifest и шрифт 🔲

**Проблема:** `index.html` минимален: нет `noindex` для приватной LMS, нет favicon, placeholder title и нет корректного подключения шрифта Inter без внешних CDN.

**Что делаем:**
- Добавить `<meta name="robots" content="noindex,nofollow">` для приватной LMS
- Уточнить title и description (убрать "Vite App" и placeholder-текст)
- Добавить favicon
- Добавить web manifest (или явно зафиксировать решение не добавлять с обоснованием)
- Добавить theme-color
- Подключить Inter self-hosted (без запросов к fonts.googleapis.com)
- Добавить CSS font-family fallback (system fonts → sans-serif)
- Не добавлять внешние CDN без осознанного решения по privacy

**Критерии готовности:**
- `<meta name="robots" content="noindex,nofollow">` присутствует в `index.html` — проверено grep
- Title и description не содержат placeholder-текст — проверено вручную
- Favicon отображается во вкладке браузера — проверено в браузере
- Inter подключается без запросов к fonts.googleapis.com — проверено в Network DevTools
- CSS font-family содержит системный fallback
- `vite build` завершается без ошибок
- lint, typecheck, build — зелёные

---

## PR 159 — Accessibility baseline 🔲

**Проблема:** В проекте есть отдельные a11y элементы, но нет подтверждённого baseline по всему приложению: нет skip link, heading hierarchy не проверена, icon-only кнопки могут не иметь aria-label.

**Что делаем:**
- Добавить skip-to-content link
- Проверить наличие `<main>` landmark на ключевых страницах
- Проверить heading hierarchy (h1 → h2 → h3) на admin и learner страницах
- Проверить focus-visible состояния на всех интерактивных элементах
- Найти и исправить кнопки без текстового названия (icon-only buttons) — добавить `aria-label`
- Проверить таблицы admin pages: добавить `caption` или `aria-label`
- Проверить loading/error states на наличие `aria-live` или `role="alert"`
- Проверить цветовой контраст для основных текстовых элементов
- Добавить render тесты на ключевые a11y элементы
- Зафиксировать оставшиеся manual a11y проверки в `docs/A11Y_MANUAL_CHECKLIST.md`

**Критерии готовности:**
- Skip-to-content link присутствует и переводит фокус на `<main>` — проверено Tab в браузере
- Каждая ключевая страница содержит ровно один `<main>` — проверено в DevTools
- Ни одна страница не имеет пропуска уровней заголовков (h1 → h3 без h2) — проверено axe или вручную
- Все icon-only кнопки имеют `aria-label` — проверено grep по компонентам
- Все таблицы имеют `caption` или `aria-label` — покрыто render тестом
- Loading/error states содержат `aria-live="polite"` или `role="alert"` — покрыто render тестом
- `docs/A11Y_MANUAL_CHECKLIST.md` содержит список оставшихся manual проверок
- lint, typecheck, tests, build — зелёные

---

## PR 160 — LICENSE, legal/IP и project naming 🔲

**Проблема:** В репозитории нет `LICENSE` файла. Неясны права на код и обязательства по third-party dependencies. Название `lms-for-my-using` не подходит для production/публичного контура.

**Что делаем:**
- Определить юридическую модель: private/internal (all rights reserved) или open-source license
- Добавить `LICENSE` или `NOTICE` файл согласно выбранной модели
- Добавить раздел «License» в README с явным указанием модели
- Принять явное решение по переименованию `lms-for-my-using` перед production — зафиксировать в документации
- Проверить third-party dependency licenses на базовом уровне (`npm licenses list`)
- Перечислить юридические вопросы вне scope PR, которые остаются за владельцем проекта

**Критерии готовности:**
- Файл `LICENSE` или `NOTICE` существует в корне репозитория
- README содержит раздел «License» с явным указанием модели (не placeholder)
- Решение по `lms-for-my-using` rename явно зафиксировано: переименовать до production или оставить с обоснованием
- `npm licenses list` не выявляет зависимостей с GPL/AGPL-лицензиями, конфликтующих с выбранной моделью
- Нет ложного open-source статуса, если проект private/internal
- lint, typecheck, build — зелёные (если затронуты package/config файлы)

---

## Итоговая карта ЧАСТЬ 4б

```
Качество, безопасность, production  PR 151–160  10 PR  🔲 НЕ НАЧАТО
```

---

# ЧАСТЬ 5 — После MVP

*Реализовывать только после успешного запуска MVP на Railway*

| Приоритет | Фича |
|---|---|
| P1 | Super Admin роль |
| P1 | Логин по username / ФИО + телефон |
| P1 | QR-код вход (сканировать и войти без пароля) |
| P1 | Password reset (email-провайдер) |
| P1 | Refresh token (httpOnly cookie, 30 дней) |
| P2 | Модуль чек-листов (проверка на рабочем месте) |
| P2 | PDF сертификаты |
| P2 | Отчёты и аналитика |
| P2 | In-app уведомления |
| P2 | Audit Log + антифрод |
| P3 | AI-интеграция (ассистент, генерация тестов) |
| P3 | E2E Playwright тесты |
| P3 | Advanced reporting / CSV export |

---

## Итоговая карта MVP (ЧАСТЬ 2)

```
БЛОК 0: Критические исправления   PR 84–86    3 PR  ✅ СДЕЛАНО
БЛОК 1: Railway деплой             PR 87–90    4 PR  ✅ СДЕЛАНО
БЛОК 2: Admin CRUD                 PR 91–96    6 PR  ✅ СДЕЛАНО
БЛОК 3: Файлы (S3)                 PR 97–98    2 PR  ✅ СДЕЛАНО
БЛОК 4: Learner flow               PR 99–101   3 PR  ✅ СДЕЛАНО
БЛОК 5: Финал                      PR 102–103  2 PR  ✅ СДЕЛАНО
──────────────────────────────────────────────────────────────
ИТОГО MVP:                                    20 PR  ✅ ВСЕ ГОТОВО
```

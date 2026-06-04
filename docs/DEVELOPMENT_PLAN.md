# План разработки LMS

**Обновлён:** 2026-06-03  
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

## PR 103 — feat: Railway staging deploy + full MVP smoke

Что входит:
- Деплой на Railway staging
- Применение миграций
- Запуск seed
- Проверка полного цикла: login → курс → уроки → тест → сертификат
- `docs/RAILWAY_DEPLOY_GUIDE.md` — полная инструкция запуска

---

# ЧАСТЬ 3 — После MVP

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

## Итоговая карта MVP

```
БЛОК 0: Критические исправления   PR 84–86    3 PR
БЛОК 1: Railway деплой             PR 87–90    4 PR
БЛОК 2: Admin CRUD                 PR 91–96    6 PR
БЛОК 3: Файлы (S3)                 PR 97–98    2 PR
БЛОК 4: Learner flow               PR 99–101   3 PR
БЛОК 5: Финал                      PR 102–103  2 PR
──────────────────────────────────────────────────
ИТОГО MVP:                         20 PR
```

# MVP_SCOPE_LOCK.md

**Проект:** корпоративная LMS / Learning Operating System  
**Статус:** фиксатор границ MVP  
**Назначение:** защитить MVP от переусложнения, scope creep и преждевременных enterprise/AI/mobile-функций.

---

## 0. Текущий статус реализации (пересчитано 2026-08-06)

Сам scope (раздел 2) — зафиксированное решение, не менялся. Ниже — что из него реально построено в коде на текущий `main` (PR #505). Статус сверен с Prisma-схемой и контроллерами `apps/api/src`, не с прошлыми отчётами.

| Раздел | Статус | Комментарий |
|---|---|---|
| 2.1 Identity & Access | ✅ Сделано | login/logout/me, password hashing (`scrypt`), JWT access + refresh token в httpOnly cookie, 4 фиксированные роли, backend RBAC (`RolesGuard` + `CourseAccessGuard`), protected routes — всё реализовано и покрыто тестами. |
| 2.2 Users & Organization | ✅ Сделано | `organizations`, `users` CRUD, `UserStatus` enum совпадает 1:1 (`active/invited/suspended/archived`), роли через `Membership`, `organizationId` во всех бизнес-сущностях. |
| 2.3 Groups | ✅ Сделано | `groups` CRUD, `group_members` (с soft-delete через `deletedAt`), назначение пользователей в группу, `manager-team-scope` модуль для manager readiness. |
| 2.4 Courses & Lessons | ⚠️ Частично | courses CRUD/status/lessons/ordering/publish validation/редактор — всё есть. Отдельной таблицы `course_modules` нет — уроки крепятся к курсу напрямую, без промежуточного слоя «модуль». Не заявлено как допустимое упрощение в разделе 4, но работает и не блокирует пилот. |
| 2.5 Files | ✅ Сделано | file metadata в Postgres, S3-совместимое хранилище (MinIO на Railway), signed URLs, tenant-scoped access checks. |
| 2.6 Assignments & Enrollments | ⚠️ Частично | `Assignment` (courseId + userId\|groupId + dueAt опционально) есть, learner видит назначенные курсы. Отдельной модели `enrollments` нет — роль enrollment фактически выполняют `Assignment` + `Progress` вместе. Не заявлено как упрощение в разделе 4. |
| 2.7 Learner Experience | ✅ Сделано | dashboard, мои курсы, страница курса, lesson player, responsive UI — все страницы реализованы. |
| 2.8 Progress | ✅ Сделано | `lesson_progress`/`course_progress`, complete action, расчёт завершения курса. |
| 2.9 Assessments | ✅ Сделано | тесты, вопросы, варианты ответов, попытки, backend-скоринг, pass/fail, ответы не раскрываются до сдачи. |
| 2.10 Certificates | ✅ Сделано | запись сертификата, уникальный номер, статус, HTML-страница, доступна learner. |
| 2.11 Reports | ⚠️ Частично | Выделенного `reports`-модуля/API нет. Функционально закрыто через `AdminResultsCertificatesPage` (таблица прогресс+результаты) и `ManagerDashboardPage`/`ManagerTeamPage` (прогресс команды) поверх существующих `/progress`, `/certificates`, `/assessments/:id/report`. |
| 2.12 Notifications | 🚨 Не сделано | Модуля нет вообще — ни таблиц, ни API, ни UI. См. открытый вопрос в `docs/CONCERNS.md` (2026-08-06). |
| 2.13 Audit Log | 🚨 Не сделано | Модуля нет вообще. См. открытый вопрос в `docs/CONCERNS.md` (2026-08-06) — это прямо противоречит критерию §5.17 ниже. |
| 2.14 Deployment & DevOps | ✅ Сделано | pnpm workspace, Dockerfile/docker-compose, Postgres+MinIO на Railway, `.env.example`, health endpoint, CI (lint/typecheck/test/build/CodeQL/audit). Продакшн реально развёрнут и используется (не просто «фундамент задеплоя» — жив на Railway). |

**Итог:** 9 из 14 разделов scope полностью реализованы, 3 — частично (архитектура работает, но не 1:1 повторяет исходное описание таблиц), 2 — не начаты (`notifications`, `audit log`) и напрямую противоречат критерию готовности §5.17.

---

## 1. Главная цель MVP

MVP должен доказать, что базовый корпоративный learning loop работает end-to-end:

```text
Admin создаёт пользователей
→ Admin создаёт группу
→ Instructor/Admin создаёт курс
→ Admin назначает курс пользователю или группе
→ Learner проходит уроки
→ система фиксирует прогресс
→ Learner проходит тест
→ система сохраняет результат
→ система выдаёт сертификат
→ Manager/Admin видит отчёт
```

MVP не должен быть полной enterprise LMS. Его задача — дать рабочий, проверяемый и развиваемый продукт для первого пилота.

---

## 2. Входит в MVP

### 2.1 Identity & Access

```text
- login
- logout
- current user endpoint
- password hashing
- JWT access token
- refresh token in httpOnly cookie
- fixed roles
- backend RBAC checks
- protected routes
```

### 2.2 Users & Organization

```text
- organizations базово
- users CRUD
- user status: active / invited / suspended / archived
- roles: learner / instructor / manager / admin
- user_roles
- organization_id в бизнес-сущностях
```

### 2.3 Groups

```text
- groups CRUD
- group_members
- assign users to group
- manager scope readiness
```

Для MVP `departments` можно не делать отдельной таблицей. Если нужна структура подразделений, использовать `groups.type`.

### 2.4 Courses & Lessons

```text
- courses CRUD
- course status: draft / published / archived
- course_modules
- lessons
- lesson ordering
- basic lesson content
- publish validation
- simple course editor UI
```

### 2.5 Files

```text
- file metadata in PostgreSQL
- S3-compatible object storage
- local MinIO
- signed upload/download URLs
- file access checks
```

### 2.6 Assignments & Enrollments

```text
- assign course to user
- assign course to group
- due date optional
- create learner enrollments
- learner sees assigned courses
```

### 2.7 Learner Experience

```text
- learner dashboard
- my courses
- course page
- lesson player
- continue learning
- mobile-responsive web UI
```

### 2.8 Progress

```text
- lesson_progress
- course_progress
- lesson complete action
- course completion calculation
- progress persistence
```

### 2.9 Assessments

```text
- tests/assessments
- questions
- answer options
- attempts
- backend scoring
- pass/fail
- no correct answers before submit
```

### 2.10 Certificates

```text
- certificate record
- unique certificate number
- certificate status
- certificate HTML page
- learner can view certificate
```

PDF generation is P1 unless explicitly required for pilot.

### 2.11 Reports

MVP reports:

```text
- course progress report
- group/user progress report
- certificate issued report
```

CSV/XLSX export is P1 unless required by pilot customer.

### 2.12 Notifications

```text
- in-app notifications
- course assigned notification
- certificate issued notification
- notification list
- mark as read
```

Email delivery can be P1 if not needed for the first pilot.

### 2.13 Audit Log

Audit log required for:

```text
- login/security-sensitive events
- user creation/update/deactivation
- role assignment
- course publish/archive
- course assignment
- assessment submit
- certificate issue
- report export if implemented
- file access/download if sensitive
```

### 2.14 Deployment & DevOps

```text
- private GitHub monorepo
- pnpm workspace
- Dockerfile / docker-compose
- PostgreSQL
- MinIO local
- Railway deployment
- .env.example
- health endpoint
- basic CI
```

---

## 3. Не входит в MVP

Следующее не реализовывать до завершения core learning loop без отдельного решения владельца проекта:

```text
- AI Tutor
- AI Course Builder
- AI recommendations
- RAG over course materials
- embeddings/vector search
- Julia analytics service
- microservices split
- Kubernetes
- Temporal
- ClickHouse
- OpenSearch
- full SCORM runtime
- xAPI LRS
- LTI provider/consumer
- SSO/SAML/OIDC enterprise pack
- SCIM
- HRIS integrations
- marketplace
- billing/payments
- custom branding / white-label
- advanced BI
- predictive analytics
- native mobile app as MVP blocker
- offline-first mobile
- mobile admin panel
- advanced gamification
- complex drag-and-drop course builder
- custom roles builder
- visual permission builder
- multi-region deployment
- tenant sharding
```

---

## 4. MVP simplifications

Разрешённые упрощения:

```text
- one organization in dev seed, but organization_id in schema from day one
- fixed roles instead of custom role builder
- groups instead of separate departments model
- HTML certificate instead of PDF
- basic reports instead of full analytics
- in-app notifications before email delivery
- responsive web before native mobile
- simple course editor before visual builder
- PostgreSQL reports before BI/read models
```

---

## 5. MVP success criteria

MVP считается готовым, если можно пройти сценарий:

```text
1. Admin входит в систему.
2. Admin создаёт learner.
3. Admin создаёт группу.
4. Admin добавляет learner в группу.
5. Instructor/Admin создаёт курс.
6. Instructor/Admin добавляет уроки.
7. Instructor/Admin публикует курс.
8. Admin назначает курс группе.
9. Learner входит в систему.
10. Learner видит назначенный курс.
11. Learner проходит уроки.
12. Система сохраняет прогресс.
13. Learner проходит тест.
14. Backend считает результат.
15. Система выдаёт сертификат.
16. Manager/Admin видит отчёт.
17. Audit log содержит важные действия.
18. Приложение деплоится на Railway.
```

**[2026-08-06] Статус сценария:** пункты 1–16 и 18 подтверждены в коде и реально работают (в т.ч. 18 — прод на Railway живой, не гипотетический). Пункт 17 — единственный незакрытый: audit log не реализован (см. раздел 0 выше и открытый вопрос в `docs/CONCERNS.md`). Формально сценарий целиком не проходит, пока это не решено — либо реализовать, либо снять пункт из критерия.

---

## 6. Правило добавления новой функции

Перед добавлением любой функции в MVP нужно ответить:

```text
1. Эта функция нужна для core learning loop?
2. Без неё невозможен пилот?
3. Она не нарушает сроки и простоту MVP?
4. Она не требует нового крупного слоя архитектуры?
5. Есть ли GitHub Issue и acceptance criteria?
```

Если хотя бы один ответ отрицательный — функция переносится в P1/P2/Future.

---

## 7. Запрет для AI coding agents

AI coding agent не должен самостоятельно:

```text
- расширять MVP scope;
- добавлять AI-функции;
- добавлять микросервисы;
- менять стек;
- добавлять новые инфраструктурные сервисы;
- реализовывать future scope;
- добавлять зависимости без причины;
- менять API/DB без обновления docs;
- обходить RBAC или organization scope;
- оставлять temporary bypass/debug backdoor.
```

Если агент считает, что функция нужна, он должен пометить её как `TODO VERIFY`, а не реализовывать без решения владельца проекта.

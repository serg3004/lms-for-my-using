# PROJECT_SOURCE_OF_TRUTH.md

**Проект:** корпоративная LMS / Learning Operating System  
**Статус:** главный источник решений перед стартом разработки  
**Язык продукта:** русский  
**Назначение:** зафиксировать единые правила, чтобы документация, GitHub Issues и AI coding agents не расходились в решениях.

---

## 1. Что создаётся

Создаётся корпоративная LMS-платформа для B2B-клиентов.

Продукт должен позволять компаниям:

- создавать пользователей;
- назначать роли;
- объединять пользователей в группы;
- создавать курсы, модули и уроки;
- загружать учебные материалы;
- назначать курсы пользователям и группам;
- отслеживать прохождение;
- проводить тестирование;
- выдавать сертификаты;
- смотреть базовые отчёты;
- получать уведомления;
- вести audit log важных действий.

Главный MVP learning loop:

```text
Admin создаёт пользователей
→ Admin создаёт группу
→ Instructor/Admin создаёт курс
→ Admin назначает курс пользователю или группе
→ Learner проходит уроки
→ система фиксирует прогресс
→ Learner проходит тест
→ система выдаёт сертификат
→ Manager/Admin видит отчёт
```

Всё, что не помогает этому циклу, не входит в MVP без отдельного решения владельца проекта.

---

## 2. Канонический стартовый стек

Для первой кодовой базы использовать:

```text
Architecture: modular monolith first
Repository: private GitHub monorepo
Package manager: pnpm workspaces
Build orchestration: Turborepo optional
Backend: NestJS + TypeScript
Frontend: React + Vite + TypeScript
Database: PostgreSQL
ORM: Prisma
Local storage: MinIO через S3-compatible API
Production storage: S3-compatible provider, например Cloudflare R2 / AWS S3 / Wasabi
Deployment: Railway-first
Portability: Docker + docker-compose
API style: REST / JSON /api/v1
Auth: JWT access token + refresh token in httpOnly cookie
UI language: Russian
Mobile: future scope
AI product features: future scope, not MVP
```

Если владелец проекта позже изменит один из пунктов, это решение нужно зафиксировать в `docs/audit/engineering-audit-log.md` или ADR.

---

## 3. Главные роли MVP

```text
Learner     — проходит назначенные курсы, уроки, тесты, получает сертификаты.
Instructor  — создаёт и редактирует курсы, уроки и тесты.
Manager     — видит прогресс своей группы/команды.
Admin       — управляет пользователями, группами, курсами, назначениями, отчётами и audit log.
```

В MVP допускается объединить Instructor и Admin в одном административном интерфейсе, но backend permissions должны оставаться ролевыми.

---

## 4. Главные документы проекта

Использовать документы в таком порядке:

1. `PROJECT_SOURCE_OF_TRUTH.md` — главный источник решений после утверждения.
2. `MVP_SCOPE_LOCK.md` — границы MVP и запреты.
3. `TODO_VERIFY.md` — открытые решения и их статус.
4. `01_LMS_Master_Product_Specification.md` — продуктовая основа.
5. `02_LMS_MVP_Roadmap.md` — roadmap MVP.
6. `03_LMS_Architecture_Map.md` — архитектурная карта.
7. `04_LMS_Database_Model_Draft.md` — модель БД.
8. `05_LMS_API_Contracts_Draft.md` — API-контракты.
9. `06_LMS_Repository_Structure.md` — структура репозитория.
10. `07_LMS_Unified_Product_Backlog.md` — backlog.
11. `08_LMS_GitHub_Issues_Import.md` — задачи для GitHub Issues.
12. `09_LMS_Implementation_Plan_Solo_Developer_AI_Agents.md` — план разработки.
13. `10_LMS_AI_Coding_Agent_Instructions.md` — инструкция для coding agent.
14. `11–23` — workflow, security, testing, deployment, UX, mobile, commercial, versioning and final checks.

---

## 5. Правила при конфликте документов

Если документы противоречат друг другу, применять порядок приоритета:

```text
1. Последнее явное решение владельца проекта
2. PROJECT_SOURCE_OF_TRUTH.md
3. MVP_SCOPE_LOCK.md
4. GitHub Issue, если оно не противоречит source of truth
5. Architecture Map
6. API Contracts
7. Database Model
8. Product Backlog
9. Остальные документы
```

Если конфликт затрагивает архитектуру, безопасность, данные, API или MVP scope, AI-agent должен остановиться и пометить вопрос как `TODO VERIFY`.

---

## 6. Архитектурные правила

1. Начинать с modular monolith.
2. Не создавать микросервисы в MVP.
3. Не добавлять Kubernetes в MVP.
4. Не добавлять AI-функции в MVP.
5. Не добавлять SCORM/xAPI/LTI runtime в MVP.
6. Не добавлять полноценное mobile app как блокер MVP.
7. Backend является source of truth для permissions.
8. Frontend role hiding — только UX, не security.
9. Все бизнес-сущности должны иметь `organization_id`, если они принадлежат организации.
10. Файлы хранятся в S3-compatible storage, в БД хранится metadata.
11. Railway используется для быстрого деплоя, но проект должен оставаться Docker-portable.
12. Любое изменение архитектуры фиксируется в audit log или ADR.

---

## 7. Минимальные backend modules MVP

```text
auth
users
roles
organizations
groups
courses
lessons
files
assignments
progress
assessments
certificates
notifications
reports
audit
```

---

## 8. Минимальные frontend зоны MVP

```text
Auth
Learner Dashboard
My Courses
Course Page
Lesson Player
Assessment Runner
Certificates
Notifications
Profile
Admin Dashboard
Users
Groups
Courses
Course Editor
Assignments
Reports
Audit Log
```

UI-тексты и пользовательская документация — на русском языке.

---

## 9. Минимальная database foundation

MVP-сущности:

```text
organizations
users
roles
user_roles
groups
group_members
courses
course_modules
lessons
files
course_assignments
assignment_targets
enrollments
lesson_progress
course_progress
assessments
assessment_questions
assessment_options
assessment_attempts
assessment_answers
certificates
notifications
audit_logs
```

На старте можно упростить:

- `departments` не делать отдельной таблицей, использовать `groups.type`, если нужна структура подразделений;
- certificate PDF не делать в первом релизе, начать с HTML certificate page;
- advanced report exports оставить на P1.

---

## 10. Definition of Ready для GitHub Issue

Issue можно отдавать AI coding agent, если в нём есть:

- title;
- context;
- scope;
- out of scope;
- affected modules;
- acceptance criteria;
- dependencies;
- testing expectations;
- relevant docs;
- expected PR summary format.

---

## 11. Definition of Done для PR

PR можно принимать, если:

- изменения соответствуют issue;
- нет unrelated changes;
- проект собирается;
- typecheck проходит;
- lint проходит;
- тесты проходят или есть объяснение, почему тесты не добавлены;
- нет hardcoded secrets;
- RBAC и organization scope не нарушены;
- миграции применяются, если изменена БД;
- API docs обновлены, если изменён API;
- audit log обновлён, если принято важное решение.

---

## 12. Первый практический порядок

```text
1. Создать private GitHub repo.
2. Добавить docs и эти 4 control-файла.
3. Создать monorepo structure.
4. Настроить pnpm workspace.
5. Создать apps/api на NestJS.
6. Создать apps/web на React + Vite.
7. Подключить PostgreSQL + Prisma.
8. Добавить docker-compose с PostgreSQL и MinIO.
9. Добавить health endpoint.
10. Добавить CI: install, typecheck, lint, test, build.
11. Начать M1: auth, users, roles, RBAC.
```

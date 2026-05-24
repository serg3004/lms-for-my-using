# 23. LMS AI Agent Master Context

Статус: главный короткий контекст для AI coding agent  
Назначение: вставлять в AI-агента перед разработкой или хранить как `docs/23_LMS_AI_Agent_Master_Context.md`

---

## 1. Роль AI-агента

Ты работаешь как AI coding agent в проекте корпоративной LMS.

Твоя задача:

- помогать разрабатывать продукт;
- работать по документации;
- выполнять GitHub issues;
- писать код аккуратно;
- не добавлять лишние функции;
- сохранять архитектуру;
- обновлять документацию при изменении решений;
- помогать одному разработчику вести проект системно.

---

## 2. Что за продукт создаётся

Создаётся корпоративная LMS / Learning Operating System для компаний.

Продукт нужен для:

- onboarding сотрудников;
- обязательного обучения;
- compliance training;
- upskilling/reskilling;
- управления курсами;
- назначения обучения;
- отслеживания прогресса;
- тестирования;
- выдачи сертификатов;
- отчётности для администраторов и менеджеров.

Язык продукта и интерфейса: русский.

---

## 3. Главные пользователи

Роли:

1. Admin  
   Управляет пользователями, курсами, назначениями, отчётами, сертификатами, настройками.

2. Instructor  
   Создаёт и редактирует курсы, уроки, тесты. В MVP может быть объединён с Admin.

3. Manager  
   Видит прогресс своей команды, просрочки, отчёты.

4. Learner  
   Проходит назначенные курсы, уроки, тесты, получает сертификаты.

---

## 4. Канонические технические решения

Использовать:

```text
Architecture: modular monolith first
Backend: TypeScript
Frontend: React + TypeScript
Database: PostgreSQL
Storage: S3-compatible
Deployment: Railway-first
Portability: Docker-first / Docker-portable
Repository: private GitHub monorepo
Mobile: learner-first, later
AI features: future scope, not MVP
```

Предпочтительный стартовый стек:

```text
apps/api: TypeScript backend, NestJS or Fastify
apps/web: React + TypeScript + Vite
packages/shared: shared types/schemas
DB ORM: Prisma or Drizzle, preferably decide before coding
infra/docker: Dockerfile + docker-compose
```

Если выбор ещё не зафиксирован, не принимай скрытые решения. Явно пометь `TODO VERIFY`.

---

## 5. MVP scope

MVP включает:

- authentication;
- users;
- fixed roles;
- basic groups/departments;
- courses;
- modules;
- lessons;
- file attachments;
- assignments;
- progress tracking;
- assessments/tests;
- certificates;
- basic notifications;
- basic reports;
- audit log;
- admin portal;
- learner portal;
- Railway deployment;
- Docker portability.

---

## 6. Не входит в MVP

Не реализовывать без отдельной задачи:

- AI tutor;
- AI course generation;
- AI recommendations;
- SCORM/xAPI full support;
- LTI;
- SSO/SAML;
- HRIS integrations;
- marketplace;
- advanced BI;
- custom branding;
- complex drag-and-drop course builder;
- mobile offline full mode;
- advanced gamification;
- custom roles builder;
- microservices split.

---

## 7. Архитектурные правила

1. Начинать с modular monolith.
2. Не создавать микросервисы без явного решения.
3. Каждый модуль должен иметь понятную ответственность.
4. Backend всегда проверяет права, UI-проверок недостаточно.
5. Database schema должна соответствовать MVP.
6. API contracts должны быть стабильными для web и future mobile.
7. Storage должен быть заменяемым через S3-compatible adapter.
8. Railway не должен быть жёсткой зависимостью.
9. Docker portability обязательна.
10. AI-функции проектировать как future layer, не в core MVP.

---

## 8. Основные backend modules

Ожидаемые модули:

- auth;
- users;
- roles/rbac;
- organizations;
- groups;
- courses;
- lessons;
- files;
- assignments;
- progress;
- assessments;
- certificates;
- notifications;
- reports;
- audit-log;
- settings.

---

## 9. Основные frontend зоны

Ожидаемые интерфейсы:

- Auth;
- Learner Dashboard;
- My Courses;
- Course Page;
- Lesson Player;
- Assessment Runner;
- Certificates;
- Notifications;
- Profile;
- Admin Dashboard;
- Users;
- Groups;
- Courses;
- Course Editor;
- Assignments;
- Reports;
- Audit Log.

UI-тексты должны быть на русском языке.

---

## 10. Database core entities

Ожидаемые сущности:

- users;
- roles;
- organizations;
- groups;
- group_members;
- courses;
- course_modules;
- lessons;
- lesson_files;
- assignments;
- lesson_progress;
- course_progress;
- assessments;
- questions;
- answer_options;
- assessment_attempts;
- certificates;
- files;
- notifications;
- audit_logs.

---

## 11. GitHub workflow

Работать так:

1. Брать одну задачу из GitHub Issue.
2. Создавать отдельную branch.
3. Делать минимальные изменения по scope задачи.
4. Не смешивать backend, frontend, infra без необходимости.
5. Добавлять/обновлять тесты.
6. Проверять lint/typecheck/tests.
7. Создавать PR.
8. В PR указывать:
   - summary;
   - affected files;
   - tests;
   - risks;
   - docs updated;
   - out of scope.

---

## 12. Правила работы с задачей

Перед реализацией определить:

```text
Issue:
Related docs:
Affected modules:
In scope:
Out of scope:
Data model impact:
API impact:
Security impact:
Tests required:
```

Если задача неясна, не додумывать критические требования. Пометить `TODO VERIFY`.

---

## 13. Testing rules

Для критических модулей обязательны тесты:

- auth;
- RBAC;
- users;
- assignments;
- progress;
- assessments;
- certificates;
- file access;
- reports.

Минимум перед PR:

- typecheck;
- lint;
- relevant unit/integration tests;
- smoke check for affected flow.

---

## 14. Security rules

Обязательно:

- password hashing;
- no plaintext passwords;
- no secrets in repo;
- RBAC backend enforcement;
- organization/group scope checks;
- file access authorization;
- input validation;
- safe error messages;
- audit log for important actions;
- env-based config;
- secure CORS.

Нельзя:

- доверять frontend;
- открывать приватные файлы публично;
- логировать пароли/токены;
- обходить RBAC ради скорости.

---

## 15. Documentation rules

Если решение меняется, обновить соответствующий документ:

- architecture changes → `03_LMS_Architecture_Map.md`;
- DB changes → `04_LMS_Database_Model_Draft.md`;
- API changes → `05_LMS_API_Contracts_Draft.md`;
- repo structure → `06_LMS_Repository_Structure.md`;
- backlog/issues → `07` или `08`;
- AI workflow → `10`, `11`, `12`;
- deployment → `15`;
- UX/mobile → `16`, `17`;
- roadmap/scope → `19`.

---

## 16. FACT / OBSERVED / INFERRED / TODO VERIFY / OUT OF MVP

Использовать метки:

- `FACT` — зафиксированное решение проекта.
- `OBSERVED` — замечено в существующих документах/коде.
- `INFERRED` — разумный вывод, но не прямое требование.
- `TODO VERIFY` — нужно подтвердить.
- `OUT OF MVP` — не реализовывать сейчас.

---

## 17. Главные риски

Следить за рисками:

1. Scope creep.
2. Overengineering.
3. Premature microservices.
4. AI hallucinated requirements.
5. Weak RBAC.
6. Unstable migrations.
7. Frontend/API mismatch.
8. Missing tests.
9. Railway lock-in.
10. Lost project context.

---

## 18. Демо flow MVP

MVP должен поддерживать такой demo flow:

```text
Admin logs in
→ Admin creates course
→ Admin creates lessons
→ Admin adds assessment
→ Admin assigns course to user/group
→ Learner logs in
→ Learner opens My Courses
→ Learner completes lessons
→ Learner passes assessment
→ System marks course completed
→ System issues certificate
→ Admin/Manager sees report
```

Если задача не помогает этому flow, она, вероятно, не является MVP.

---

## 19. Порядок реализации

Следовать порядку:

```text
Repository foundation
→ Project skeleton
→ Database foundation
→ Auth/RBAC
→ Users/groups
→ Courses/lessons
→ Files/storage
→ Assignments/progress
→ Assessments
→ Certificates
→ Notifications
→ Reports
→ UX polish
→ Railway deploy
→ Docker portability
→ Security/testing hardening
→ Pilot readiness
```

---

## 20. Главная инструкция

Работай как осторожный инженер, а не как генератор лишних функций.

Каждое изменение должно:

- соответствовать MVP;
- уважать архитектуру;
- быть проверяемым;
- не ломать будущую переносимость;
- не добавлять enterprise/AI scope без задачи;
- помогать пройти core learning loop.


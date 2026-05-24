# 22. LMS Final Implementation Order

Статус: финальный порядок реализации  
Назначение: практическая последовательность действий перед стартом и во время разработки LMS

---

## 1. Назначение документа

Этот документ определяет, в каком порядке реализовывать LMS, чтобы:

- не начать с лишних функций;
- не сломать архитектуру;
- избежать хаоса при работе AI-агентов;
- сначала получить рабочий core learning loop;
- затем перейти к pilot/commercial readiness.

---

## 2. Главный принцип реализации

Главный порядок:

```text
Документация → Репозиторий → Инфраструктура → Backend core → DB → Auth/RBAC → Learning core → Frontend → Deploy → Hardening → Pilot
```

Не начинать с:

- мобильного приложения;
- AI-функций;
- SCORM/xAPI;
- enterprise integrations;
- custom branding;
- advanced analytics;
- сложного визуального course builder.

---

## 3. Pre-code решения

Перед созданием кода нужно зафиксировать:

| Вопрос | Рекомендуемое решение |
|---|---|
| Backend | TypeScript, NestJS или Fastify |
| Frontend | React + TypeScript |
| DB | PostgreSQL |
| ORM | Prisma как наиболее удобный стартовый вариант |
| Storage | S3-compatible, локально MinIO |
| Deploy | Railway-first |
| Portability | Docker + docker-compose |
| Repo | private GitHub monorepo |
| Mobile | React Native/Expo later |
| AI | future scope, не в MVP |

Если нужно минимизировать сложность, рекомендуется:

```text
apps/api: NestJS + Prisma
apps/web: React + Vite + TypeScript
packages/shared: shared types/schemas
infra/docker: Dockerfile, docker-compose
```

---

## 4. Итерация 0. Подготовка репозитория

### Цель

Создать private GitHub repository и базовую структуру.

### Задачи

1. Создать private repo.
2. Добавить README.md.
3. Добавить docs/.
4. Разместить все документы 01–23 в docs/.
5. Создать структуру monorepo.
6. Настроить .gitignore.
7. Добавить .env.example.
8. Добавить базовые GitHub issue labels.
9. Добавить PR template.
10. Добавить issue template.

### Definition of Done

- repo создан;
- документы добавлены;
- структура каталогов создана;
- есть README;
- есть templates;
- первый commit сделан.

---

## 5. Итерация 1. Project foundation

### Цель

Создать технический каркас проекта.

### Задачи

Backend:

- создать `apps/api`;
- настроить TypeScript;
- настроить lint/format;
- настроить базовый health endpoint;
- настроить config/env.

Frontend:

- создать `apps/web`;
- настроить React + TypeScript;
- настроить routing;
- настроить базовый layout;
- настроить API client placeholder.

Shared:

- создать `packages/shared`;
- добавить общие типы;
- добавить базовые DTO/schemas, если используется.

Infra:

- добавить docker-compose;
- добавить PostgreSQL service;
- добавить MinIO service optional;
- добавить Dockerfile placeholders.

### Definition of Done

- проект запускается локально;
- backend health endpoint отвечает;
- frontend открывается;
- docker-compose поднимает инфраструктуру;
- README содержит local setup.

---

## 6. Итерация 2. Database foundation

### Цель

Создать начальную модель данных.

### Задачи

1. Подключить PostgreSQL.
2. Настроить ORM.
3. Создать миграции.
4. Создать таблицы:
   - users;
   - roles;
   - organizations;
   - groups;
   - courses;
   - modules;
   - lessons;
   - assignments;
   - progress;
   - assessments;
   - certificates;
   - files;
   - notifications;
   - audit_logs.
5. Добавить seed для dev.
6. Проверить миграции.

### Definition of Done

- миграции применяются локально;
- dev seed создаёт admin user;
- база соответствует MVP model;
- нет лишних enterprise-таблиц.

---

## 7. Итерация 3. Auth и RBAC

### Цель

Сделать безопасный вход и ролевой доступ.

### Задачи

1. Registration/invite или dev admin seed.
2. Login.
3. Logout.
4. Current user endpoint.
5. Password hashing.
6. Auth middleware.
7. RBAC guard.
8. Role checks for Admin/Instructor/Manager/Learner.
9. Basic audit events.
10. Auth tests.

### Definition of Done

- пользователь может войти;
- backend проверяет доступ;
- UI не показывает недоступные разделы;
- API защищены;
- есть тесты auth/RBAC.

---

## 8. Итерация 4. Users, groups, organization scope

### Цель

Дать Admin управление пользователями и группами.

### Задачи

Backend:

- users CRUD;
- user activation/deactivation;
- assign role;
- groups CRUD;
- add/remove users to group;
- organization scope checks.

Frontend:

- users list;
- user create/edit;
- groups list;
- group members.

### Definition of Done

- Admin управляет пользователями;
- Admin управляет группами;
- Manager видит только свою область, если это реализовано в MVP;
- RBAC работает.

---

## 9. Итерация 5. Courses and lessons

### Цель

Реализовать создание курсов и уроков.

### Задачи

Backend:

- courses CRUD;
- course status draft/published/archived;
- modules CRUD;
- lessons CRUD;
- lesson content;
- attachments metadata;
- publish course.

Frontend:

- courses list;
- course editor;
- module/lesson editor;
- lesson preview.

### Definition of Done

- Admin/Instructor может создать курс;
- можно добавить уроки;
- можно опубликовать курс;
- learner видит published courses only if assigned.

---

## 10. Итерация 6. Files and storage

### Цель

Добавить загрузку файлов и S3-compatible storage.

### Задачи

1. File upload endpoint.
2. File metadata table.
3. Storage adapter.
4. Local dev storage.
5. S3-compatible production config.
6. Signed URL strategy.
7. File size/type validation.
8. Attachment to lessons.

### Definition of Done

- файлы загружаются;
- файлы привязаны к урокам;
- приватные файлы не доступны напрямую;
- storage можно заменить через env.

---

## 11. Итерация 7. Assignments and progress

### Цель

Реализовать назначение обучения и прогресс.

### Задачи

Backend:

- assign course to user/group;
- due date;
- required flag;
- progress records;
- lesson completion;
- course completion calculation.

Frontend:

- assignment screen;
- learner my courses;
- course progress;
- lesson complete button.

### Definition of Done

- Admin назначает курс;
- Learner видит назначенный курс;
- прогресс сохраняется;
- курс завершается по правилам.

---

## 12. Итерация 8. Assessments

### Цель

Добавить тестирование.

### Задачи

Backend:

- assessment model;
- questions;
- answer options;
- attempts;
- scoring;
- pass/fail;
- retry rules.

Frontend:

- assessment editor;
- assessment runner;
- result screen.

### Definition of Done

- к курсу можно добавить тест;
- learner проходит тест;
- результат сохраняется;
- pass/fail влияет на завершение.

---

## 13. Итерация 9. Certificates

### Цель

Выдавать сертификаты после завершения курса.

### Задачи

1. Certificate model.
2. Certificate issue rule.
3. Certificate view.
4. Certificate unique ID.
5. Certificate list for learner.
6. Admin certificate report.
7. PDF export optional/MVP+.

### Definition of Done

- сертификат создаётся после completion;
- learner видит сертификат;
- Admin видит выданные сертификаты.

---

## 14. Итерация 10. Notifications

### Цель

Добавить базовые уведомления.

### Задачи

- notification model;
- course assigned notification;
- due date reminder optional;
- certificate issued notification;
- notifications list;
- mark as read.

### Definition of Done

- пользователь видит уведомления;
- важные события создают уведомления;
- уведомления не блокируют core flow.

---

## 15. Итерация 11. Reports

### Цель

Дать Admin/Manager базовые отчёты.

### Задачи

- report by user;
- report by course;
- assignment status report;
- overdue report;
- certificates report;
- simple filters;
- CSV export optional.

### Definition of Done

- Admin видит completion status;
- Manager видит team progress;
- отчёты соответствуют данным progress/assignments.

---

## 16. Итерация 12. Frontend UX polish

### Цель

Сделать MVP пригодным для demo.

### Задачи

- loading states;
- empty states;
- error states;
- Russian UI copy;
- dashboard improvements;
- navigation;
- responsive learner screens;
- form validation;
- toasts/confirmations.

### Definition of Done

- demo flow проходит без ручных исправлений;
- интерфейс понятен;
- learner flow работает на mobile web.

---

## 17. Итерация 13. Railway deploy

### Цель

Запустить staging/prod на Railway.

### Задачи

1. Railway project.
2. PostgreSQL service.
3. Env variables.
4. Backend deploy.
5. Frontend deploy.
6. Migrations.
7. Health checks.
8. Smoke test.
9. Rollback notes.

### Definition of Done

- приложение доступно по URL;
- backend health работает;
- database migrations применены;
- demo flow работает на Railway.

---

## 18. Итерация 14. Docker portability

### Цель

Подтвердить переносимость.

### Задачи

- Dockerfile API;
- Dockerfile Web;
- docker-compose;
- PostgreSQL local;
- MinIO local;
- env templates;
- local portable run instructions.

### Definition of Done

- проект можно поднять локально через Docker;
- нет жёсткой привязки к Railway;
- README описывает portable запуск.

---

## 19. Итерация 15. Security and testing hardening

### Цель

Закрыть MVP перед pilot.

### Задачи

- auth tests;
- RBAC tests;
- API validation tests;
- file access tests;
- assignment/progress tests;
- assessment tests;
- certificate tests;
- security checklist review;
- dependency audit;
- smoke test script.

### Definition of Done

- critical flows покрыты;
- нет открытых high-risk security issues;
- deploy стабилен;
- pilot можно проводить.

---

## 20. Итерация 16. Pilot readiness

### Цель

Подготовить продукт к первому клиентскому пилоту.

### Задачи

- demo data;
- admin guide;
- learner guide;
- pilot checklist;
- known limitations;
- feedback form;
- support process;
- first customer onboarding plan.

### Definition of Done

- можно провести демо;
- можно дать доступ пилотной компании;
- ограничения честно описаны.

---

## 21. После MVP

После MVP переходить по версии:

```text
v1.0 → commercial polish
v1.5 → mobile app
v2.0 → enterprise integrations
v2.5 → advanced learning
AI-ready → AI features
```

---

## 22. Запрещённые действия до MVP

Не делать без отдельного решения:

- AI tutor;
- AI course generator;
- SCORM/xAPI full runtime;
- LTI;
- SSO/SAML;
- marketplace;
- HRIS integrations;
- complex analytics;
- mobile offline full;
- custom roles builder;
- microservices split.

---

## 23. Как выдавать задачи AI-агентам

Каждая задача AI-агенту должна содержать:

```text
Context:
- product: corporate LMS
- current iteration:
- related docs:
- issue ID:
- scope:
- out of scope:

Task:
- exact implementation request

Acceptance criteria:
- required checks

Constraints:
- do not add future scope
- follow modular monolith
- update docs if needed
```

---

## 24. Минимальный первый prompt для AI coding agent

```text
Ты AI coding agent проекта корпоративной LMS.

Перед работой прочитай:
- docs/23_LMS_AI_Agent_Master_Context.md
- docs/10_LMS_AI_Coding_Agent_Instructions.md
- docs/03_LMS_Architecture_Map.md
- docs/06_LMS_Repository_Structure.md
- docs/08_LMS_GitHub_Issues_Import.md

Работай только в рамках указанного GitHub issue.
Не добавляй функции вне MVP.
Не меняй архитектуру без объяснения.
Каждый PR должен содержать summary, tests, risks, affected docs.
```

---

## 25. Итог

Рекомендуемый следующий практический этап:

```text
Этап 8. LMS Starter Codebase
```

Состав:

- private GitHub monorepo structure;
- backend skeleton;
- frontend skeleton;
- shared package;
- Docker;
- env examples;
- README;
- GitHub templates;
- initial docs placement.


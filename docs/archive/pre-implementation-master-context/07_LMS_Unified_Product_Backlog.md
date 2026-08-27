# 07. LMS Unified Product Backlog

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** превратить продуктовую спецификацию, MVP roadmap, архитектуру, модель данных и API-контракты в единый backlog разработки.  
**Целевая модель:** один разработчик + AI-агенты GPT/Claude/Codex + private GitHub + Railway-first deployment + Docker-portable архитектура.  
**Язык продукта:** русский.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, S3-compatible storage.

---

## 1. Принципы backlog

### 1.1 Backlog должен быть исполнимым

Каждая задача должна быть достаточно конкретной, чтобы AI coding agent мог выполнить её без пересборки всей архитектуры.

Правильная задача:

```text
Реализовать CRUD API для курсов с RBAC-проверками Admin/Instructor.
```

Плохая задача:

```text
Сделать LMS.
```

### 1.2 Сначала core learning loop

Приоритет MVP:

```text
пользователь → курс → назначение → прохождение → прогресс → тест → сертификат → отчёт
```

AI, SCORM, LTI, сложная аналитика, marketplace, полноценная мобильная offline-версия и enterprise-интеграции не входят в MVP.

### 1.3 Вертикальные срезы важнее идеальной инфраструктуры

Каждый этап должен давать работающий результат:

- можно запустить;
- можно протестировать;
- можно показать;
- можно задеплоить.

### 1.4 Modular monolith first

Все модули живут внутри одного backend-приложения, но разделены логически:

- `auth`;
- `users`;
- `organizations`;
- `courses`;
- `assignments`;
- `progress`;
- `assessments`;
- `certificates`;
- `files`;
- `notifications`;
- `reports`;
- `audit`.

---

## 2. Приоритеты

| Priority | Значение | Описание |
|---|---|---|
| P0 | Critical MVP | Без этого LMS не работает |
| P1 | Important MVP | Нужно для нормального пилота |
| P2 | Post-MVP | Можно отложить после первого запуска |
| P3 | Future Scope | Будущие версии, не делать сейчас |

---

## 3. Milestones

| Milestone | Название | Цель |
|---|---|---|
| M0 | Repository & Infrastructure | Репозиторий, окружение, база, CI, Docker |
| M1 | Identity & Access | Auth, users, roles, RBAC |
| M2 | Organization Structure | Организации, группы, департаменты |
| M3 | Course Management | Курсы, уроки, файлы |
| M4 | Learning Delivery | Назначения, прохождение, прогресс |
| M5 | Assessments & Certificates | Тесты, результаты, сертификаты |
| M6 | Reports & Notifications | Отчёты, уведомления, audit log |
| M7 | Deployment & Pilot Readiness | Railway, Docker, smoke tests, MVP hardening |
| M8 | Future Product Growth | Mobile, AI, SCORM, integrations, enterprise |

---

## 4. Epic 0 — Project Setup & Engineering Foundation

**Priority:** P0  
**Milestone:** M0  
**Цель:** создать техническую основу, чтобы AI-агенты могли безопасно писать код.

### User Story

Как владелец проекта, я хочу иметь структурированный private GitHub репозиторий, чтобы разработка LMS велась управляемо и была понятна AI-агентам.

### Tasks

#### 0.1 Создать private GitHub repository

- Создать private repo `lms-platform`.
- Добавить базовую структуру monorepo.
- Добавить `README.md`.
- Добавить `.gitignore`.
- Добавить `docs/`.

**Acceptance Criteria:**

- Репозиторий приватный.
- Есть корневой README.
- Есть структура `apps`, `packages`, `infra`, `docs`, `.github`.

#### 0.2 Настроить package manager и workspace

- Выбрать `pnpm`.
- Создать `pnpm-workspace.yaml`.
- Создать root `package.json`.
- Добавить scripts: `dev`, `build`, `test`, `lint`, `format`.

**Acceptance Criteria:**

- `pnpm install` работает.
- Workspace видит `apps/api`, `apps/web`, `packages/shared`.

#### 0.3 Подготовить backend app

- Создать `apps/api`.
- Настроить TypeScript.
- Подготовить базовый HTTP server.
- Добавить health endpoint `GET /health`.
- Добавить базовую структуру модулей.

**Acceptance Criteria:**

- API запускается локально.
- `GET /health` возвращает `ok`.

#### 0.4 Подготовить frontend app

- Создать `apps/web`.
- Настроить React + TypeScript.
- Добавить базовую маршрутизацию.
- Добавить страницы: login, dashboard placeholder, 404.

**Acceptance Criteria:**

- Web app запускается локально.
- Login page доступна.

#### 0.5 Подготовить PostgreSQL и миграции

- Подключить PostgreSQL.
- Выбрать ORM/migration tool: Prisma или Drizzle.
- Добавить базовую миграцию.
- Добавить `.env.example`.

**Acceptance Criteria:**

- База поднимается локально.
- Миграции применяются.
- API может подключиться к БД.

#### 0.6 Подготовить Docker локально

- Добавить `docker-compose.yml` для PostgreSQL.
- Добавить Dockerfile для API.
- Добавить Dockerfile для web, если требуется.

**Acceptance Criteria:**

- PostgreSQL стартует через Docker.
- API может подключиться к контейнерной БД.

#### 0.7 Настроить базовый CI

- Добавить GitHub Actions workflow.
- Проверять install, lint, typecheck, tests.

**Acceptance Criteria:**

- Pull request не проходит, если есть TypeScript/lint ошибки.

---

## 5. Epic 1 — Identity, Auth & RBAC

**Priority:** P0  
**Milestone:** M1  
**Цель:** обеспечить вход, роли и базовые права доступа.

### Roles

- `learner` — проходит обучение;
- `instructor` — создаёт и ведёт курсы;
- `manager` — назначает обучение и смотрит отчёты по группам;
- `admin` — управляет системой;
- `owner` / `super_admin` — системный владелец, можно отложить до post-MVP.

### Tasks

#### 1.1 Реализовать модель пользователей

- Таблица `users`.
- Поля: id, email, password_hash, first_name, last_name, status, created_at, updated_at.
- Уникальный email.

**Acceptance Criteria:**

- Можно создать пользователя.
- Email уникален.
- Пароль хранится только как hash.

#### 1.2 Реализовать роли и user_roles

- Таблица `roles`.
- Таблица `user_roles`.
- Seed базовых ролей.

**Acceptance Criteria:**

- Пользователь может иметь одну или несколько ролей.
- Роли доступны для RBAC checks.

#### 1.3 Реализовать login/logout/session

- Endpoint `POST /auth/login`.
- Endpoint `POST /auth/logout`.
- Endpoint `GET /auth/me`.
- JWT или session-based auth.

**Acceptance Criteria:**

- Пользователь может войти.
- Некорректный пароль отклоняется.
- `GET /auth/me` возвращает текущего пользователя.

#### 1.4 Реализовать middleware авторизации

- Проверка токена/сессии.
- Проверка активного пользователя.
- Проверка ролей.

**Acceptance Criteria:**

- Защищённые endpoints недоступны без авторизации.
- Role-based доступ работает.

#### 1.5 Реализовать UI login/logout

- Login form.
- Ошибки входа.
- Logout action.
- Redirect после входа.

**Acceptance Criteria:**

- Пользователь может войти через UI.
- После logout доступ к dashboard закрыт.

---

## 6. Epic 2 — Organization, Groups & Departments

**Priority:** P0/P1  
**Milestone:** M2  
**Цель:** поддержать корпоративную структуру.

### Tasks

#### 2.1 Реализовать organizations

- Таблица `organizations`.
- Связь users → organization.
- MVP допускает одну организацию, но модель должна позволять multi-tenant future.

**Acceptance Criteria:**

- Пользователь принадлежит организации.
- Курсы и назначения привязаны к организации.

#### 2.2 Реализовать departments

- Таблица `departments`.
- Иерархия department parent_id — future optional.
- CRUD для admin/manager.

**Acceptance Criteria:**

- Можно создать department.
- Пользователя можно привязать к department.

#### 2.3 Реализовать groups

- Таблица `groups`.
- Таблица `group_members`.
- CRUD групп.

**Acceptance Criteria:**

- Можно создать группу.
- Можно добавить пользователей в группу.

#### 2.4 UI управления группами

- Список групп.
- Создание/редактирование группы.
- Добавление участников.

**Acceptance Criteria:**

- Admin/Manager может управлять группами через UI.

---

## 7. Epic 3 — Course Management & Content

**Priority:** P0  
**Milestone:** M3  
**Цель:** дать instructor/admin возможность создать курс и уроки.

### Course Entity

Основные поля:

- id;
- organization_id;
- title;
- description;
- status: draft/published/archived;
- created_by;
- created_at;
- updated_at.

### Tasks

#### 3.1 Реализовать courses API

- `GET /courses`.
- `POST /courses`.
- `GET /courses/:id`.
- `PATCH /courses/:id`.
- `DELETE /courses/:id` или archive.

**Acceptance Criteria:**

- Admin/Instructor может создать курс.
- Learner видит только назначенные published courses.

#### 3.2 Реализовать lessons/modules

- Таблицы `course_modules`, `lessons`.
- Сортировка уроков.
- Типы уроков: text, video_url, file, quiz_reference.

**Acceptance Criteria:**

- Можно создать курс с несколькими уроками.
- Уроки отображаются в правильном порядке.

#### 3.3 Реализовать публикацию курса

- Draft → Published.
- Проверка минимального наполнения курса.

**Acceptance Criteria:**

- Нельзя опубликовать пустой курс.
- Published course доступен для назначения.

#### 3.4 Course Builder UI MVP

- Список курсов.
- Создание курса.
- Редактирование курса.
- Создание уроков.
- Публикация.

**Acceptance Criteria:**

- Instructor может создать и опубликовать базовый курс через UI.

---

## 8. Epic 4 — File Storage & Learning Materials

**Priority:** P1  
**Milestone:** M3  
**Цель:** поддержать файлы и материалы курса через S3-compatible storage.

### Tasks

#### 4.1 Реализовать file metadata model

- Таблица `files`.
- Поля: id, organization_id, owner_id, storage_key, filename, mime_type, size, created_at.

**Acceptance Criteria:**

- Файл имеет запись в БД.
- Файл связан с владельцем и организацией.

#### 4.2 Реализовать upload API

- `POST /files/upload-url` или прямой upload через API.
- Проверка размера и MIME type.
- Сохранение metadata.

**Acceptance Criteria:**

- Можно загрузить PDF/изображение/документ в разрешённом формате.
- Нельзя загрузить запрещённый тип файла.

#### 4.3 Привязать файлы к урокам

- `lesson_files` или file reference в lesson content.

**Acceptance Criteria:**

- Урок может содержать файл.
- Learner может открыть файл, если имеет доступ к курсу.

---

## 9. Epic 5 — Assignments & Learning Delivery

**Priority:** P0  
**Milestone:** M4  
**Цель:** назначать курсы пользователям и группам.

### Tasks

#### 5.1 Реализовать assignment model

- Таблица `assignments`.
- Поля: course_id, assigned_to_user_id, assigned_to_group_id, due_date, status.

**Acceptance Criteria:**

- Курс можно назначить пользователю.
- Курс можно назначить группе.

#### 5.2 Реализовать assignment API

- `POST /assignments`.
- `GET /assignments`.
- `GET /my/assignments`.
- `PATCH /assignments/:id`.

**Acceptance Criteria:**

- Manager/Admin может назначать курсы.
- Learner видит свои назначения.

#### 5.3 UI назначения курсов

- Выбор курса.
- Выбор пользователя или группы.
- Дата дедлайна.

**Acceptance Criteria:**

- Manager/Admin может назначить курс через UI.

#### 5.4 Learner dashboard

- Список назначенных курсов.
- Статусы: not_started, in_progress, completed, overdue.

**Acceptance Criteria:**

- Learner видит свой список обучения.

---

## 10. Epic 6 — Progress Tracking

**Priority:** P0  
**Milestone:** M4/M5  
**Цель:** фиксировать обучение и статусы прохождения.

### Tasks

#### 6.1 Реализовать progress model

- `course_progress`.
- `lesson_progress`.
- Progress percent.
- Completion timestamps.

**Acceptance Criteria:**

- Система знает, какие уроки пройдены.
- Курс становится completed, если выполнены условия завершения.

#### 6.2 Реализовать learner course player

- Страница курса.
- Список уроков.
- Просмотр урока.
- Кнопка “Отметить как пройдено”.

**Acceptance Criteria:**

- Learner может пройти урок.
- Progress обновляется.

#### 6.3 Реализовать automatic progress calculation

- Пересчёт процента.
- Обновление статуса assignment.

**Acceptance Criteria:**

- После прохождения всех уроков курс завершён.

---

## 11. Epic 7 — Assessments & Quizzes

**Priority:** P1  
**Milestone:** M5  
**Цель:** добавить базовую проверку знаний.

### Tasks

#### 7.1 Реализовать quiz model

- `assessments`.
- `questions`.
- `answers`.
- Question types: single_choice, multiple_choice.

**Acceptance Criteria:**

- Instructor может создать тест.
- Тест содержит вопросы и варианты ответов.

#### 7.2 Реализовать quiz attempts

- `assessment_attempts`.
- `assessment_answers`.
- Score calculation.
- Pass threshold.

**Acceptance Criteria:**

- Learner может пройти тест.
- Система рассчитывает балл и pass/fail.

#### 7.3 UI тестирования

- Создание теста.
- Прохождение теста.
- Экран результата.

**Acceptance Criteria:**

- Learner видит результат после прохождения.

---

## 12. Epic 8 — Certificates

**Priority:** P1  
**Milestone:** M5  
**Цель:** выдавать сертификат после завершения курса.

### Tasks

#### 8.1 Реализовать certificate model

- Таблица `certificates`.
- Поля: user_id, course_id, issued_at, certificate_number, status.

**Acceptance Criteria:**

- После завершения курса можно создать сертификат.
- Номер сертификата уникален.

#### 8.2 Реализовать certificate generation MVP

- PDF generation или HTML certificate page.
- Проверочная ссылка future optional.

**Acceptance Criteria:**

- Learner может скачать/посмотреть сертификат.

#### 8.3 UI сертификатов

- Страница “Мои сертификаты”.
- Admin/Manager view по пользователям.

**Acceptance Criteria:**

- Сертификаты видны в UI.

---

## 13. Epic 9 — Reports & Analytics MVP

**Priority:** P1  
**Milestone:** M6  
**Цель:** дать manager/admin базовые отчёты.

### Tasks

#### 9.1 Реализовать report endpoints

- Completion by course.
- Completion by group.
- Overdue assignments.
- Assessment results.

**Acceptance Criteria:**

- Manager видит отчёт по своей группе.
- Admin видит отчёты по организации.

#### 9.2 Reports UI

- Dashboard summary.
- Таблица назначений.
- Фильтры: course, group, status, due date.

**Acceptance Criteria:**

- Можно быстро понять, кто прошёл обучение, а кто нет.

#### 9.3 Export CSV MVP

- Export по completion report.

**Acceptance Criteria:**

- Admin может выгрузить CSV.

---

## 14. Epic 10 — Notifications & Audit Log

**Priority:** P1  
**Milestone:** M6  
**Цель:** добавить базовые уведомления и журнал ключевых действий.

### Tasks

#### 10.1 Notification model

- Таблица `notifications`.
- Типы: assignment_created, due_date_reminder, course_completed, certificate_issued.

**Acceptance Criteria:**

- Событие может создать notification.
- Пользователь видит свои notification.

#### 10.2 In-app notifications MVP

- Notification list.
- Mark as read.

**Acceptance Criteria:**

- Пользователь может прочитать уведомления.

#### 10.3 Audit log model

- Таблица `audit_logs`.
- Кто, что, когда, с какой сущностью сделал.

**Acceptance Criteria:**

- Создание пользователя, курса, назначения и сертификата попадает в audit log.

---

## 15. Epic 11 — Deployment & Production Readiness

**Priority:** P0/P1  
**Milestone:** M7  
**Цель:** подготовить MVP к запуску на Railway и переносимости через Docker.

### Tasks

#### 11.1 Railway deployment

- Настроить API service.
- Настроить web service.
- Настроить PostgreSQL.
- Добавить env vars.

**Acceptance Criteria:**

- MVP доступен по публичному URL.
- Healthcheck проходит.

#### 11.2 Docker portability

- Dockerfiles.
- docker-compose production-like.
- Документация запуска на VPS.

**Acceptance Criteria:**

- Проект можно поднять локально через Docker.

#### 11.3 Smoke tests

- Login.
- Create course.
- Assign course.
- Complete lesson.
- Generate certificate.

**Acceptance Criteria:**

- Smoke сценарии проходят перед релизом.

---

## 16. Epic 12 — Security & Quality

**Priority:** P0/P1  
**Milestone:** M0-M7  
**Цель:** не допустить небезопасного MVP.

### Tasks

- Password hashing.
- RBAC проверка на каждом защищённом endpoint.
- Validation DTO/schema.
- Rate limiting на auth endpoints.
- CORS policy.
- File upload validation.
- Secrets only through env vars.
- No hardcoded credentials.
- Error handling без утечки stack traces.
- Basic test coverage for core modules.

**Acceptance Criteria:**

- Нет публичных endpoints для чужих данных.
- Нельзя получить доступ к чужому курсу без назначения/роли.
- Secrets не попадают в git.

---

## 17. Epic 13 — Mobile App Future Scope

**Priority:** P3  
**Milestone:** M8  
**Статус:** не входит в MVP, но архитектура должна учитывать mobile learner-first.

### Future Tasks

- `apps/mobile` placeholder.
- Mobile API compatibility.
- Learner dashboard mobile.
- Course player mobile.
- Push notifications.
- Offline-ready content future.

**MVP правило:** mobile app не должен блокировать запуск web MVP.

---

## 18. Epic 14 — AI Features Future Scope

**Priority:** P3  
**Milestone:** M8  
**Статус:** не входит в MVP.

### Future Features

- AI course assistant.
- AI quiz generation.
- AI learning recommendations.
- AI analytics insights.
- AI tutor.
- Content summarization.

**MVP правило:** AI-функции нельзя внедрять в core MVP до стабильности базовой LMS.

---

## 19. Рекомендуемый порядок выполнения

```text
1. Repository & infrastructure
2. Auth + users + RBAC
3. Organization/groups/departments
4. Courses + lessons
5. Assignments
6. Learner dashboard + course player
7. Progress tracking
8. Assessments
9. Certificates
10. Reports
11. Notifications + audit log
12. Railway deployment
13. Docker portability
14. Pilot hardening
```

---

## 20. Definition of Done для каждой задачи

Задача считается выполненной, если:

- код написан;
- TypeScript typecheck проходит;
- lint проходит;
- миграции применяются;
- API endpoint протестирован вручную или автотестом;
- UI сценарий проверен, если задача frontend;
- RBAC проверен;
- ошибки обработаны;
- README/docs обновлены, если изменился способ запуска;
- PR содержит краткое описание изменений;
- нет hardcoded secrets;
- задача закрывает acceptance criteria.

---

## 21. Что не делать в MVP

Не включать в MVP:

- микросервисы;
- Kubernetes;
- сложный event-driven backend;
- полноценный SCORM/xAPI/LTI;
- AI-функции как обязательный слой;
- Julia-сервис;
- marketplace;
- многоуровневый billing;
- enterprise SSO как обязательный MVP;
- офлайн мобильное приложение;
- сложные кастомные отчёты;
- white-label enterprise theming.

---

## 22. Итог

Этот backlog является рабочей картой разработки LMS. Его задача — не просто перечислить функции, а связать продукт, архитектуру, базу данных, API и реальные GitHub-задачи в единый управляемый план.

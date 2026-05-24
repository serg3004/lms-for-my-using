# 02. LMS MVP Roadmap

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** определить порядок разработки MVP, границы этапов, зависимости и критерии готовности.  
**Целевая модель разработки:** один разработчик + AI-агенты GPT/Claude + private GitHub + Railway-first deployment.

---

## 1. Цель MVP

Цель MVP — создать работающую корпоративную LMS, которая закрывает базовый цикл обучения:

> создать пользователей → создать курс → назначить обучение → пройти курс → зафиксировать прогресс → пройти тест → получить сертификат → увидеть отчёт.

MVP не должен быть большим enterprise-продуктом. Его задача — доказать, что core learning loop работает технически, продуктово и организационно.

---

## 2. Принципы roadmap

### 2.1 Сначала ядро, потом украшения

Нельзя начинать с сложной аналитики, AI, SCORM, мобильного приложения или enterprise-интеграций. Сначала должен работать основной цикл обучения.

### 2.2 Вертикальные срезы вместо бесконечной инфраструктуры

Каждый этап должен давать работающий результат, который можно запустить, проверить и показать.

### 2.3 AI-агенты работают по задачам

Каждый модуль должен быть разбит на задачи, которые можно передать AI coding agent через GitHub Issues.

### 2.4 Railway-first, Docker-portable

Первый запуск — Railway. Но структура проекта должна позволять перенос через Docker на другой сервер.

---

## 3. MVP roadmap overview

| Фаза | Название | Цель | Результат |
|---|---|---|---|
| Phase 0 | Project Setup | Подготовить репозиторий и основу | Проект запускается локально |
| Phase 1 | Identity & Access | Пользователи, роли, auth | Можно войти и управлять доступом |
| Phase 2 | Organization Structure | Группы, департаменты, менеджеры | Есть корпоративная структура |
| Phase 3 | Course Core | Курсы, уроки, файлы | Можно создать курс |
| Phase 4 | Assignments | Назначение обучения | Можно назначить курс |
| Phase 5 | Learner Experience | Прохождение курса | Learner может учиться |
| Phase 6 | Progress Tracking | Прогресс и статусы | Система фиксирует обучение |
| Phase 7 | Assessments | Тесты и результаты | Можно проверить знания |
| Phase 8 | Certificates | Сертификаты | Можно выдать сертификат |
| Phase 9 | Reports | Базовая отчётность | Manager/Admin видит результат |
| Phase 10 | Notifications & Audit | Уведомления и журнал | Есть контроль событий |
| Phase 11 | Deployment MVP | Railway + Docker | MVP можно развернуть |
| Phase 12 | Pilot Hardening | Полировка перед пилотом | Готовность к первым пользователям |

---

## 4. Phase 0 — Project Setup

### Цель

Создать техническую основу проекта.

### Что сделать

- создать private GitHub repository;
- определить monorepo structure;
- настроить backend TypeScript app;
- настроить frontend React + TypeScript app;
- подключить PostgreSQL;
- выбрать ORM/migration tool;
- подготовить `.env.example`;
- добавить базовый Dockerfile / docker-compose;
- подготовить README;
- настроить linting/formatting;
- настроить базовую CI-проверку.

### Критерии готовности

- проект запускается локально;
- backend отвечает healthcheck endpoint;
- frontend открывается;
- PostgreSQL подключается;
- миграции можно запускать;
- структура репозитория понятна AI-агенту.

---

## 5. Phase 1 — Identity & Access

### Цель

Создать основу пользователей и доступа.

### Что сделать

- модель User;
- модель Role;
- модель Permission или RBAC mapping;
- login/logout;
- password hashing;
- session/JWT strategy;
- protected routes;
- seed admin user;
- базовый admin user management UI.

### MVP-роли

- Learner;
- Instructor;
- Manager;
- Admin.

### Критерии готовности

- пользователь может войти;
- Admin может создать пользователя;
- Admin может назначить роль;
- backend проверяет права доступа;
- frontend скрывает недоступные разделы.

---

## 6. Phase 2 — Organization Structure

### Цель

Создать корпоративную структуру.

### Что сделать

- organizations / tenant-ready entity;
- departments;
- groups;
- user-group membership;
- manager-team relationship;
- group list UI;
- user profile with org metadata.

### Критерии готовности

- Admin может создать группу;
- Admin может добавить пользователя в группу;
- Manager может быть связан с группой;
- данные организации учитываются в запросах.

---

## 7. Phase 3 — Course Core

### Цель

Дать возможность создавать учебный контент.

### Что сделать

- Course entity;
- Course status: draft/published/archived;
- Module/Section entity;
- Lesson entity;
- lesson content;
- file upload metadata;
- S3-compatible storage adapter;
- course editor UI;
- course preview.

### Критерии готовности

- Instructor/Admin может создать курс;
- может добавить уроки;
- может загрузить файл;
- может опубликовать курс;
- опубликованный курс доступен для назначения.

---

## 8. Phase 4 — Assignments & Enrollments

### Цель

Связать курсы с пользователями и группами.

### Что сделать

- assignment entity;
- enrollment entity;
- assign course to user;
- assign course to group;
- deadline;
- assignment status;
- assigned courses list;
- basic notification trigger.

### Критерии готовности

- Admin может назначить курс пользователю;
- Admin может назначить курс группе;
- Learner видит назначенный курс;
- система сохраняет дату назначения и дедлайн.

---

## 9. Phase 5 — Learner Experience

### Цель

Сделать прохождение курса удобным для обучающегося.

### Что сделать

- learner dashboard;
- course card;
- course player;
- lesson navigation;
- mark lesson as completed;
- resume last lesson;
- responsive layout for mobile browser.

### Критерии готовности

- Learner видит свои курсы;
- открывает курс;
- проходит уроки;
- может вернуться к последнему месту;
- интерфейс работает на мобильном экране.

---

## 10. Phase 6 — Progress Tracking

### Цель

Фиксировать состояние обучения.

### Что сделать

- lesson progress;
- course progress;
- enrollment status;
- completion percentage;
- started_at / completed_at;
- deadline status;
- backend progress calculation;
- UI progress bar.

### Критерии готовности

- прогресс сохраняется;
- курс становится completed при выполнении условий;
- Manager/Admin видит прогресс;
- данные корректно пересчитываются.

---

## 11. Phase 7 — Assessments

### Цель

Добавить проверку знаний.

### Что сделать

- assessment entity;
- questions;
- answer options;
- attempts;
- scoring;
- pass threshold;
- test UI;
- result screen;
- retake rules basic.

### Критерии готовности

- Instructor/Admin может создать тест;
- Learner может пройти тест;
- система считает результат;
- результат сохраняется;
- pass/fail влияет на завершение курса.

---

## 12. Phase 8 — Certificates

### Цель

Выдавать подтверждение прохождения обучения.

### Что сделать

- certificate template basic;
- issued certificate entity;
- certificate number / verification code;
- issue certificate on course completion;
- certificate download view;
- certificate list for learner;
- certificate list for admin.

### Критерии готовности

- сертификат выдаётся после выполнения условий;
- Learner видит сертификат;
- Admin видит выданные сертификаты;
- сертификат можно проверить по коду.

---

## 13. Phase 9 — Reports

### Цель

Дать менеджерам и администраторам контроль обучения.

### Что сделать

- admin dashboard metrics;
- manager team report;
- course completion report;
- overdue report;
- assessment result report;
- certificate report;
- CSV export basic.

### Критерии готовности

- Admin видит общий прогресс;
- Manager видит свою команду;
- можно найти тех, кто не прошёл курс;
- можно экспортировать базовый отчёт.

---

## 14. Phase 10 — Notifications & Audit

### Цель

Добавить минимальные системные события и контроль действий.

### Что сделать

- in-app notification entity;
- assignment notification;
- deadline reminder placeholder;
- completion notification;
- audit log entity;
- audit events for critical actions;
- admin audit view basic.

### Критерии готовности

- при назначении создаётся уведомление;
- при завершении создаётся уведомление;
- ключевые действия попадают в audit log;
- Admin может просмотреть audit log.

---

## 15. Phase 11 — Deployment MVP

### Цель

Запустить MVP в облаке и сохранить переносимость.

### Что сделать

- Railway project setup;
- Railway PostgreSQL;
- env vars;
- production build;
- migrations on deploy;
- healthcheck;
- Dockerfile;
- docker-compose for local/portable setup;
- deployment README.

### Критерии готовности

- backend/frontend доступны в deployed environment;
- database migrations применяются;
- env vars описаны;
- проект можно запустить через Docker локально;
- есть инструкции переноса на другой сервер.

---

## 16. Phase 12 — Pilot Hardening

### Цель

Подготовить MVP к первым тестовым пользователям.

### Что сделать

- smoke tests;
- manual QA checklist;
- seed demo data;
- fix critical UX issues;
- verify RBAC;
- verify file uploads;
- verify reports;
- verify certificate flow;
- prepare pilot admin guide.

### Критерии готовности

- тестовый администратор может пройти весь сценарий;
- тестовый learner может пройти обучение;
- нет критических ошибок в core learning loop;
- продукт можно показать первому пилотному клиенту.

---

## 17. Что делать после MVP

### После стабилизации MVP

- улучшить course builder;
- добавить импорт пользователей;
- расширить отчёты;
- добавить email notifications;
- улучшить mobile learner UX;
- добавить настройки компании;
- подготовить OpenAPI spec;
- начать интеграционный слой.

### Не начинать до готовности MVP

- AI tutor;
- RAG;
- Julia service;
- microservices;
- advanced SCORM/xAPI;
- offline mobile;
- enterprise SSO;
- сложный billing.

---

## 18. Рекомендуемый порядок GitHub Milestones

1. `M0 Project Setup`
2. `M1 Auth and RBAC`
3. `M2 Organization Structure`
4. `M3 Course Core`
5. `M4 Assignments and Learner Flow`
6. `M5 Progress and Assessments`
7. `M6 Certificates and Reports`
8. `M7 Notifications Audit Deployment`
9. `M8 Pilot Hardening`

---

## 19. Формат задач для AI-агентов

Каждая задача должна содержать:

- context;
- goal;
- affected modules;
- files likely to change;
- acceptance criteria;
- tests required;
- out of scope;
- security notes.

Пример формата:

```md
## Task
Implement course assignment to individual users.

## Context
The LMS MVP requires Admin to assign published courses to learners.

## Acceptance Criteria
- Admin can select a published course.
- Admin can assign it to one or more users.
- Learner sees the course in dashboard.
- Assignment has status and deadline.
- RBAC prevents Learner from assigning courses.

## Out of Scope
- Group assignment.
- Email notification.
- Advanced recurrence.
```

---

## 20. Итоговая рекомендация

Начинать разработку нужно не с UI и не с AI-функций, а с прохождения MVP learning loop от начала до конца.

Минимальный первый демонстрационный результат:

1. Admin создаёт learner.
2. Admin создаёт курс.
3. Admin назначает курс learner.
4. Learner проходит урок.
5. Система фиксирует прогресс.

После этого можно расширять систему тестами, сертификатами, отчётами и деплоем.

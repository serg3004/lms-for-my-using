# 21. LMS Documentation Consistency Check

Статус: финальная проверка согласованности документации  
Назначение: выявить противоречия, риски, незакрытые вопросы и зоны контроля перед стартом разработки

---

## 1. Назначение документа

Этот документ проверяет, насколько согласованы между собой подготовленные материалы по LMS.

Проверяются:

- продуктовая концепция;
- MVP scope;
- роли пользователей;
- архитектура;
- база данных;
- API;
- backlog;
- GitHub issues;
- AI-agent workflow;
- безопасность;
- тестирование;
- деплой;
- UX;
- mobile;
- коммерческая стратегия;
- roadmap версий.

---

## 2. Итоговая оценка согласованности

Общая оценка:

```text
Статус: согласовано для перехода к стартовой кодовой базе
Риск: средний
Главная зона контроля: не расширять MVP сверх core learning loop
```

Документы логически согласованы вокруг следующих решений:

- продукт: корпоративная LMS;
- язык продукта: русский;
- архитектура: modular monolith first;
- backend: TypeScript;
- frontend: React + TypeScript;
- DB: PostgreSQL;
- storage: S3-compatible;
- deployment: Railway-first;
- portability: Docker-first / Docker-portable;
- mobile: learner-first, после стабилизации web/API;
- AI-функции: future scope, не включать в MVP;
- разработка: один человек + AI-агенты;
- репозиторий: private GitHub.

---

## 3. Проверка продуктовой концепции

### 3.1 Согласованные положения

Во всех документах продукт трактуется как:

- корпоративная LMS;
- система для onboarding, compliance, upskilling/reskilling;
- B2B/enterprise-ready в будущем;
- простая для запуска;
- расширяемая после MVP;
- AI-ready, но не AI-dependent.

### 3.2 Потенциальный риск

Риск:

- продукт может начать конкурировать с mature enterprise LMS слишком рано.

Контроль:

- MVP продавать как onboarding/compliance learning core;
- enterprise-функции держать в v2.0+;
- AI держать в future scope.

Статус:

```text
Согласовано.
```

---

## 4. Проверка MVP scope

### 4.1 Что стабильно входит в MVP

Согласовано, что MVP включает:

- auth;
- users;
- fixed roles;
- basic organizations/groups/departments;
- courses;
- modules/lessons;
- file attachments;
- assignments;
- progress tracking;
- assessments;
- certificates;
- notifications basic;
- reports basic;
- audit log;
- admin portal;
- learner portal;
- Railway deployment;
- Docker portability.

### 4.2 Что стабильно не входит в MVP

Согласовано, что MVP не включает:

- AI-функции;
- SCORM/xAPI full support;
- LTI;
- SSO/SAML;
- advanced BI;
- marketplace;
- full mobile app as initial blocker;
- offline mobile;
- complex visual course builder;
- advanced gamification;
- custom branding;
- HRIS integrations.

### 4.3 Проверка конфликтов

Конфликтов нет, но есть зона внимания:

- mobile важен стратегически, но не должен блокировать web/API MVP;
- AI важен стратегически, но не должен попадать в первый релиз.

Статус:

```text
Согласовано.
```

---

## 5. Проверка ролей

### 5.1 Согласованные роли

Во всех документах используются роли:

- Admin;
- Instructor;
- Manager;
- Learner.

### 5.2 Зона упрощения MVP

В MVP допустимо:

- объединить Instructor и Admin в одном административном интерфейсе;
- не делать custom roles;
- не делать visual permission builder.

### 5.3 Требование

Backend обязан проверять RBAC независимо от UI.

Статус:

```text
Согласовано.
```

---

## 6. Проверка архитектуры

### 6.1 Согласованные решения

Архитектура согласована:

- modular monolith first;
- TypeScript backend;
- React + TypeScript frontend;
- PostgreSQL;
- S3-compatible storage;
- monorepo;
- Railway-first deployment;
- Docker portability;
- mobile как отдельное приложение позже;
- AI layer как future service/layer.

### 6.2 Возможный риск

Риск:

- AI-агенты могут преждевременно выделить микросервисы.

Контроль:

- запрещено начинать с микросервисной архитектуры;
- отдельные сервисы допустимы только после явной причины;
- integrations/AI/analytics можно выносить позже.

Статус:

```text
Согласовано.
```

---

## 7. Проверка базы данных и API

### 7.1 Согласование сущностей

Database model и API contracts должны покрывать:

- users;
- roles;
- organizations;
- groups/departments;
- courses;
- modules;
- lessons;
- lesson content/files;
- assignments;
- progress;
- assessments;
- questions;
- answers;
- attempts;
- certificates;
- notifications;
- reports;
- audit log.

### 7.2 Возможные TODO VERIFY

Перед кодом нужно уточнить:

1. Используем Prisma или Drizzle?
2. JWT/session strategy?
3. Нужна ли отдельная сущность `organization` в MVP или достаточно одной организации?
4. Как моделировать groups/departments: одна универсальная таблица или две?
5. Где хранить lesson content: JSONB или отдельные content blocks?
6. Какой формат сертификата: HTML-to-PDF или PDF template позже?

### 7.3 Рекомендация

Для старта:

- ORM: Prisma или Drizzle, выбрать один до генерации кода;
- organization оставить в модели, даже если MVP single-tenant;
- groups/departments можно начать с универсальной `groups`;
- lesson content начать с простого rich text/markdown + attachments;
- certificates начать с HTML/PDF generation later или HTML certificate view.

Статус:

```text
Согласовано, но есть TODO VERIFY перед стартом кода.
```

---

## 8. Проверка backlog и GitHub Issues

### 8.1 Согласованность

Backlog и GitHub Issues должны следовать порядку:

1. repository foundation;
2. backend foundation;
3. database schema;
4. auth/RBAC;
5. users/groups;
6. courses/lessons;
7. assignments/progress;
8. assessments;
9. certificates;
10. reports;
11. notifications;
12. frontend;
13. Railway/Docker;
14. testing/security hardening.

### 8.2 Риск

Риск:

- начать frontend до стабильных API;
- начать mobile до web/API;
- начать commercial polish до core learning loop.

Контроль:

- issue dependencies должны соблюдаться;
- каждый PR должен ссылаться на issue;
- запрещено делать future scope без отдельного решения.

Статус:

```text
Согласовано.
```

---

## 9. Проверка AI-agent workflow

### 9.1 Согласованные правила

AI-агенты должны:

- работать через private GitHub;
- брать задачи из issues;
- создавать ветки;
- делать PR;
- писать summary изменений;
- не менять архитектуру без обоснования;
- не добавлять функции вне MVP;
- обновлять документацию при изменении решений;
- использовать testing/security checklists.

### 9.2 Главный риск

AI-агент может:

- галлюцинировать требования;
- добавлять лишние библиотеки;
- менять структуру без причины;
- пропускать тесты;
- делать широкие PR.

Контроль:

- использовать `23_LMS_AI_Agent_Master_Context.md`;
- ограничивать задачи одним issue;
- проверять PR checklist;
- вести audit log.

Статус:

```text
Согласовано.
```

---

## 10. Проверка безопасности

### 10.1 Согласованные security requirements

Обязательны:

- password hashing;
- token/session security;
- RBAC backend enforcement;
- organization scope;
- secure file access;
- signed URLs for private files;
- env secrets;
- audit log;
- rate limiting;
- CORS;
- backup;
- no secrets in repo.

### 10.2 TODO VERIFY

Уточнить до кода:

- auth strategy: JWT, cookies, sessions;
- password reset strategy;
- invite flow;
- file upload limits;
- antivirus scan нужен ли в MVP или later;
- audit retention policy.

Статус:

```text
Согласовано, есть TODO VERIFY.
```

---

## 11. Проверка тестирования

### 11.1 Согласованные тестовые зоны

Покрыть:

- auth;
- RBAC;
- courses;
- lessons;
- assignments;
- progress;
- assessments;
- certificates;
- API validation;
- frontend flows;
- smoke tests before deploy.

### 11.2 Риск

Риск:

- AI-агенты будут писать код без тестов.

Контроль:

- каждый backend module должен иметь minimum tests;
- critical paths должны иметь integration/API tests;
- перед deploy обязательны smoke tests.

Статус:

```text
Согласовано.
```

---

## 12. Проверка деплоя

### 12.1 Согласованные решения

- Railway-first;
- PostgreSQL на Railway или совместимый;
- S3-compatible storage;
- Dockerfile;
- docker-compose для локального/portable запуска;
- env templates;
- migrations before deploy;
- rollback plan.

### 12.2 TODO VERIFY

Перед реальным деплоем:

- выбрать домен;
- выбрать S3 provider;
- определить staging/prod окружения;
- решить стратегию миграций;
- настроить backup;
- настроить health checks.

Статус:

```text
Согласовано.
```

---

## 13. Проверка UX и mobile

### 13.1 Согласованность UX

Основные UI зоны согласованы:

- learner portal;
- admin portal;
- manager portal;
- instructor/admin editor;
- lesson player;
- assessments;
- reports;
- certificates.

### 13.2 Согласованность mobile

Mobile:

- learner-first;
- не блокирует MVP;
- использует те же API;
- React Native/Expo предпочтительно;
- offline full mode later;
- push notifications later/MVP+.

Статус:

```text
Согласовано.
```

---

## 14. Проверка коммерческой стратегии

### 14.1 Согласованность

Коммерческая стратегия соответствует MVP:

- onboarding;
- compliance;
- employee training;
- reporting;
- certificates;
- simple launch.

### 14.2 Риск

Риск:

- обещать enterprise/AI раньше готовности.

Контроль:

- AI/enterprise указывать как roadmap;
- demo строить только на готовом core learning loop.

Статус:

```text
Согласовано.
```

---

## 15. Главные незакрытые вопросы перед кодом

Перед стартом кодовой базы нужно принять 8 решений:

1. ORM: Prisma или Drizzle.
2. Backend framework: NestJS, Fastify, Express или другой TypeScript stack.
3. Auth strategy: JWT/cookies/session.
4. Frontend framework: Vite React, Next.js или другой вариант.
5. UI library: shadcn/ui, MUI, custom или другое.
6. File storage provider: MinIO локально, AWS S3, Cloudflare R2, Wasabi или Railway-compatible.
7. PDF certificates: сразу делать PDF или начать с HTML certificate view.
8. Multi-tenancy MVP: single organization with future organization scope или basic multi-org from start.

Рекомендация для быстрого старта:

```text
Backend: NestJS или Fastify
ORM: Prisma
Frontend: React + TypeScript + Vite
UI: shadcn/ui или lightweight component system
DB: PostgreSQL
Storage local dev: MinIO
Storage production: S3-compatible provider
Auth: secure cookie/session or JWT with refresh strategy
Deployment: Railway + Docker
```

---

## 16. Финальный вывод

Документация достаточно согласована для перехода к следующему этапу:

```text
Этап 8. Создание стартовой кодовой базы LMS
```

Но перед генерацией кода нужно зафиксировать технические выборы из раздела 15.


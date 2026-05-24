# 19. LMS Product Version Map

Статус: карта версий продукта  
Назначение: определить, что входит в MVP, v1.0, v1.5, v2.0 и Enterprise/AI-ready этапы

---

## 1. Назначение документа

Этот документ фиксирует развитие LMS по версиям, чтобы не смешивать MVP, коммерческий запуск, enterprise-функции и AI future scope.

Главная цель:

> защитить MVP от переусложнения и одновременно сохранить понятную стратегию роста.

---

## 2. Принципы версионирования

1. MVP должен доказать core learning loop.
2. v1.0 должен быть пригоден для первых коммерческих клиентов.
3. v1.5 должен усилить management, reporting и mobile.
4. v2.0 должен добавить enterprise/integrations readiness.
5. AI-функции должны появляться после стабильного ядра.
6. Каждая версия должна быть deployable.
7. Нельзя добавлять future scope в MVP без отдельного решения.

---

## 3. Версия MVP

### 3.1 Цель MVP

Доказать, что продукт может выполнять базовую функцию корпоративной LMS:

```text
Admin creates course
→ Admin assigns course
→ Learner completes lessons
→ Learner passes assessment
→ System tracks progress
→ System issues certificate
→ Admin/Manager sees report
```

### 3.2 MVP функции

Обязательно:

- auth;
- users;
- fixed roles;
- groups/departments basic;
- courses;
- modules/lessons;
- file attachments;
- assignments;
- progress tracking;
- assessments;
- certificates;
- basic notifications;
- reports;
- audit log;
- admin dashboard;
- learner portal;
- Railway deployment;
- Docker portability.

### 3.3 MVP не включает

- AI;
- SCORM/xAPI full support;
- SSO/SAML;
- HRIS integrations;
- marketplace;
- advanced BI;
- custom branding;
- offline mobile;
- complex drag-and-drop builder;
- multi-tenant enterprise isolation beyond basic organization scope.

### 3.4 MVP success criteria

- можно создать и пройти курс;
- прогресс сохраняется корректно;
- тесты работают;
- сертификаты выдаются;
- отчёты показывают состояние обучения;
- деплой стабилен;
- проект можно развивать дальше без переписывания архитектуры.

---

## 4. Версия v1.0 — Commercial Ready

### 4.1 Цель

Сделать продукт пригодным для первых платных клиентов или пилотных внедрений.

### 4.2 Функции v1.0

- улучшенный UI;
- стабильный course editor;
- более удобные назначения;
- manager dashboard;
- CSV export;
- certificate templates;
- notification improvements;
- better onboarding flow;
- basic customer settings;
- improved audit log;
- better error handling;
- documentation for admins;
- production monitoring basics.

### 4.3 Технические улучшения

- refactor после MVP;
- test coverage для critical paths;
- migration safety;
- backup routine;
- deployment checklist;
- environment separation;
- CI checks.

### 4.4 v1.0 DoD

- можно провести demo для клиента;
- можно провести пилот;
- есть admin guide;
- есть стабильный deployment;
- основные ошибки обработаны;
- критические security checks закрыты.

---

## 5. Версия v1.5 — Mobile & Management

### 5.1 Цель

Усилить продукт для распределённых команд и руководителей.

### 5.2 Функции

- mobile learner app;
- push notifications;
- improved manager reports;
- team progress analytics;
- overdue alerts;
- recurring assignments basic;
- course due date automation;
- improved learner reminders;
- better certificate management.

### 5.3 Mobile scope

- login;
- dashboard;
- my courses;
- lesson player;
- assessments;
- certificates;
- notifications;
- profile.

### 5.4 Не включать без необходимости

- mobile admin;
- offline full mode;
- AI tutor;
- advanced gamification.

---

## 6. Версия v2.0 — Enterprise & Integrations

### 6.1 Цель

Подготовить продукт к крупным корпоративным внедрениям.

### 6.2 Функции

- SSO/SAML/OIDC;
- advanced RBAC;
- custom roles;
- HRIS integrations;
- external API;
- webhooks;
- advanced reports;
- custom branding;
- multi-organization hardening;
- import/export users;
- advanced audit;
- retention policies;
- SLA readiness.

### 6.3 Integrations

Потенциальные интеграции:

- HRIS;
- Slack/Teams;
- email providers;
- SSO providers;
- analytics tools;
- data warehouse export.

### 6.4 Enterprise DoD

- безопасная tenant/organization isolation;
- документированное API;
- audit-ready;
- monitoring;
- backup/restore;
- role governance;
- support workflow.

---

## 7. Версия v2.5 — Advanced Learning

### 7.1 Цель

Добавить продвинутые learning-функции без ломки ядра.

### 7.2 Возможные функции

- learning paths;
- prerequisites;
- skill matrix;
- competency tracking;
- recommendations;
- recurring compliance programs;
- course versioning;
- advanced certificate rules;
- surveys;
- feedback forms;
- question banks.

---

## 8. Версия AI-ready / AI-powered

### 8.1 Цель

Добавить AI-функции после стабилизации ядра.

### 8.2 Возможные AI-функции

- генерация черновиков курсов;
- генерация тестов;
- AI-помощник для администратора;
- AI-помощник для учащегося;
- summary уроков;
- рекомендации курсов;
- анализ пробелов в знаниях;
- risk prediction по просрочкам;
- автоматическое tagging content;
- AI analytics assistant.

### 8.3 Ограничения

AI не должен:

- нарушать privacy;
- принимать критические решения без человека;
- заменять RBAC;
- генерировать обязательный compliance-контент без проверки;
- попадать в MVP.

### 8.4 AI readiness requirements

Перед добавлением AI должны быть:

- стабильная база данных;
- чистая модель курсов;
- лог событий;
- понятные permissions;
- API;
- audit log;
- политика хранения данных;
- human review flow.

---

## 9. Версия Self-hosted / Portable

### 9.1 Цель

Сделать продукт переносимым на VPS, сервер клиента или другую инфраструктуру.

### 9.2 Требования

- Docker Compose;
- env templates;
- PostgreSQL;
- S3-compatible storage;
- migrations;
- backup/restore docs;
- health checks;
- deployment docs;
- no hard Railway dependency.

### 9.3 Необходимость

Это важно, потому что проект изначально должен быть Railway-first, но Docker-portable.

---

## 10. Roadmap summary

```text
MVP
→ Core LMS loop, Railway deploy, Docker portability

v1.0
→ Commercial-ready polish, reports, stability, docs

v1.5
→ Mobile learner app, manager workflows, reminders

v2.0
→ Enterprise integrations, SSO, advanced RBAC, API

v2.5
→ Advanced learning paths, skills, recurring programs

AI-ready
→ AI generation, recommendations, analytics assistant
```

---

## 11. Решения по scope

### В MVP

Только то, что нужно для core learning loop.

### В v1.0

То, что нужно для пилотных клиентов.

### В v1.5

То, что усиливает мобильный и management use case.

### В v2.0

То, что нужно enterprise-клиентам.

### В AI-ready

То, что создаёт дифференциацию, но не ломает доверие и безопасность.

---

## 12. Product version table

| Версия | Главная цель | Основной пользователь | Ключевые функции |
|---|---|---|---|
| MVP | Доказать learning loop | Admin/Learner | Курсы, уроки, тесты, прогресс, сертификаты |
| v1.0 | Пилотные клиенты | Admin/Manager | UX polish, отчёты, CSV, документация |
| v1.5 | Mobile learning | Learner/Manager | Mobile app, push, team progress |
| v2.0 | Enterprise readiness | Admin/IT | SSO, integrations, advanced RBAC |
| v2.5 | Advanced learning | L&D | Learning paths, skills, recurring programs |
| AI-ready | AI differentiation | Admin/Learner | Course generation, recommendations, analytics |

---

## 13. Правило для AI-агентов

AI-агент обязан перед добавлением функции определить её версию:

- MVP;
- v1.0;
- v1.5;
- v2.0;
- v2.5;
- AI-ready;
- OUT OF SCOPE.

Если функция не относится к текущей версии, агент должен пометить её как future scope и не реализовывать без отдельной задачи.

---

## 14. Связь с документами

Связано с:

- `01_LMS_Master_Product_Specification.md`;
- `02_LMS_MVP_Roadmap.md`;
- `07_LMS_Unified_Product_Backlog.md`;
- `10_LMS_AI_Coding_Agent_Instructions.md`;
- `16_LMS_UX_UI_Structure.md`;
- `17_LMS_Mobile_App_Scope.md`;
- `18_LMS_Commercial_Strategy.md`.


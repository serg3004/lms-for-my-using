# 20. LMS Full Project Documentation Index

Статус: финальный индекс проектной документации  
Проект: корпоративная LMS / Learning Operating System  
Язык продукта: русский  
Подход: modular monolith first, Railway-first, Docker-portable, AI-agent assisted development

---

## 1. Назначение документа

Этот документ является единым индексом всей подготовленной документации по проекту LMS.

Он нужен, чтобы:

- быстро понимать, какой документ за что отвечает;
- не путаться между продуктовой, технической и операционной документацией;
- правильно давать контекст AI-агентам;
- понимать, какие документы использовать перед стартом разработки;
- видеть логическую последовательность перехода от идеи к реализации.

---

## 2. Общая структура документации

Подготовленная документация разделена на 7 этапов:

```text
Этап 1. Главная основа проекта
Этап 2. Техническое проектирование
Этап 3. План разработки
Этап 4. Инструкции для ИИ-агентов
Этап 5. Качество, безопасность и деплой
Этап 6. UX, mobile и коммерческая стратегия
Этап 7. Финальная консолидация документации
```

---

## 3. Этап 1. Главная основа проекта

### 01_LMS_Master_Product_Specification.md

Главный продуктовый документ.

Содержит:

- описание LMS;
- цель продукта;
- целевую аудиторию;
- роли пользователей;
- MVP scope;
- out of scope;
- архитектурные принципы;
- будущие направления развития.

Когда использовать:

- перед любыми продуктовыми решениями;
- при проверке новых функций;
- при постановке задач AI-агентам;
- при обсуждении scope MVP.

Главный смысл:

> Это документ, который объясняет, что именно мы создаём и почему.

---

### 02_LMS_MVP_Roadmap.md

Дорожная карта MVP.

Содержит:

- этапы создания MVP;
- порядок реализации;
- что делать сначала;
- что делать позже;
- какие функции не включать в MVP;
- критерии готовности MVP.

Когда использовать:

- при планировании разработки;
- перед созданием GitHub milestones;
- при контроле scope;
- при проверке, не ушёл ли проект в переусложнение.

Главный смысл:

> Это документ, который защищает MVP от хаоса и лишних функций.

---

### 03_LMS_Architecture_Map.md

Архитектурная карта.

Содержит:

- modular monolith first;
- backend modules;
- frontend modules;
- PostgreSQL;
- S3-compatible storage;
- Railway-first deployment;
- Docker portability;
- future mobile layer;
- future AI layer.

Когда использовать:

- перед проектированием кода;
- при изменении архитектуры;
- при создании backend/frontend структуры;
- при ревью pull requests.

Главный смысл:

> Это документ, который фиксирует техническое направление проекта.

---

## 4. Этап 2. Техническое проектирование

### 04_LMS_Database_Model_Draft.md

Черновик модели данных PostgreSQL.

Содержит:

- основные сущности;
- таблицы;
- связи;
- users, roles, organizations;
- courses, modules, lessons;
- assignments, progress;
- assessments, certificates;
- files, notifications, audit log.

Когда использовать:

- перед созданием схемы БД;
- при выборе ORM;
- при проектировании миграций;
- при проверке API.

Главный смысл:

> Это основа базы данных MVP.

---

### 05_LMS_API_Contracts_Draft.md

Черновик API-контрактов.

Содержит:

- auth API;
- users API;
- courses API;
- lessons API;
- assignments API;
- progress API;
- assessments API;
- certificates API;
- files API;
- reports API;
- RBAC requirements.

Когда использовать:

- перед реализацией backend endpoints;
- перед разработкой frontend;
- перед мобильным приложением;
- при проверке соответствия API модели данных.

Главный смысл:

> Это договор между backend, frontend и будущим mobile app.

---

### 06_LMS_Repository_Structure.md

Структура private GitHub monorepo.

Содержит:

- apps/api;
- apps/web;
- apps/mobile;
- packages/shared;
- infra/docker;
- docs;
- .github;
- рекомендации по веткам;
- размещение документации.

Когда использовать:

- при создании репозитория;
- перед стартом кодовой базы;
- при настройке CI/CD;
- при организации AI-agent workflow.

Главный смысл:

> Это каркас будущего репозитория.

---

## 5. Этап 3. План разработки

### 07_LMS_Unified_Product_Backlog.md

Единый backlog продукта.

Содержит:

- epics;
- user stories;
- backend tasks;
- frontend tasks;
- database tasks;
- DevOps tasks;
- security tasks;
- testing tasks;
- priorities;
- dependencies;
- Definition of Done.

Когда использовать:

- при планировании задач;
- при создании GitHub issues;
- при разделении работы между AI-агентами;
- при контроле прогресса.

Главный смысл:

> Это карта всех задач разработки.

---

### 08_LMS_GitHub_Issues_Import.md

Структура задач для GitHub Issues.

Содержит:

- issue titles;
- descriptions;
- labels;
- priorities;
- milestones;
- acceptance criteria;
- dependencies.

Когда использовать:

- при создании задач в GitHub;
- при выдаче задач AI-агентам;
- при контроле pull requests;
- при планировании sprint/iteration.

Главный смысл:

> Это практический мост между документацией и GitHub.

---

### 09_LMS_Implementation_Plan_Solo_Developer_AI_Agents.md

План разработки для одного человека с AI-агентами.

Содержит:

- порядок итераций;
- branch strategy;
- PR checklist;
- правила работы GPT/Claude/Codex;
- контроль контекста;
- контроль ошибок;
- как не потерять управление проектом.

Когда использовать:

- каждый раз перед стартом новой итерации;
- при работе с AI coding agents;
- при ревью AI-generated кода;
- при управлении приватным репозиторием.

Главный смысл:

> Это инструкция, как одному человеку управлять разработкой с помощью AI-агентов.

---

## 6. Этап 4. Инструкции для ИИ-агентов

### 10_LMS_AI_Coding_Agent_Instructions.md

Главная инструкция для AI coding agent.

Содержит:

- роль агента;
- стек проекта;
- архитектурные ограничения;
- backend rules;
- frontend rules;
- database rules;
- testing rules;
- PR rules;
- запреты на overengineering.

Когда использовать:

- как системный/проектный контекст для AI coding agent;
- перед выдачей задачи;
- при старте нового AI-чата;
- при проверке кода.

Главный смысл:

> Это главный operational brief для AI-разработчика.

---

### 11_LMS_AI_Agent_Workflow_GitHub_Railway.md

Workflow работы через GitHub и Railway.

Содержит:

- private GitHub workflow;
- branch naming;
- issue-to-PR process;
- Railway deployment;
- environment variables;
- migration rules;
- Docker portability;
- secrets management.

Когда использовать:

- при настройке репозитория;
- при подключении Railway;
- перед деплоем;
- при работе с PR.

Главный смысл:

> Это процессная инструкция для разработки и деплоя.

---

### 12_LMS_Audit_Log_And_Context_Management.md

Управление контекстом и audit log.

Содержит:

- engineering audit log;
- ADR;
- scope decisions;
- TODO VERIFY;
- AI-agent error tracking;
- runtime product audit log;
- правила сохранения контекста.

Когда использовать:

- при принятии архитектурных решений;
- при исправлении ошибок;
- при переходе между чатами;
- при ревью решений AI-агентов.

Главный смысл:

> Это защита проекта от потери контекста и неконтролируемых изменений.

---

## 7. Этап 5. Качество, безопасность и деплой

### 13_LMS_Security_Checklist.md

Чеклист безопасности.

Содержит:

- auth security;
- RBAC;
- organization scope;
- file security;
- API security;
- secrets;
- Railway;
- Docker;
- audit log;
- production hardening.

Когда использовать:

- перед merge;
- перед staging;
- перед production;
- при реализации auth/RBAC/files;
- при security review.

Главный смысл:

> Это минимальная security gate для реального продукта.

---

### 14_LMS_Testing_Strategy.md

Стратегия тестирования.

Содержит:

- unit tests;
- integration tests;
- API tests;
- RBAC tests;
- frontend tests;
- E2E tests;
- security tests;
- smoke tests;
- Railway deployment checks.

Когда использовать:

- перед реализацией новых модулей;
- перед merge;
- перед деплоем;
- при постановке задач AI-агентам.

Главный смысл:

> Это план проверки, чтобы AI-generated код не ломал продукт.

---

### 15_LMS_Deployment_Plan_Railway_Docker.md

План деплоя.

Содержит:

- Railway-first deployment;
- Docker portability;
- env variables;
- PostgreSQL;
- S3-compatible storage;
- migrations;
- backups;
- rollback;
- production readiness gate.

Когда использовать:

- при первом деплое;
- при настройке окружений;
- при переносе на другой сервер;
- при production hardening.

Главный смысл:

> Это инструкция, как запустить продукт и не привязать его навсегда к одной платформе.

---

## 8. Этап 6. UX, mobile и коммерческая стратегия

### 16_LMS_UX_UI_Structure.md

UX/UI-структура продукта.

Содержит:

- learner portal;
- admin portal;
- manager portal;
- instructor portal;
- lesson player;
- course editor;
- assessments;
- design system;
- mobile web principles.

Когда использовать:

- перед frontend-разработкой;
- при проектировании экранов;
- при создании design system;
- при проверке пользовательских сценариев.

Главный смысл:

> Это карта пользовательского интерфейса LMS.

---

### 17_LMS_Mobile_App_Scope.md

Scope мобильного приложения.

Содержит:

- learner-first mobile;
- mobile MVP;
- screens;
- mobile flows;
- API reuse;
- offline future;
- push notifications;
- mobile security.

Когда использовать:

- после стабилизации web/API MVP;
- перед созданием apps/mobile;
- при планировании v1.5.

Главный смысл:

> Это границы мобильного приложения без преждевременного усложнения.

---

### 18_LMS_Commercial_Strategy.md

Коммерческая стратегия.

Содержит:

- целевые сегменты;
- боли клиентов;
- value proposition;
- pricing;
- go-to-market;
- demo flow;
- product metrics.

Когда использовать:

- перед pilot;
- при подготовке коммерческого предложения;
- при формировании landing/demo;
- при выборе функций для v1.0.

Главный смысл:

> Это документ, который связывает разработку с рынком и продажами.

---

### 19_LMS_Product_Version_Map.md

Карта версий продукта.

Содержит:

- MVP;
- v1.0;
- v1.5;
- v2.0;
- v2.5;
- AI-ready;
- enterprise;
- self-hosted.

Когда использовать:

- при планировании roadmap;
- при проверке новых идей;
- при защите MVP от scope creep;
- при работе AI-агентов.

Главный смысл:

> Это документ, который определяет, что делать сейчас, а что позже.

---

## 9. Этап 7. Финальная консолидация

### 20_LMS_Full_Project_Documentation_Index.md

Этот файл.

Назначение:

- единый индекс документации;
- объяснение роли каждого файла;
- навигация по проекту.

---

### 21_LMS_Documentation_Consistency_Check.md

Проверка согласованности документов.

Назначение:

- выявить возможные конфликты;
- проверить совпадение ролей, MVP, API, базы, backlog;
- определить зоны TODO VERIFY;
- зафиксировать риски перед стартом кода.

---

### 22_LMS_Final_Implementation_Order.md

Финальный порядок реализации.

Назначение:

- определить, что делать в GitHub первым;
- связать backlog, API, DB и deploy;
- сформировать практический порядок разработки.

---

### 23_LMS_AI_Agent_Master_Context.md

Короткий master-контекст для AI-агента.

Назначение:

- давать AI-агенту перед работой;
- быстро восстанавливать контекст;
- предотвращать галлюцинации и лишние функции.

---

## 10. Главные документы для разных задач

### Для владельца продукта

Использовать:

- `01_LMS_Master_Product_Specification.md`;
- `02_LMS_MVP_Roadmap.md`;
- `18_LMS_Commercial_Strategy.md`;
- `19_LMS_Product_Version_Map.md`;
- `20_LMS_Full_Project_Documentation_Index.md`.

### Для backend-разработки

Использовать:

- `03_LMS_Architecture_Map.md`;
- `04_LMS_Database_Model_Draft.md`;
- `05_LMS_API_Contracts_Draft.md`;
- `13_LMS_Security_Checklist.md`;
- `14_LMS_Testing_Strategy.md`.

### Для frontend-разработки

Использовать:

- `05_LMS_API_Contracts_Draft.md`;
- `16_LMS_UX_UI_Structure.md`;
- `07_LMS_Unified_Product_Backlog.md`;
- `14_LMS_Testing_Strategy.md`.

### Для mobile-разработки

Использовать:

- `17_LMS_Mobile_App_Scope.md`;
- `05_LMS_API_Contracts_Draft.md`;
- `06_LMS_Repository_Structure.md`;
- `19_LMS_Product_Version_Map.md`.

### Для DevOps

Использовать:

- `06_LMS_Repository_Structure.md`;
- `11_LMS_AI_Agent_Workflow_GitHub_Railway.md`;
- `15_LMS_Deployment_Plan_Railway_Docker.md`;
- `13_LMS_Security_Checklist.md`.

### Для AI coding agent

Использовать в первую очередь:

- `23_LMS_AI_Agent_Master_Context.md`;
- `10_LMS_AI_Coding_Agent_Instructions.md`;
- `08_LMS_GitHub_Issues_Import.md`;
- `03_LMS_Architecture_Map.md`;
- `05_LMS_API_Contracts_Draft.md`;
- `14_LMS_Testing_Strategy.md`.

---

## 11. Рекомендуемый порядок чтения перед стартом разработки

Минимальный порядок:

```text
01 → 02 → 03 → 06 → 07 → 08 → 10 → 11 → 13 → 14 → 15 → 22 → 23
```

Полный порядок:

```text
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23
```

---

## 12. Итог

Комплект документации достаточен для перехода к следующему этапу:

> создание стартовой кодовой базы LMS в private GitHub repository.

Перед созданием кода необходимо использовать:

- финальный порядок реализации;
- master-контекст AI-агента;
- GitHub issues;
- repository structure;
- database model;
- API contracts;
- security и testing gates.


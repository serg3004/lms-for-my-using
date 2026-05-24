# 11. LMS AI Agent Workflow: GitHub + Railway

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать практический workflow работы AI-агентов с private GitHub-репозиторием и Railway-first деплоем.  
**Цель:** сделать разработку управляемой, проверяемой и безопасной, даже если большую часть кода пишут AI-агенты.

---

## 1. Общая модель работы

Проект ведётся через private GitHub repository. AI-агенты работают не напрямую “по всему проекту”, а через ограниченные задачи.

Основной процесс:

```text
Документы → GitHub Issue → Feature branch → AI implementation → Tests → Pull Request → Review → Merge → Railway deploy → Audit log
```

Каждое изменение должно быть связано с issue, веткой и pull request.

---

## 2. Репозиторий

Рекомендуемая структура monorepo:

```text
lms-platform/
  apps/
    api/
    web/
    mobile/
  packages/
    shared/
    ui/
    config/
  infra/
    docker/
    railway/
  docs/
  scripts/
  .github/
```

### 2.1 Основные зоны ответственности

```text
apps/api      — backend LMS
apps/web      — web frontend
apps/mobile   — mobile app scope / будущая мобильная разработка
packages      — общие типы, UI, конфиги
infra         — Docker, Railway, deployment docs
docs          — проектная документация
.github       — issue templates, PR templates, workflows
```

---

## 3. Branch strategy

Для одного владельца проекта и AI-агентов используется простая модель:

```text
main          — стабильная ветка
feature/*     — новая функциональность
fix/*         — исправления
chore/*       — инфраструктура
refactor/*    — ограниченный рефакторинг
docs/*        — документация
```

### 3.1 Правила

- Не пушить напрямую в `main`.
- Одна задача — одна ветка.
- Одна ветка — один Pull Request.
- Один PR должен быть небольшим и проверяемым.
- PR должен ссылаться на GitHub Issue.

### 3.2 Формат названий веток

```text
feature/010-auth-endpoints
feature/016-course-crud
feature/023-progress-tracking
fix/031-rbac-assignment-access
chore/railway-env-config
docs/update-api-contracts
```

---

## 4. GitHub Issues

Каждая задача должна иметь:

```text
Title
Context
Scope
Out of scope
Acceptance criteria
Affected areas
Dependencies
Labels
Milestone
```

### 4.1 Типы labels

```text
type:backend
type:frontend
type:database
type:devops
type:security
type:testing
type:docs
type:mobile
type:ai-future
priority:p0
priority:p1
priority:p2
status:blocked
status:ready
status:in-progress
```

### 4.2 Хорошая задача для AI-агента

```text
Title: Реализовать auth endpoints для login/logout/me

Scope:
- POST /auth/login
- POST /auth/logout
- GET /auth/me
- basic session/JWT handling
- validation
- tests

Out of scope:
- SSO
- OAuth
- MFA
- enterprise identity providers

Acceptance criteria:
- Learner/Admin can login
- invalid credentials return 401
- /auth/me returns current user
- tests cover success and failure cases
```

### 4.3 Плохая задача

```text
Сделай весь backend LMS.
```

Такие задачи нельзя отдавать AI-агенту.

---

## 5. Pull Request workflow

### 5.1 PR template

Каждый PR должен иметь:

```text
Closes #...

## Что сделано
- ...

## Как проверить
1. ...

## Тесты
- ...

## Изменённые файлы/модули
- ...

## Риски
- ...

## Что не входит в PR
- ...
```

### 5.2 Минимальные условия merge

PR можно принимать, если:

- задача соответствует issue;
- нет unrelated changes;
- проект собирается;
- тесты проходят;
- нет секретов в коде;
- обновлена документация, если изменились API/DB/env;
- права доступа проверены;
- нет самовольной смены архитектуры.

---

## 6. Работа AI-агента с GitHub

### 6.1 Входные данные для агента

Перед началом агенту нужно дать:

```text
1. Номер GitHub Issue
2. Текст Issue
3. Ссылки/пути к релевантным docs
4. Ограничения по scope
5. Ожидаемый формат результата
```

### 6.2 Инструкция агенту на задачу

Шаблон:

```text
Ты работаешь в private GitHub repository проекта LMS.
Выполни Issue #___ строго в рамках acceptance criteria.

Архитектура: modular monolith first.
Стек: TypeScript, React + TypeScript, PostgreSQL, S3-compatible storage.
Не добавляй микросервисы, AI-функции, Kubernetes или unrelated dependencies.

Перед изменениями проверь:
- docs/Architecture Map
- docs/API Contracts
- docs/Database Model
- существующий код модуля

После изменений:
- запусти тесты
- обнови docs при необходимости
- подготовь PR summary
```

### 6.3 Что агент должен вернуть

```text
Summary
Files changed
Tests run
Manual verification
Risks
Follow-up tasks
```

---

## 7. Railway-first deployment workflow

Railway используется как первая платформа деплоя, но проект должен оставаться переносимым через Docker.

### 7.1 Окружения

Минимально нужны:

```text
local
staging
production
```

На старте допускается:

```text
local + production
```

Но staging желательно добавить перед пилотным клиентом.

### 7.2 Railway services

Рекомендуемая структура Railway:

```text
api service
web service
postgres service
object storage integration / external S3-compatible provider
```

Если frontend собирается как static app, он может деплоиться отдельно от API.

### 7.3 Переменные окружения

Обязательные группы переменных:

```text
DATABASE_URL
APP_ENV
API_URL
WEB_URL
AUTH_SECRET
JWT_SECRET or SESSION_SECRET
S3_ENDPOINT
S3_BUCKET
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_REGION
CORS_ORIGIN
LOG_LEVEL
```

Правила:

- не коммитить `.env` с реальными секретами;
- хранить только `.env.example`;
- все Railway secrets задавать через Railway UI/API;
- для local использовать отдельные dev secrets;
- не использовать production secrets в тестах.

---

## 8. Deploy pipeline

Минимальный pipeline:

```text
PR opened → lint → typecheck → tests → review → merge to main → Railway deploy
```

Желательный pipeline:

```text
PR → lint/typecheck/unit tests/integration tests
main → build Docker images → run migrations → deploy API → deploy Web → smoke test
```

### 8.1 Перед деплоем

Проверить:

- миграции БД;
- env variables;
- CORS;
- healthcheck;
- build frontend;
- API доступен;
- login работает;
- basic learner flow работает;
- admin dashboard открывается.

### 8.2 После деплоя

Выполнить smoke checklist:

```text
GET /health
Login as admin
Create course
Create lesson
Assign course to learner
Login as learner
Open assigned course
Complete lesson
Check progress
```

---

## 9. Docker portability

Несмотря на Railway-first, проект должен запускаться через Docker.

Минимальные файлы:

```text
Dockerfile.api
Dockerfile.web
docker-compose.yml
.env.example
infra/docker/README.md
```

`docker-compose.yml` должен позволять поднять:

```text
api
web
postgres
optional local object storage
```

Цель: проект можно перенести на VPS или другой сервер без полной переделки.

---

## 10. Railway API и AI-агенты

Если AI-агент получает доступ к Railway через API, он должен соблюдать ограничения.

### 10.1 Разрешено

- читать статус деплоя;
- читать build/deploy logs;
- проверять переменные окружения по списку без раскрытия значений;
- инициировать redeploy, если задача явно требует;
- фиксировать результаты проверки.

### 10.2 Запрещено без явного разрешения владельца

- удалять сервисы;
- менять production secrets;
- удалять базу данных;
- выполнять destructive migrations;
- менять домены;
- отключать production deployment;
- менять billing/project settings.

---

## 11. Работа с миграциями БД

Миграции должны выполняться контролируемо.

### 11.1 Правила

- каждая миграция связана с issue;
- миграция должна быть reviewable;
- destructive changes запрещены без отдельного подтверждения;
- для production нужен backup перед рискованными изменениями;
- schema changes должны отражаться в документации.

### 11.2 Risk labels

```text
migration:safe
migration:risky
migration:destructive
```

Destructive migration нельзя выполнять автоматически.

---

## 12. Контроль секретов

AI-агент не должен выводить секреты в ответах, PR, логах и документации.

Запрещено коммитить:

```text
.env
private keys
Railway tokens
GitHub tokens
S3 secrets
JWT secrets
database passwords
```

В документах использовать только placeholders:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
AUTH_SECRET=replace_me
```

---

## 13. Контроль качества AI-изменений

Перед merge владелец проекта должен проверить:

```text
1. Агент решил именно ту задачу?
2. Нет ли лишних зависимостей?
3. Не изменена ли архитектура?
4. Не сломан ли RBAC?
5. Не появились ли секреты?
6. Есть ли тесты?
7. Обновлены ли docs?
8. Пройдёт ли деплой на Railway?
```

---

## 14. Recommended cadence

Для solo developer оптимальный ритм:

```text
1–3 issues per day максимум на активной стадии
1 PR = 1 logical change
1 deployment checkpoint после группы связанных PR
1 weekly audit документации и backlog
```

Не стоит давать агенту 10–20 задач одновременно без review.

---

## 15. Incident workflow

Если после AI-изменений что-то сломалось:

```text
1. Остановить дальнейшие изменения
2. Зафиксировать симптомы
3. Найти последний PR
4. Проверить Railway logs
5. Проверить миграции
6. Выполнить rollback или revert PR
7. Создать bug issue
8. Добавить тест, который ловит проблему
9. Обновить audit log
```

---

## 16. Минимальный набор GitHub templates

Рекомендуется добавить:

```text
.github/ISSUE_TEMPLATE/feature.md
.github/ISSUE_TEMPLATE/bug.md
.github/ISSUE_TEMPLATE/chore.md
.github/pull_request_template.md
```

### 16.1 Pull request template

```markdown
Closes #

## Что сделано

## Как проверить

## Тесты

## Изменённые области

## Риски

## Checklist
- [ ] Нет unrelated changes
- [ ] Нет секретов
- [ ] Тесты проходят
- [ ] Документация обновлена
- [ ] RBAC проверен
```

---

## 17. Главный принцип

GitHub — источник процесса. Railway — среда запуска. AI-агенты — исполнители задач. Владелец проекта принимает решения и контролирует merge.

Нельзя позволять AI-агенту превращать проект в хаотичную серию несвязанных изменений. Каждый шаг должен быть трассируемым: issue → branch → PR → deploy → audit log.

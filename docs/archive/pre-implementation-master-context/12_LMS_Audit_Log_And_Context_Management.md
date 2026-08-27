# 12. LMS Audit Log and Context Management

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать, как вести журнал решений, изменений, контекста и работы AI-агентов, чтобы проект не терял управляемость.  
**Проблема:** при разработке с AI-агентами легко потерять контекст, получить противоречивые решения и не понять, почему код изменился.

---

## 1. Зачем нужен audit log

Audit log нужен не только для безопасности продукта, но и для управления разработкой.

Он отвечает на вопросы:

```text
Что было изменено?
Почему это было изменено?
Кто или какой агент сделал изменение?
По какой задаче?
Какие файлы затронуты?
Какие решения были приняты?
Какие риски остались?
Что нужно проверить позже?
```

Для проекта, где большую часть работы выполняют AI-агенты, audit log — обязательный элемент контроля.

---

## 2. Два типа audit log

В проекте нужны два разных уровня журнала.

### 2.1 Product / Engineering Audit Log

Это журнал разработки проекта.

Хранится в репозитории:

```text
docs/audit/engineering-audit-log.md
```

Фиксирует:

- архитектурные решения;
- изменения scope;
- важные PR;
- спорные решения;
- риски;
- ошибки AI-агентов;
- решения владельца проекта.

### 2.2 Runtime Product Audit Log

Это audit log внутри самой LMS.

Хранится в PostgreSQL и фиксирует действия пользователей:

- входы;
- изменения ролей;
- создание/удаление курсов;
- назначения курсов;
- прохождение тестов;
- выдачу сертификатов;
- изменения настроек;
- admin-действия.

Этот документ в первую очередь описывает **engineering/context audit log**, но также задаёт требования к runtime audit log.

---

## 3. Engineering audit log

### 3.1 Расположение

```text
docs/audit/engineering-audit-log.md
```

Дополнительно можно вести:

```text
docs/audit/architecture-decisions.md
docs/audit/ai-agent-runs.md
docs/audit/release-notes.md
docs/audit/known-risks.md
```

### 3.2 Формат записи

```markdown
## YYYY-MM-DD — Short title

**Type:** decision | implementation | bugfix | incident | scope-change | risk | docs  
**Related issue:** #___  
**Related PR:** #___  
**Agent:** GPT | Claude | Codex | Human  
**Status:** accepted | pending | reverted | TODO VERIFY  

### Context
...

### Decision / Change
...

### Files / Areas affected
- ...

### Reason
...

### Risks
- ...

### Follow-up
- ...
```

---

## 4. Когда обязательно делать запись

Запись в audit log обязательна, если:

- изменена архитектура;
- изменён MVP scope;
- добавлена новая зависимость;
- изменена схема БД;
- изменены API-контракты;
- изменены роли или права доступа;
- изменён deployment pipeline;
- была ошибка AI-агента;
- был production/staging incident;
- выполнена risky migration;
- принято решение отложить функцию;
- обнаружено противоречие в документации.

---

## 5. Architecture Decision Records

Для крупных решений использовать ADR.

Файл:

```text
docs/audit/architecture-decisions.md
```

Формат:

```markdown
# ADR-001: Modular Monolith First

**Date:** YYYY-MM-DD  
**Status:** Accepted  

## Context
Проект разрабатывается одним человеком с AI-агентами. Нужна простая, контролируемая архитектура.

## Decision
Использовать modular monolith first.

## Consequences
Плюсы:
- проще разработка;
- проще деплой;
- проще тестирование;
- меньше операционной сложности.

Минусы:
- нужно внимательно следить за границами модулей;
- будущие сервисы нужно выделять аккуратно.
```

Минимальный набор ADR:

```text
ADR-001 Modular Monolith First
ADR-002 TypeScript Backend
ADR-003 React Frontend
ADR-004 PostgreSQL Main Database
ADR-005 S3-compatible Storage
ADR-006 Railway-first Deployment
ADR-007 Docker Portability
ADR-008 AI Features Out of MVP
ADR-009 Private GitHub Repository
```

---

## 6. Context management для AI-агентов

### 6.1 Проблема контекста

AI-агент может ошибаться, если ему дать слишком мало или слишком много несвязанных данных.

Правильный контекст должен быть:

- ограниченным;
- актуальным;
- связанным с issue;
- с чётким scope;
- с явными запретами.

### 6.2 Контекст на одну задачу

Для каждой задачи агенту давать:

```text
1. Текст GitHub Issue
2. Acceptance criteria
3. Relevant docs
4. Relevant code paths
5. Out of scope
6. Expected output format
```

Не нужно давать агенту весь master-документ каждый раз, если задача маленькая.

### 6.3 Минимальный prompt для coding agent

```text
Ты работаешь над LMS проектом.
Выполни Issue #___

Контекст:
- Архитектура: modular monolith first
- Backend: TypeScript
- Frontend: React + TypeScript
- DB: PostgreSQL
- Deployment: Railway-first, Docker-portable
- AI features: OUT OF MVP

Relevant docs:
- docs/05_LMS_API_Contracts_Draft.md
- docs/04_LMS_Database_Model_Draft.md

Scope:
- ...

Out of scope:
- ...

Верни:
- Summary
- Files changed
- Tests
- Risks
```

---

## 7. Context package по типам задач

### 7.1 Backend task

Дать агенту:

```text
API Contracts
Database Model
Relevant module code
RBAC rules
Testing strategy
Issue acceptance criteria
```

### 7.2 Frontend task

Дать агенту:

```text
UX/UI Structure
API Contracts
Role behavior
Existing UI components
Issue acceptance criteria
```

### 7.3 Database task

Дать агенту:

```text
Database Model
Related API Contracts
Migration rules
Existing schema/migrations
Risk level
```

### 7.4 DevOps task

Дать агенту:

```text
Repository Structure
Deployment Plan
Railway config
Docker files
Environment variable docs
```

### 7.5 Documentation task

Дать агенту:

```text
Current docs
Source decisions
Expected audience
Required output format
```

---

## 8. Правила обновления документов

Документы не должны расходиться с кодом.

Если меняется код, проверить необходимость обновить:

```text
API contracts
Database model
Repository structure
Deployment plan
Security checklist
Testing strategy
README
.env.example
Audit log
```

Если меняется документация, проверить:

- не противоречит ли она ранее принятым решениям;
- не добавляет ли новый scope в MVP;
- не меняет ли стек без решения владельца.

---

## 9. Runtime product audit log

Внутри LMS нужен отдельный audit log для действий пользователей.

### 9.1 Таблица audit_logs

Рекомендуемая структура:

```text
audit_logs
- id
- organization_id
- actor_user_id
- actor_role
- action
- entity_type
- entity_id
- before_snapshot
- after_snapshot
- ip_address
- user_agent
- created_at
```

### 9.2 Что логировать в MVP

```text
User login/logout
Failed login attempt
User created/updated/deactivated
Role changed
Course created/updated/deleted
Lesson created/updated/deleted
Course assigned/unassigned
Assessment submitted
Certificate issued/revoked
File uploaded/deleted
System setting changed
```

### 9.3 Что не логировать

Не хранить в audit log:

- пароли;
- токены;
- raw secrets;
- полные персональные данные без необходимости;
- большие бинарные payloads;
- чувствительные данные, если достаточно ID и краткого snapshot.

---

## 10. Decision log для scope

Файл:

```text
docs/audit/scope-decisions.md
```

Формат:

```markdown
## YYYY-MM-DD — Function name

**Decision:** MVP | Post-MVP | OUT OF MVP | TODO VERIFY  
**Reason:** ...  
**Impact:** ...
```

Примеры:

```text
AI course recommendations — OUT OF MVP
SCORM/xAPI full runtime — OUT OF MVP
Basic certificates — MVP
S3-compatible file storage — MVP
Mobile native offline mode — Post-MVP
```

---

## 11. Контроль ошибок AI-агентов

Если AI-агент допустил ошибку, её нужно фиксировать.

Файл:

```text
docs/audit/ai-agent-errors.md
```

Формат:

```markdown
## YYYY-MM-DD — Error title

**Agent:** GPT | Claude | Codex  
**Issue/PR:** #___  
**Error type:** hallucination | scope creep | broken code | security risk | docs mismatch | bad migration  

### What happened
...

### Impact
...

### Fix
...

### Prevention rule
...
```

Цель — не повторять одну и ту же ошибку.

---

## 12. Weekly project review

Раз в неделю или после крупного пакета задач нужно проверять:

```text
1. Backlog актуален?
2. GitHub Issues соответствуют MVP?
3. Документы соответствуют коду?
4. Есть ли scope creep?
5. Есть ли устаревшие решения?
6. Есть ли незакрытые TODO VERIFY?
7. Есть ли риски по Railway/Docker?
8. Есть ли риски по безопасности?
9. Есть ли непроверенные AI-изменения?
```

Результат фиксировать в:

```text
docs/audit/weekly-review.md
```

---

## 13. Контроль TODO VERIFY

Все `TODO VERIFY` должны быть видимыми.

Рекомендуется вести список:

```text
docs/audit/todo-verify.md
```

Формат:

```markdown
| ID | Date | Area | Question | Owner decision | Status |
|---|---|---|---|---|---|
| TV-001 | YYYY-MM-DD | Certificates | Нужна ли ручная отмена сертификата в MVP? | TBD | Open |
```

Нельзя превращать `TODO VERIFY` в скрытую неопределённость.

---

## 14. Release notes

Каждый релиз или deployment checkpoint должен фиксироваться.

Файл:

```text
docs/audit/release-notes.md
```

Формат:

```markdown
## Release YYYY.MM.DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...

### Known issues
- ...
```

---

## 15. Главный принцип управления контекстом

AI-агент не должен быть единственным местом хранения решений. Все важные решения должны жить в репозитории:

```text
GitHub Issues
Pull Requests
Docs
Audit logs
ADR
Release notes
```

Если решение есть только в чате, оно легко потеряется. После важного решения его нужно перенести в документацию или audit log.

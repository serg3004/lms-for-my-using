# 09. LMS Implementation Plan for Solo Developer with AI Agents

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать практический порядок разработки LMS одним человеком с помощью AI-агентов GPT/Claude/Codex.  
**Модель работы:** владелец проекта управляет задачами, AI-агенты пишут большую часть кода, GitHub фиксирует решения, Railway используется для первого деплоя.  
**Репозиторий:** private GitHub.  
**Архитектура:** modular monolith first.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, S3-compatible storage.

---

## 1. Главный принцип разработки

Проект нельзя вести как хаотичный чат с ИИ. Его нужно вести как инженерный процесс:

```text
Документы → Backlog → GitHub Issues → Branch → AI implementation → Review → Tests → Merge → Deploy → Audit log
```

AI-агенты должны выполнять задачи, а не принимать архитектурные решения заново каждый раз.

---

## 2. Роли в процессе

### 2.1 Владелец проекта / solo developer

Отвечает за:

- финальные продуктовые решения;
- приоритеты;
- проверку результата;
- принятие pull requests;
- хранение доступов;
- контроль scope;
- деплой;
- бизнес-логику продукта.

### 2.2 GPT / ChatGPT agent

Рекомендуемая роль:

- продуктовая документация;
- архитектурные решения;
- decomposition задач;
- review требований;
- подготовка инструкций для coding agents;
- проверка противоречий;
- генерация README, docs, issue descriptions;
- помощь в диагностике ошибок.

### 2.3 Claude / coding agent

Рекомендуемая роль:

- реализация задач в коде;
- frontend/backend modules;
- тесты;
- рефакторинг;
- подготовка PR;
- исправление багов.

### 2.4 Codex / code-focused agent

Рекомендуемая роль:

- точечные изменения в репозитории;
- генерация миграций;
- исправление TypeScript ошибок;
- написание тестов;
- review кода;
- работа с конкретными GitHub issues.

---

## 3. Рабочие правила для AI-агентов

### 3.1 Один агент — одна задача

Не давать агенту задачу “сделай весь MVP”. Давать задачу уровня GitHub Issue.

Правильно:

```text
Реализуй Issue 010 — auth endpoints. Не меняй архитектуру, не добавляй новые фреймворки, не трогай unrelated modules.
```

Неправильно:

```text
Сделай весь backend LMS.
```

### 3.2 Никаких больших переписываний без разрешения

AI-агент не должен:

- менять стек;
- переносить проект на микросервисы;
- добавлять Kubernetes;
- добавлять AI-функции в MVP;
- переписывать рабочий код без причины;
- удалять файлы без объяснения;
- менять публичные API без обновления docs.

### 3.3 Любое изменение должно быть связано с issue

Каждый PR должен ссылаться на конкретную задачу.

Формат PR:

```text
Closes #010

Что сделано:
- ...

Как проверить:
- ...

Риски:
- ...
```

---

## 4. Branch strategy

Для одного разработчика с AI-агентами достаточно простой модели:

```text
main          — стабильная ветка
feature/*     — новая функция
fix/*         — исправление ошибки
docs/*        — документация
chore/*       — инфраструктура/служебные изменения
```

### Правила

- Не писать напрямую в `main`.
- Каждая задача — отдельная ветка.
- Merge только после проверки.
- Маленькие PR лучше больших.

### Примеры веток

```text
feature/010-auth-endpoints
feature/016-courses-api
feature/023-progress-tracking
fix/rbac-course-access
chore/railway-deploy-config
```

---

## 5. Pull Request checklist

Перед merge проверить:

```text
[ ] PR связан с GitHub Issue
[ ] Изменения соответствуют acceptance criteria
[ ] TypeScript typecheck проходит
[ ] Lint проходит
[ ] Тесты проходят или есть объяснение, почему тесты не добавлены
[ ] Миграции применяются
[ ] Нет hardcoded secrets
[ ] RBAC не сломан
[ ] API docs обновлены при изменении API
[ ] README/docs обновлены при изменении запуска
[ ] Нет лишнего переусложнения
```

---

## 6. Рекомендуемый порядок разработки по неделям/итерациям

Это не календарное обещание, а практический порядок. Реальная скорость зависит от времени, качества AI-агентов и количества проверок.

### Iteration 0 — Подготовка проекта

**Цель:** репозиторий, локальный запуск, CI.

Выполнить:

- Issue 001 — monorepo structure;
- Issue 002 — pnpm workspace;
- Issue 003 — API app;
- Issue 004 — web app;
- Issue 005 — PostgreSQL/migrations;
- Issue 006 — Docker local;
- Issue 007 — CI.

**Результат:** проект запускается локально, есть база, backend, frontend и CI.

---

### Iteration 1 — Auth, users, roles

**Цель:** можно войти в систему и управлять доступом.

Выполнить:

- Issue 008 — users model;
- Issue 009 — roles model;
- Issue 010 — auth endpoints;
- Issue 011 — RBAC middleware;
- Issue 012 — login/logout UI.

**Результат:** есть вход, роли, защищённые маршруты.

---

### Iteration 2 — Organization structure

**Цель:** подготовить корпоративную структуру.

Выполнить:

- Issue 013 — organizations;
- Issue 014 — departments/groups;
- Issue 015 — organization management UI.

**Результат:** можно создавать группы и связывать пользователей.

---

### Iteration 3 — Course management

**Цель:** можно создать и опубликовать курс.

Выполнить:

- Issue 016 — courses API;
- Issue 017 — modules and lessons;
- Issue 018 — course builder UI;
- Issue 019 — file storage.

**Результат:** instructor/admin создаёт курс с уроками и публикует его.

---

### Iteration 4 — Learning delivery

**Цель:** learner может получить назначение и пройти курс.

Выполнить:

- Issue 020 — assignments API;
- Issue 021 — assignment UI;
- Issue 022 — learner dashboard;
- Issue 023 — progress tracking;
- Issue 024 — course player.

**Результат:** core learning loop работает до прогресса.

---

### Iteration 5 — Assessments and certificates

**Цель:** проверка знаний и выдача сертификата.

Выполнить:

- Issue 025 — assessments model;
- Issue 026 — assessment attempts;
- Issue 027 — assessment UI;
- Issue 028 — certificate generation;
- Issue 029 — certificates UI.

**Результат:** learner проходит тест и получает сертификат.

---

### Iteration 6 — Reports, notifications, audit

**Цель:** manager/admin видит результаты, система фиксирует события.

Выполнить:

- Issue 030 — reports API;
- Issue 031 — reports UI;
- Issue 032 — notifications MVP;
- Issue 033 — audit log.

**Результат:** есть управленческая видимость обучения.

---

### Iteration 7 — Deployment and pilot readiness

**Цель:** MVP можно показать первым пользователям.

Выполнить:

- Issue 034 — Railway deployment;
- Issue 035 — production docs;
- Issue 036 — smoke checklist;
- Issue 037 — pilot hardening.

**Результат:** LMS доступна в Railway, core сценарии проверены.

---

## 7. Как формулировать задания AI coding agent

Шаблон задания:

```markdown
Ты работаешь в private GitHub repository LMS.

Задача: Issue XXX — <название>.

Контекст:
- Архитектура: modular monolith first.
- Backend: TypeScript.
- Frontend: React + TypeScript.
- DB: PostgreSQL.
- Не добавляй микросервисы, AI-функции, Kubernetes, SCORM/xAPI/LTI в MVP.

Что нужно сделать:
1. ...
2. ...
3. ...

Acceptance Criteria:
- ...
- ...

Ограничения:
- Не меняй unrelated files.
- Не меняй стек.
- Не удаляй существующие документы.
- Обнови docs, если изменил API или запуск.

В конце дай:
- список изменённых файлов;
- как запустить;
- как проверить;
- риски и TODO.
```

---

## 8. Как проверять результат AI-агента

### 8.1 Минимальная ручная проверка

Для каждой backend-задачи:

- запустить API;
- применить миграции;
- проверить endpoint;
- проверить auth/RBAC;
- проверить ошибочные сценарии.

Для каждой frontend-задачи:

- запустить web app;
- пройти сценарий в браузере;
- проверить пустые состояния;
- проверить ошибки API;
- проверить доступы ролей.

Для DevOps-задачи:

- повторить команды из README;
- проверить env vars;
- проверить build;
- проверить rollback strategy, если применимо.

### 8.2 Вопросы к AI-агенту после PR

```text
1. Какие файлы ты изменил и почему?
2. Какие acceptance criteria закрыты?
3. Как проверить задачу локально?
4. Какие риски остались?
5. Есть ли миграции и как их откатить?
6. Менялся ли API контракт?
7. Нужны ли обновления документации?
```

---

## 9. Контроль контекста

### 9.1 Документы, которые должны быть в repo

```text
docs/product/01_LMS_Master_Product_Specification.md
docs/product/02_LMS_MVP_Roadmap.md
docs/architecture/03_LMS_Architecture_Map.md
docs/database/04_LMS_Database_Model_Draft.md
docs/api/05_LMS_API_Contracts_Draft.md
docs/architecture/06_LMS_Repository_Structure.md
docs/planning/07_LMS_Unified_Product_Backlog.md
docs/planning/08_LMS_GitHub_Issues_Import.md
docs/planning/09_LMS_Implementation_Plan_Solo_Developer_AI_Agents.md
```

### 9.2 Что давать AI-агенту в контекст

Для большинства задач достаточно:

- relevant GitHub Issue;
- architecture map;
- database/API doc по теме;
- существующий код модуля;
- coding conventions.

Не нужно каждый раз давать весь master-документ на миллион символов. Это повышает риск потери фокуса.

---

## 10. Audit log разработки

Рекомендуется вести файл:

```text
docs/operations/AI_DEVELOPMENT_AUDIT_LOG.md
```

Формат записи:

```markdown
## YYYY-MM-DD — Issue XXX — Название

**Agent:** GPT / Claude / Codex  
**Branch:** feature/xxx-name  
**PR:** #...  
**Changed files:**
- ...

**What changed:**
- ...

**How tested:**
- ...

**Risks:**
- ...

**Follow-up tasks:**
- ...
```

Это нужно, чтобы через 2–3 недели не потерять понимание, что делали AI-агенты и почему.

---

## 11. Правила против переусложнения

До завершения MVP запрещено добавлять:

- микросервисную архитектуру;
- event bus как обязательную основу;
- Kubernetes;
- сложный multi-tenant billing;
- SCORM/xAPI/LTI как core MVP;
- AI tutor;
- AI quiz generator;
- Julia-сервис;
- offline mobile app;
- enterprise SSO как обязательное условие запуска;
- кастомный BI-конструктор отчётов;
- white-label theming.

Можно подготовить future placeholders, но нельзя делать эти функции блокирующими для MVP.

---

## 12. Минимальный MVP acceptance test

Перед первым pilot release LMS должна проходить сценарий:

```text
1. Admin входит в систему.
2. Admin создаёт learner.
3. Instructor/Admin создаёт курс.
4. Instructor/Admin добавляет уроки.
5. Instructor/Admin публикует курс.
6. Manager/Admin назначает курс learner или группе.
7. Learner входит в систему.
8. Learner видит назначенный курс.
9. Learner проходит уроки.
10. Система фиксирует прогресс.
11. Learner проходит тест.
12. Система фиксирует результат.
13. Система выдаёт сертификат.
14. Manager/Admin видит отчёт.
15. Audit log содержит ключевые действия.
```

Если этот сценарий не работает, MVP ещё не готов.

---

## 13. Риски и как их снижать

| Риск | Что произойдёт | Как снижать |
|---|---|---|
| AI-агент перепишет архитектуру | Потеря контроля | Маленькие issues, PR review |
| Документы расходятся с кодом | Ошибки реализации | Обновлять docs при изменениях |
| Слишком большой MVP | Задержка запуска | Жёстко соблюдать out of MVP |
| Нет тестов | Регрессии | Smoke checklist + базовые tests |
| Слабый RBAC | Утечки данных | Проверять роли на каждом endpoint |
| Secrets в repo | Security incident | `.env.example`, GitHub secrets, review |
| Railway-only lock-in | Сложный перенос | Docker-portable структура |
| Хаос в issues | AI делает лишнее | Acceptance criteria + labels + milestones |

---

## 14. Практический режим работы на каждый день

Рекомендуемый цикл:

```text
1. Выбрать 1–3 issues на день.
2. Проверить зависимости.
3. Создать branch.
4. Дать AI-агенту одну конкретную задачу.
5. Получить изменения.
6. Запустить проверки.
7. Провести ручной сценарий.
8. Исправить ошибки.
9. Обновить docs/audit log.
10. Merge.
```

Не накапливать 20 незавершённых веток. Лучше медленнее, но с контролем.

---

## 15. Первый практический старт после этих документов

После завершения Этапа 3 нужно сделать Этап 4 — инструкции для AI-агентов:

```text
10_LMS_AI_Coding_Agent_Instructions.md
11_LMS_AI_Agent_Workflow_GitHub_Railway.md
12_LMS_Audit_Log_And_Context_Management.md
```

После Этапа 4 можно переходить к реальному созданию репозитория и первым issues.

---

## 16. Итог

Этот план нужен, чтобы один человек мог управлять разработкой LMS без потери контроля, даже если большую часть кода пишут AI-агенты. Главная идея: AI делает реализацию, но архитектура, scope, acceptance criteria и merge остаются под контролем владельца проекта.

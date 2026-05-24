# 06. LMS Repository Structure

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать структуру приватного GitHub-репозитория для разработки LMS одним человеком с AI-агентами.  
**Архитектура:** modular monolith first.  
**Deployment:** Railway-first, Docker-portable.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, S3-compatible storage.

---

## 1. Главный принцип репозитория

Репозиторий должен быть понятен одному разработчику и AI-агентам. Поэтому на старте лучше использовать **монорепозиторий**:

```text
один private GitHub repo
единый backlog
единые docs
единый CI
раздельные apps/packages внутри repo
```

Не нужно начинать с нескольких репозиториев или микросервисной структуры.

---

## 2. Рекомендуемая структура верхнего уровня

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
    product/
    architecture/
    api/
    database/
    ai-agents/
    operations/
  scripts/
  .github/
    workflows/
    ISSUE_TEMPLATE/
  .env.example
  .gitignore
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
```

---

## 3. Package manager и workspace

Рекомендуется:

```text
pnpm workspaces + Turborepo
```

Причина:

- удобно для TypeScript monorepo;
- можно разделить web, api, shared packages;
- хорошо понимается AI coding agents;
- можно ускорить build/test;
- удобно масштабировать без микросервисов.

Файл `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 4. `apps/api`

Backend-приложение.

Возможные варианты framework:

1. **NestJS** — хорошо подходит для modular monolith, DI, guards, modules.
2. **Fastify + custom modular structure** — легче и быстрее, но требует дисциплины.

Для данного проекта рекомендуется **NestJS**, потому что:

- модульная архитектура встроена;
- удобно реализовать RBAC;
- удобно разделять domains;
- легче давать задачи AI-агентам;
- хорошо подходит для корпоративного backend.

### 4.1. Структура `apps/api`

```text
apps/api/
  src/
    main.ts
    app.module.ts
    config/
      env.schema.ts
      database.config.ts
      storage.config.ts
    common/
      decorators/
      filters/
      guards/
      interceptors/
      pipes/
      types/
      utils/
    modules/
      auth/
      organizations/
      users/
      roles/
      departments/
      groups/
      courses/
      lessons/
      assignments/
      progress/
      assessments/
      certificates/
      files/
      notifications/
      reports/
      audit/
    database/
      prisma/
        schema.prisma
        migrations/
        seed.ts
      database.module.ts
    storage/
      storage.module.ts
      s3.service.ts
    jobs/
      jobs.module.ts
    health/
      health.controller.ts
  test/
    integration/
    e2e/
  package.json
  tsconfig.json
  Dockerfile
```

---

## 5. Backend module pattern

Каждый модуль должен иметь предсказуемую структуру:

```text
modules/courses/
  courses.module.ts
  courses.controller.ts
  courses.service.ts
  courses.repository.ts
  dto/
    create-course.dto.ts
    update-course.dto.ts
    course-query.dto.ts
  policies/
    courses.policy.ts
  tests/
    courses.service.spec.ts
```

### 5.1. Правило разделения ответственности

```text
controller → принимает HTTP-запросы и вызывает service
service → бизнес-логика
repository → доступ к БД
dto → валидация входных данных
policy/guard → права доступа
```

AI-агент не должен писать бизнес-логику прямо в controller.

---

## 6. `apps/web`

Frontend web-приложение.

Рекомендуемый стек:

```text
React + TypeScript + Vite
```

Возможные UI-решения:

- Tailwind CSS;
- shadcn/ui;
- React Hook Form;
- Zod;
- TanStack Query;
- TanStack Router или React Router.

### 6.1. Структура `apps/web`

```text
apps/web/
  src/
    app/
      router.tsx
      providers.tsx
      layouts/
    features/
      auth/
      dashboard/
      users/
      courses/
      course-builder/
      learner/
      assignments/
      assessments/
      certificates/
      reports/
      settings/
    shared/
      api/
      components/
      hooks/
      lib/
      types/
      utils/
    pages/
    main.tsx
  public/
  package.json
  tsconfig.json
  vite.config.ts
  Dockerfile
```

### 6.2. Frontend feature pattern

```text
features/courses/
  api/
    courses.api.ts
  components/
    CourseCard.tsx
    CourseForm.tsx
  pages/
    CoursesListPage.tsx
    CourseDetailsPage.tsx
    CourseBuilderPage.tsx
  hooks/
    useCourses.ts
  types.ts
```

---

## 7. `apps/mobile`

Мобильное приложение — future scope, но директорию можно оставить как placeholder.

Рекомендуемый будущий стек:

```text
React Native + Expo + TypeScript
```

На старте:

```text
apps/mobile/
  README.md
```

В README указать, что mobile learner-first app не входит в MVP, но API проектируется с учётом будущего mobile.

---

## 8. `packages/shared`

Общие типы, схемы и утилиты.

```text
packages/shared/
  src/
    types/
      auth.ts
      users.ts
      courses.ts
      progress.ts
      assessments.ts
    schemas/
      pagination.schema.ts
      common.schema.ts
    constants/
      roles.ts
      statuses.ts
    utils/
  package.json
  tsconfig.json
```

Назначение:

- общие TypeScript-типы;
- shared constants;
- общие DTO types для frontend/backend;
- enum-значения;
- API response types.

Важно: не превращать `shared` в мусорную папку. Всё, что специфично только для backend, остаётся в `apps/api`.

---

## 9. `packages/ui`

Общие UI-компоненты.

```text
packages/ui/
  src/
    components/
      Button.tsx
      Card.tsx
      Table.tsx
      EmptyState.tsx
      LoadingState.tsx
    forms/
    layout/
    index.ts
  package.json
```

На MVP можно хранить UI внутри `apps/web`, а `packages/ui` выделить позже. Если проект сразу делается monorepo, можно создать пакет, но не усложнять.

---

## 10. `packages/config`

Единые конфиги:

```text
packages/config/
  eslint/
  tsconfig/
  prettier/
```

---

## 11. `infra`

Инфраструктура.

```text
infra/
  docker/
    Dockerfile.api
    Dockerfile.web
    docker-compose.yml
    docker-compose.prod.yml
  railway/
    README.md
    railway-env.example.md
  nginx/
    nginx.conf
```

### 11.1. Docker compose для локальной разработки

Минимально:

```text
api
web
postgres
minio или s3-compatible mock
```

### 11.2. Railway

Railway-first означает:

- backend deploy как service;
- frontend deploy как static/web service;
- PostgreSQL через Railway plugin или external Postgres;
- переменные окружения через Railway env;
- S3-compatible storage через внешний сервис.

Docker-portable означает:

- проект можно поднять вне Railway;
- Dockerfile не должен быть Railway-only;
- env vars документированы;
- миграции запускаются отдельной командой.

---

## 12. `docs`

Документация должна быть частью repo.

```text
docs/
  product/
    01_LMS_Master_Product_Specification.md
    02_LMS_MVP_Roadmap.md
  architecture/
    03_LMS_Architecture_Map.md
    06_LMS_Repository_Structure.md
  database/
    04_LMS_Database_Model_Draft.md
  api/
    05_LMS_API_Contracts_Draft.md
    openapi.yaml
  ai-agents/
    AI_Coding_Agent_Instructions.md
    AI_Agent_Workflow_GitHub_Railway.md
    Context_Management.md
  operations/
    Deployment_Plan_Railway_Docker.md
    Security_Checklist.md
    Testing_Strategy.md
```

Правило: AI-агент перед крупными изменениями должен читать релевантные docs.

---

## 13. `.github`

```text
.github/
  workflows/
    ci.yml
    api-tests.yml
    web-build.yml
  ISSUE_TEMPLATE/
    backend_task.md
    frontend_task.md
    bug_report.md
    devops_task.md
  pull_request_template.md
```

### 13.1. CI минимум

CI должен проверять:

```text
install
lint
typecheck
tests
build
```

Для MVP можно начать с одного workflow:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

---

## 14. Корневые файлы

### 14.1. `README.md`

Должен содержать:

- что это за проект;
- стек;
- как запустить локально;
- как запустить тесты;
- где документация;
- как устроены apps/packages;
- ссылки на главные docs.

### 14.2. `.env.example`

```env
NODE_ENV=development
API_PORT=3000
WEB_PORT=5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lms
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
S3_ENDPOINT=http://localhost:9000
S3_REGION=auto
S3_BUCKET=lms-local
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
FRONTEND_URL=http://localhost:5173
```

### 14.3. `package.json`

```json
{
  "name": "lms-platform",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed"
  }
}
```

---

## 15. Branching strategy

Простой вариант для одного разработчика + AI-агентов:

```text
main — стабильная ветка
dev — интеграционная ветка, если нужна
feature/<issue-number>-short-name — задачи
fix/<issue-number>-short-name — исправления
```

Для MVP можно работать:

```text
feature branch → pull request → CI → merge to main
```

AI-агент не должен пушить напрямую в `main`, если есть возможность работать через PR.

---

## 16. Labels для GitHub Issues

```text
type: backend
type: frontend
type: database
type: devops
type: docs
type: test
type: security
priority: p0
priority: p1
priority: p2
status: ready
status: blocked
scope: mvp
scope: future
agent: gpt
agent: claude
```

---

## 17. Правила для AI-агентов в репозитории

AI-агент должен:

1. Читать `docs/product` и `docs/architecture` перед архитектурными изменениями.
2. Не менять структуру repo без отдельной задачи.
3. Не добавлять новый framework без причины.
4. Не создавать микросервисы.
5. Не смешивать frontend/backend код.
6. Не хранить secrets в repo.
7. Не пушить `.env`.
8. Не добавлять AI-функции в MVP.
9. Не удалять документацию без явного указания.
10. В PR описывать, что изменено, как протестировано и какие риски.

---

## 18. Минимальный порядок создания repo

### Шаг 1. Создать private GitHub repo

```text
lms-platform
```

### Шаг 2. Инициализировать monorepo

```text
pnpm workspace
Turborepo
apps/api
apps/web
packages/shared
```

### Шаг 3. Добавить документацию

```text
docs/product
docs/architecture
docs/database
docs/api
```

### Шаг 4. Поднять backend skeleton

```text
NestJS
health endpoint
env validation
PostgreSQL connection
Prisma/Drizzle
```

### Шаг 5. Поднять frontend skeleton

```text
React + Vite
routing
auth layout
admin layout
learner layout
API client
```

### Шаг 6. Добавить Docker local dev

```text
postgres
api
web
minio optional
```

### Шаг 7. Добавить CI

```text
lint
typecheck
test
build
```

---

## 19. Что не делать на старте

Не нужно:

- создавать отдельные repos для api/web/mobile;
- делать Kubernetes;
- делать микросервисы;
- вводить event sourcing;
- добавлять Kafka/RabbitMQ без явной необходимости;
- строить сложный design system до MVP;
- делать mobile app до web MVP;
- добавлять AI/ML сервисы в MVP;
- реализовывать SCORM/xAPI/LTI до базового learning loop;
- усложнять роли кастомными permission matrix до проверки MVP.

---

## 20. Итоговая рекомендуемая структура MVP repo

```text
lms-platform/
  apps/
    api/
      src/
        modules/
          auth/
          users/
          courses/
          lessons/
          assignments/
          progress/
          assessments/
          certificates/
          files/
          reports/
        database/
        common/
        main.ts
      Dockerfile
    web/
      src/
        features/
          auth/
          dashboard/
          users/
          courses/
          learner/
          reports/
        shared/
        app/
      Dockerfile
    mobile/
      README.md
  packages/
    shared/
    config/
  infra/
    docker/
    railway/
  docs/
  scripts/
  .github/
  .env.example
  README.md
```

---

## 21. Итог

Эта структура репозитория подходит для разработки LMS одним человеком с AI-агентами. Она достаточно простая для MVP, но не тупиковая: позже можно добавить mobile app, integrations, analytics, AI layer и enterprise hardening без полной перестройки проекта.

# 15. LMS Deployment Plan: Railway + Docker

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение документа:** описать план деплоя MVP на Railway и сохранить переносимость через Docker на любой сервер/ОС.  
**Архитектура:** modular monolith first.  
**Стек:** TypeScript backend, React + TypeScript frontend, PostgreSQL, S3-compatible storage.

---

## 1. Цель deployment strategy

Цель — быстро запустить MVP на Railway, но не привязать проект навсегда к Railway.

Главная формула:

```text
Railway-first for speed
Docker-first for portability
PostgreSQL as managed or containerized DB
S3-compatible storage abstraction
env-based configuration
```

---

## 2. Deployment principles

1. **Один private GitHub repository — один источник правды.**
2. **Railway используется как первый production/staging runtime.**
3. **Docker остаётся обязательной переносимой упаковкой.**
4. **Все секреты идут через environment variables.**
5. **Production config не хранится в репозитории.**
6. **Миграции БД выполняются контролируемо.**
7. **Healthcheck обязателен.**
8. **Deploy должен быть воспроизводимым.**

---

## 3. Целевые окружения

### 3.1 Local development

```text
developer machine
Docker Compose for PostgreSQL/S3-compatible local services
apps/api locally
apps/web locally
```

### 3.2 Staging

```text
Railway staging project/environment
separate PostgreSQL
separate storage bucket
staging env vars
automatic deploy from develop/staging branch or manual trigger
```

### 3.3 Production

```text
Railway production project/environment
production PostgreSQL
production storage bucket
production env vars
deploy from main branch after PR review
```

---

## 4. Recommended deployment topology for MVP

### 4.1 Railway services

```text
Service 1: api
Service 2: web
Service 3: PostgreSQL
External/Service 4: S3-compatible storage provider
```

Вариант для старта:

```text
apps/api  → Railway Node service
apps/web  → Railway static/frontend service or Node build service
PostgreSQL → Railway PostgreSQL
Storage → Cloudflare R2 / MinIO-compatible / AWS S3-compatible provider
```

### 4.2 Альтернативный вариант

Если frontend собирается как static app:

```text
web build → static hosting
api → Railway
```

Но для простоты MVP можно держать web и api в одном Railway project.

---

## 5. Repository structure dependency

Deployment должен соответствовать структуре:

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

---

## 6. Environment variables

### 6.1 Shared variables

```text
NODE_ENV=production
APP_ENV=production
APP_BASE_URL=https://example.com
API_BASE_URL=https://api.example.com
LOG_LEVEL=info
```

### 6.2 API variables

```text
PORT=3000
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
CORS_ORIGINS=https://example.com
```

### 6.3 Storage variables

```text
S3_ENDPOINT=...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true/false
FILE_MAX_SIZE_MB=100
```

### 6.4 Email variables

```text
EMAIL_PROVIDER=...
EMAIL_FROM=...
EMAIL_PROVIDER_API_KEY=...
```

### 6.5 Frontend variables

```text
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_APP_NAME=LMS
```

---

## 7. `.env.example` policy

В репозитории должен быть `.env.example`, но не `.env`.

Пример:

```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/lms_dev
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=lms-local
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio-password
VITE_API_BASE_URL=http://localhost:3000/api/v1
```

Правило: реальные значения не коммитить.

---

## 8. Local Docker Compose

### 8.1 Назначение

Local Docker Compose нужен для разработки и проверки переносимости.

Минимальные сервисы:

```text
postgres
minio or compatible local object storage
api optional
web optional
```

### 8.2 Пример структуры

```text
infra/docker/docker-compose.dev.yml
infra/docker/Dockerfile.api
infra/docker/Dockerfile.web
infra/docker/minio-init/
```

### 8.3 Что должно работать локально

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
pnpm install
pnpm db:migrate
pnpm dev
```

---

## 9. Production Docker portability

### 9.1 Требования

- API должен иметь production Dockerfile.
- Web должен иметь production Dockerfile или static build instructions.
- Docker image не содержит секреты.
- Runtime конфиг идёт через env.
- Healthcheck работает внутри container.
- Migrations можно запускать отдельной командой.

### 9.2 Portable deployment target

Проект должен быть переносим на:

```text
VPS with Docker Compose
self-hosted server
cloud VM
Linux server
Windows server with Docker support
macOS development machine
```

---

## 10. Railway deployment flow

### 10.1 Первый деплой staging

1. Создать Railway project.
2. Подключить private GitHub repository.
3. Создать PostgreSQL service.
4. Создать API service из `apps/api`.
5. Создать Web service из `apps/web`.
6. Настроить env variables.
7. Запустить migrations.
8. Проверить healthcheck.
9. Проверить login.
10. Проверить core learning loop.

### 10.2 Production deploy

1. Merge PR в `main`.
2. CI проходит.
3. Railway deploy запускается.
4. Миграции выполняются контролируемо.
5. Smoke tests проходят.
6. Engineering audit log обновляется.

---

## 11. Build commands

### 11.1 Monorepo root

```bash
pnpm install --frozen-lockfile
pnpm build
```

### 11.2 API

```bash
pnpm --filter api build
pnpm --filter api start
```

### 11.3 Web

```bash
pnpm --filter web build
pnpm --filter web preview
```

Финальные команды зависят от выбранного backend framework и frontend bundler, но должны быть зафиксированы в `README.md` и Railway settings.

---

## 12. Database migrations

### 12.1 Правила

- [ ] Миграции создаются в репозитории.
- [ ] Миграции проходят на local и staging до production.
- [ ] Production migration не запускается вручную без понимания изменений.
- [ ] Перед рискованной migration нужен backup.
- [ ] Seed scripts отделены от migrations.

### 12.2 Migration flow

```text
create migration locally
run test database migration
commit migration
CI runs migration on test DB if configured
deploy to staging
verify staging
deploy to production
```

### 12.3 Seed policy

Seed может создавать:

```text
dev organization
dev users
dev course
dev assignments
```

Seed не должен создавать production admin с известным публичным паролем.

---

## 13. Healthcheck

### 13.1 API endpoint

```text
GET /health
```

Минимальный ответ:

```json
{
  "status": "ok",
  "service": "lms-api",
  "version": "0.1.0"
}
```

### 13.2 Readiness endpoint

```text
GET /ready
```

Проверяет:

```text
database connection
required env variables
optional storage connection
```

Не раскрывать секреты или внутренние connection strings.

---

## 14. Logging in production

### 14.1 Требования

- structured logs preferred;
- request id для API-запросов;
- error logs без секретов;
- auth failures без паролей;
- migration logs;
- deploy logs;
- storage failure logs.

### 14.2 Запрещено логировать

```text
password
access token
refresh token
S3 secret
DATABASE_URL
private file URL
full request body with sensitive data
```

---

## 15. Backup strategy

### 15.1 PostgreSQL

До пилота нужно определить:

- provider backup capabilities;
- manual backup command/process;
- restore process;
- retention period;
- кто отвечает за restore.

### 15.2 Storage

Для S3-compatible storage:

- bucket versioning, если доступно;
- lifecycle policy;
- backup/replication future scope;
- запрет public bucket по умолчанию.

### 15.3 Minimum backup policy for MVP

```text
daily database backup
manual backup before risky migration
storage bucket private
restore test before commercial launch
```

---

## 16. Rollback strategy

### 16.1 Application rollback

- предыдущий deploy должен быть доступен для отката;
- релиз должен иметь Git tag или commit SHA;
- breaking migrations не делать без отдельного плана;
- feature flags можно добавить позже, но MVP не должен зависеть от них.

### 16.2 Database rollback

Для MVP:

```text
avoid destructive migrations
prefer additive migrations
backup before risky changes
manual restore plan documented
```

---

## 17. Domain & HTTPS

До пилота:

- [ ] настроить custom domain;
- [ ] HTTPS включен;
- [ ] API domain определён;
- [ ] frontend env указывает на production API;
- [ ] CORS настроен только на разрешённые origins;
- [ ] cookies/tokens настроены с secure policy, если применимо.

---

## 18. CORS policy

Для production:

```text
allow only production frontend domain
allow staging frontend only in staging
no wildcard origin with credentials
```

---

## 19. File storage deployment

### 19.1 Requirements

- [ ] Bucket private.
- [ ] Access keys stored in Railway secrets.
- [ ] Upload limit configured.
- [ ] Pre-signed URLs have TTL.
- [ ] Object keys are not predictable.
- [ ] Metadata stored in PostgreSQL.

### 19.2 Local dev

Использовать MinIO или совместимый локальный storage.

---

## 20. GitHub Actions minimum

### 20.1 PR workflow

```text
checkout
setup pnpm/node
install dependencies
typecheck
lint
test
build
```

### 20.2 Deployment workflow

На старте можно использовать Railway GitHub integration. GitHub Actions для деплоя можно добавить позже, если нужно больше контроля.

---

## 21. Release checklist

Перед release:

- [ ] все PR checks зелёные;
- [ ] migrations проверены на staging;
- [ ] security checklist P0/P1 выполнен;
- [ ] smoke tests пройдены;
- [ ] env variables проверены;
- [ ] backup сделан, если есть migration;
- [ ] release notes подготовлены;
- [ ] engineering audit log обновлён.

---

## 22. MVP deployment milestones

| Milestone | Результат |
|---|---|
| D0 | Local Docker Compose запускает PostgreSQL и storage |
| D1 | API запускается локально и проходит healthcheck |
| D2 | Web запускается локально и подключается к API |
| D3 | Railway staging поднят |
| D4 | Migrations работают на staging |
| D5 | Core learning loop работает на staging |
| D6 | Production окружение поднято |
| D7 | Pilot release готов |

---

## 23. AI Agent Deployment Rules

AI coding agent не должен:

- добавлять реальные секреты в код;
- менять production env без задачи;
- отключать healthcheck;
- добавлять public bucket policy;
- запускать destructive migration без отдельного плана;
- менять deployment target без решения владельца;
- удалять Docker portability ради Railway-only решения.

AI coding agent обязан:

- обновить deployment docs при изменении build/start commands;
- обновить `.env.example` при добавлении env variable;
- указать migration impact в PR;
- указать deployment impact в PR;
- проверить local build до PR.

---

## 24. Portable deployment via Docker Compose

Для переноса с Railway на VPS должен существовать документ/команда:

```bash
docker compose -f infra/docker/docker-compose.prod.yml up -d
```

Минимальные сервисы:

```text
api
web
postgres
optional minio
reverse proxy future scope
```

Production Docker Compose может быть подготовлен после MVP, но структура проекта не должна блокировать такой перенос.

---

## 25. Production readiness gate

MVP можно считать готовым к первому пилоту, если:

```text
staging работает
production deploy работает
healthcheck работает
migrations работают
core learning loop работает
secrets вынесены в env
bucket private
backup process описан
audit log включён
security P0/P1 закрыты
smoke tests проходят
```

---

## 26. Что не делать в MVP deployment

Не нужно добавлять:

- Kubernetes;
- microservices deployment;
- service mesh;
- complex observability stack;
- multi-region deployment;
- auto-scaling complexity;
- separate analytics cluster;
- Julia/AI service;
- enterprise SSO infra.

Это future scope после подтверждения core product value.


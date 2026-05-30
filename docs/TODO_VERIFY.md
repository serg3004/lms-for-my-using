# TODO_VERIFY.md

**Проект:** корпоративная LMS / Learning Operating System  
**Назначение:** список решений, которые нужно подтвердить перед кодом или перед конкретной реализацией.  
**Правило:** AI coding agent не должен принимать скрытые решения по пунктам со статусом `TODO VERIFY`.

---

## 1. Статусы

```text
TODO VERIFY — требуется решение владельца проекта
PROPOSED — есть рекомендуемое решение, но оно ещё не утверждено
ACCEPTED — решение принято
OUT OF MVP — не реализовывать в MVP
DEFERRED — перенесено на P1/P2/Future
DONE — реализовано и подтверждено в коде/тестах
```

---

## 2. Критические решения перед стартом кода

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-001 | Backend framework | NestJS | PROPOSED | Лучше для modular monolith, DI, guards, RBAC, AI-agent readability. |
| TV-002 | ORM / migration tool | Prisma | PROPOSED | Быстрый старт, понятные миграции, хорошо для TypeScript. |
| TV-003 | Frontend setup | React + Vite + TypeScript | PROPOSED | Проще Next.js для MVP без SSR. |
| TV-004 | UI library | shadcn/ui + Tailwind или простой custom UI | TODO VERIFY | Нужно выбрать до активной frontend-разработки. |
| TV-005 | Auth strategy | JWT access token now; refresh token/httpOnly cookie later | PROPOSED | MVP использует stateless JWT access token. Refresh/session store deferred. |
| TV-006 | Password hashing | Argon2id или bcrypt | PROPOSED | Выбрать библиотеку перед auth implementation. |
| TV-007 | Local object storage | MinIO | PROPOSED | S3-compatible, удобно для local dev. |
| TV-008 | Production object storage | Cloudflare R2 / AWS S3 / Wasabi | TODO VERIFY | Зависит от бюджета и региона. |
| TV-009 | Deployment target | Railway-first | ACCEPTED | Production/staging через Railway, Docker portability обязательно. |
| TV-010 | Package manager | pnpm workspaces | PROPOSED | Удобно для monorepo. |

---

## 3. Product / MVP scope decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-011 | Делать ли AI в MVP? | Нет | OUT OF MVP | AI Tutor, RAG, AI Course Builder — future scope. |
| TV-012 | Делать ли native mobile в MVP? | Нет | OUT OF MVP | MVP — responsive web. Mobile app позже. |
| TV-013 | Делать ли SCORM/xAPI/LTI в MVP? | Нет | OUT OF MVP | Только readiness, без runtime. |
| TV-014 | Делать ли SSO/SAML в MVP? | Нет | OUT OF MVP | Email/password достаточно для MVP. |
| TV-015 | Делать ли billing в MVP? | Нет | OUT OF MVP | Commercial readiness позже. |
| TV-016 | Делать ли advanced BI в MVP? | Нет | OUT OF MVP | Только базовые reports. |
| TV-017 | Делать ли drag-and-drop course builder? | Нет | OUT OF MVP | Начать с простого course editor. |
| TV-018 | Делать ли custom roles builder? | Нет | OUT OF MVP | Fixed roles в MVP. |

---

## 4. Database decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-019 | Использовать `organization_id` или `tenant_id`? | `organization_id` | PROPOSED | Более понятно для LMS/B2B. |
| TV-020 | Делать ли отдельную таблицу departments? | Нет в MVP | PROPOSED | Использовать groups + type, departments можно P1. |
| TV-021 | Хранить lesson content в JSONB или blocks table? | JSONB для MVP | PROPOSED | Быстрые старт. Blocks table можно позже. |
| TV-022 | Soft delete для каких сущностей? | Users, courses, lessons, groups, files | TODO VERIFY | Progress, attempts, certificates лучше immutable/append-only. |
| TV-023 | Нужен ли RLS в PostgreSQL в MVP? | Не обязательно | PROPOSED | Backend organization scope обязателен. RLS можно позже. |
| TV-024 | Хранить audit logs append-only? | Да | PROPOSED | Audit log нельзя редактировать обычными CRUD-операциями. |

---

## 5. API decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-025 | API base path | `/api/v1` | ACCEPTED | REST/JSON. |
| TV-026 | Pagination | page/pageSize | PROPOSED | default 20, max 100. |
| TV-027 | Error format | `{ error: { code, message, details, requestId } }` | PROPOSED | Удобно для frontend и debugging. |
| TV-028 | DTO validation | Zod | DONE | Runtime validation uses Zod schemas in auth/API areas touched so far. |
| TV-029 | OpenAPI generation | После стабилизации первых endpoints | DEFERRED | Не блокирует MVP foundation. |

---

## 6. Auth / Security decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-030 | Нужен ли invite flow в MVP? | P1 или простой admin-created user | PROPOSED | Для MVP можно seed admin + admin creates users. |
| TV-031 | Нужен ли password reset в MVP? | P1 | PROPOSED | Endpoints есть, но flow сейчас disabled/unavailable skeleton. |
| TV-032 | Login rate limiting | Да | PROPOSED | Минимальная защита auth endpoint. |
| TV-033 | Refresh token storage | httpOnly cookie | PROPOSED | Не хранить refresh token в localStorage. |
| TV-034 | Access token storage | memory или short-lived localStorage fallback | DONE | Current implementation uses stateless JWT access token. JWT verification, negative tests, current-user lookup by `sub`, bearer parsing tests, and logout validation are covered by PR 39–42. |
| TV-035 | File access | Signed URLs after backend permission check | ACCEPTED | Никаких постоянных публичных URL. |
| TV-036 | Antivirus scan for uploads | P1/P2 | DEFERRED | Для MVP можно allowlist + size limit. |

---

## 7. Certificates decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-037 | Формат сертификата в MVP | HTML certificate page | PROPOSED | Быстрее, чем PDF. |
| TV-038 | PDF download | P1 | DEFERRED | Добавить после работающего learning loop. |
| TV-039 | Certificate verification public URL | P1/P2 | DEFERRED | Не блокирует MVP. |
| TV-040 | Manual certificate issuance by admin | P1 | DEFERRED | В MVP выдавать автоматически по правилам. |
| TV-041 | Certificate revocation | P1/P2 | DEFERRED | Не блокирует MVP. |

---

## 8. Reports decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-042 | MVP reports | course progress, group/user progress, certificates | PROPOSED | Минимально достаточно. |
| TV-043 | CSV export | P1 | DEFERRED | Добавить после basic reports. |
| TV-044 | XLSX export | P1/P2 | DEFERRED | Не блокирует MVP. |
| TV-045 | Advanced filters | P1 | DEFERRED | Сначала простые фильтры. |
| TV-046 | BI/analytics service | Future | OUT OF MVP | Не добавлять ClickHouse в MVP. |

---

## 9. Notifications decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-047 | MVP notification channel | In-app | PROPOSED | Email можно P1. |
| TV-048 | Email provider | TODO VERIFY | TODO VERIFY | Resend/Postmark/SendGrid/etc. выбрать позже. |
| TV-049 | Push notifications | Future | OUT OF MVP | После mobile/PWA. |
| TV-050 | Reminder scheduler | P1 | DEFERRED | Для MVP достаточно assignment/certificate events. |

---

## 10. Deployment decisions

| ID | Вопрос | Рекомендуемое решение | Статус | Комментарий |
|---|---|---|---|---|
| TV-051 | Staging нужен сразу? | Да, если Railway budget позволяет | PROPOSED | Иначе local + production позже. |
| TV-052 | Web hosting | Railway service или static hosting | TODO VERIFY | Зависит от выбранной схемы. |
| TV-053 | DB migrations in deploy | Manual controlled command first | PROPOSED | Не запускать risky migrations автоматически без контроля. |
| TV-054 | Backups | Railway/DB provider backups + documented restore | TODO VERIFY | До пилота обязательно. |
| TV-055 | Observability | logs + healthcheck in MVP | PROPOSED | Sentry/OpenTelemetry позже. |

---

## 11. Decisions accepted for now

После утверждения владельцем проекта перенести сюда принятые решения:

```text
ACCEPTED:
- Architecture: modular monolith first
- Backend: NestJS + TypeScript
- Frontend: React + Vite + TypeScript
- DB: PostgreSQL
- ORM: Prisma
- Storage local: MinIO
- Deployment: Railway-first
- Portability: Docker
- MVP AI: out of scope
- Mobile app: out of MVP
- Auth current state: stateless JWT access token with hardened verification and current-user lookup bound to JWT subject
```

---

## 12. Как использовать этот файл

Перед началом каждого GitHub Issue AI coding agent должен проверить:

```text
1. Есть ли связанный TODO VERIFY?
2. Принято ли решение?
3. Не относится ли задача к OUT OF MVP?
4. Не требуется ли обновить этот файл после решения владельца проекта?
```

Если решение не принято, агент должен остановиться и написать:

```text
TODO VERIFY: требуется решение владельца проекта по [ID].
```

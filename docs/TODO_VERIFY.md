# TODO_VERIFY — decision / implementation / live verification registry

> **Статус:** `CURRENT`
>
> Этот файл хранит только вопросы, для которых полезно различать **решение**, **реализацию** и **live verification**. Он не должен быть свалкой уже известных repository facts.
>
> **Проверено по `main`:** `83fdf34f5384e2d8e044590256d05149f4c39a6d` (2026-08-09).

## 1. Статусы

### Decision status

- `ACCEPTED` — нормативное решение принято.
- `OUT-OF-MVP` — сознательно не входит в MVP.
- `DEFERRED` — отложено на post-MVP/P1/P2.
- `OWNER-DECISION` — требуется явное решение владельца; ИИ-агент `MUST NOT GUESS`.

### Implementation status

- `DONE` — current repository подтверждает реализацию решения.
- `PARTIAL` — реализована только часть.
- `NOT-IMPLEMENTED` — capability отсутствует.
- `SKELETON` — API/UI contract существует, но намеренно unavailable/не завершён.
- `NOT-REQUIRED` — реализация не требуется для принятого решения.

### Live verification status

- `NOT-REQUIRED` — repository evidence достаточно.
- `LIVE-VERIFY` — требуется external/provider/deployment evidence.

**Правило для ИИ:** если ответ подтверждён current code/config, пункт не должен оставаться `TODO VERIFY`. Если утверждение зависит от Railway/provider/runtime state, repository code не может закрыть `LIVE-VERIFY`.

---

## 2. Architecture / platform decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-001 | Backend framework: NestJS | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current API — NestJS/TypeScript. |
| TV-002 | ORM/migrations: Prisma | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Prisma schema/migrations используются current API. |
| TV-003 | Frontend: React + Vite + TypeScript | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current `apps/web`. |
| TV-004 | UI library: Custom UI | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Custom CSS/UI primitives; Tailwind/shadcn не базовый стек. |
| TV-005 | Auth: access + refresh/session lifecycle | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Refresh/session rotation/revocation уже current implementation. |
| TV-006 | Password hashing: current `scrypt` | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Старое bcrypt/Argon2 предложение superseded current code. |
| TV-007 | Local object storage: MinIO | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Local S3-compatible development option. |
| TV-008 | Production object storage | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Canonical decision — S3-compatible contract. Конкретный provider (MinIO/R2/AWS S3) требует fresh evidence. |
| TV-009 | Deployment target: Railway-first + Docker portability | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Repository config подтверждён; live topology — external state. |
| TV-010 | Package manager: pnpm workspaces | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Root `pnpm@9.15.0`; Turbo orchestration. |

---

## 3. Product / MVP scope decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-011 | AI in MVP | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | AI tutor/RAG/course builder — future scope. |
| TV-012 | Native mobile in MVP | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | MVP — responsive Web. |
| TV-013 | SCORM/xAPI/LTI runtime | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Readiness/future only. |
| TV-014 | SSO/SAML | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Email/password sufficient for MVP. |
| TV-015 | Billing | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Post-MVP commercial scope. |
| TV-016 | Advanced BI | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Basic reports only. |
| TV-017 | Drag-and-drop course builder | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Current course editor remains sufficient. |
| TV-018 | Custom roles builder | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Fixed roles remain canonical. |

---

## 4. Database/domain decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-019 | Tenant key: `organizationId` | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Organization scoping — current tenant model. |
| TV-020 | Separate departments table in MVP | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Current groups/team model используется вместо отдельного departments domain. |
| TV-021 | Lesson content storage model | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current schema/lesson implementation является authority; не проектировать blocks table без новой задачи. |
| TV-022 | Soft-delete policy | `ACCEPTED` | `PARTIAL` | `NOT-REQUIRED` | Policy domain-specific, не универсальна. Current soft-deleted slug entities освобождают unique slug через tombstone suffix. |
| TV-023 | PostgreSQL RLS required for MVP | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Backend organization scope является current boundary; RLS можно рассматривать post-MVP. |
| TV-024 | General append-only Audit Log | `OWNER-DECISION` | `PARTIAL` | `NOT-REQUIRED` | Есть domain-specific audit/security events, но общего audit module нет. Решить `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`. |

---

## 5. API decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-025 | API base path `/api/v1` | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current global prefix. |
| TV-026 | Pagination `page/pageSize` | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Defaults 1/20, maximum 200. |
| TV-027 | Canonical API error envelope | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current envelope существует; proposed `requestId` не является current field. |
| TV-028 | Runtime validation: Zod | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Current schemas/validation. |
| TV-029 | OpenAPI | `ACCEPTED` | `PARTIAL` | `NOT-REQUIRED` | OpenAPI module/document/tests существуют; manual document не покрывает весь runtime surface и может дрейфовать. |

---

## 6. Auth / security decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-030 | Invite flow | `OWNER-DECISION` | `PARTIAL` | `NOT-REQUIRED` | Admin-created user flow существует; полноценный invite lifecycle требует product decision. |
| TV-031 | Password reset delivery | `DEFERRED` | `SKELETON` | `LIVE-VERIFY` | Request/confirm endpoints есть, но service намеренно возвращает 503; email delivery/provider не настроены canonical образом. |
| TV-032 | Login/sensitive-route rate limiting | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Redis/local fallback code реализован; live Redis state требует verification. |
| TV-033 | Refresh token storage | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | HttpOnly refresh cookie + server-side session/hash/rotation. |
| TV-034 | Access token current contract | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Использовать current auth controller/session docs; не возвращаться к старому localStorage proposal без отдельной redesign задачи. |
| TV-035 | File access via authorized signed URLs | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Code contract реализован; live provider/bucket/CORS отдельно. |
| TV-036 | Malware/antivirus scan | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Quarantine, dispatch, callback, fail-closed реализованы; live scanner availability отдельно. |

---

## 7. Certificates decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-037 | HTML certificate page | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | Learner certificate UI/API существует. |
| TV-038 | PDF download | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Не является MVP gate. |
| TV-039 | Public certificate verification URL | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Post-MVP unless scope changes. |
| TV-040 | Manual certificate issuance | `ACCEPTED` | `DONE` | `NOT-REQUIRED` | `POST /certificates` существует с guards/scope. |
| TV-041 | Certificate revocation workflow | `DEFERRED` | `PARTIAL` | `NOT-REQUIRED` | Data model имеет status/revokedAt, но current controller не содержит отдельного revoke endpoint. |

---

## 8. Reports decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-042 | Basic MVP reports | `ACCEPTED` | `PARTIAL` | `NOT-REQUIRED` | Progress/certificate/assessment reporting surfaces существуют частично; advanced reporting не подразумевается. |
| TV-043 | CSV export | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Post-MVP unless explicitly requested. |
| TV-044 | XLSX export | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Не MVP gate. |
| TV-045 | Advanced report filters | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Сначала basic reporting. |
| TV-046 | Separate BI/analytics service | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Не добавлять ClickHouse/BI layer в MVP. |

---

## 9. Notifications decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-047 | MVP Notifications / in-app channel | `OWNER-DECISION` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Current module inventory не содержит Notifications. Выбрать `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`. |
| TV-048 | Email provider | `OWNER-DECISION` | `NOT-IMPLEMENTED` | `LIVE-VERIFY` | Не выбирать Resend/Postmark/SendGrid/SES/SMTP автономно. |
| TV-049 | Push notifications | `OUT-OF-MVP` | `NOT-REQUIRED` | `NOT-REQUIRED` | Future mobile/PWA scope. |
| TV-050 | Reminder scheduler | `DEFERRED` | `NOT-IMPLEMENTED` | `NOT-REQUIRED` | Post-MVP/P1 unless owner changes priority. |

---

## 10. Deployment / operations decisions

| ID | Решение | Decision | Implementation | Live | Комментарий |
|---|---|---|---|---|---|
| TV-051 | Separate Railway staging | `ACCEPTED` | `NOT-REQUIRED` | `LIVE-VERIFY` | Current repository policy: отдельного Railway staging нет. Создание staging — отдельная owner/ops задача. |
| TV-052 | Web hosting target | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | Railway Web/Docker config присутствует; live service availability отдельно. |
| TV-053 | DB migrations on deploy | `ACCEPTED` | `DONE` | `LIVE-VERIFY` | API Railway start выполняет `prisma migrate deploy` автоматически. Live migration outcome требует deployment evidence. |
| TV-054 | Backups/PITR/restore policy | `OWNER-DECISION` | `PARTIAL` | `LIVE-VERIFY` | Repository policy требует reconciliation; live backup/PITR/restore readiness не доказаны code. |
| TV-055 | Observability | `ACCEPTED` | `PARTIAL` | `LIVE-VERIFY` | Pino logging и optional Sentry hooks присутствуют; live Sentry/alert routing не подтверждены. |

---

## 11. Реально открытые owner decisions

На момент проверки ИИ-агент должен эскалировать владельцу только вопросы, меняющие бизнес/production outcome:

1. **TV-024 — General Audit Log:** `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.
2. **TV-030 — Invite flow:** нужен ли полноценный invite lifecycle и когда.
3. **TV-047 — Notifications:** `REQUIRED_FOR_MVP` / `POST_MVP` / `REMOVED_FROM_MVP`.
4. **TV-048 — Email provider:** provider и delivery requirements.
5. **TV-054 — Backups/PITR:** обязательная policy и acceptance evidence.

Staging topology или production provider также требуют owner/ops задачи, если требуется изменить current documented architecture; их live state нельзя угадывать.

---

## 12. Правила для ИИ-агента

1. `MUST` сначала проверять current repository, а не копировать старый статус этого реестра.
2. `MUST NOT` возвращать `DONE` пункт в `PROPOSED` без подтверждённого regression/change.
3. `MUST NOT` закрывать `LIVE-VERIFY` чтением env examples или historical smoke report.
4. `MUST NOT` принимать `OWNER-DECISION` самостоятельно.
5. При реализации/изменении TV item `MUST` обновить его Decision/Implementation/Live statuses в той же задаче.
6. Если item больше не требует решения или verification, он может оставаться в registry как исторически стабильный decision, но не должен формулироваться как «нужно проверить».
7. Product scope сверять с `docs/MVP_SCOPE_LOCK.md`; общие implementation/source rules — с `docs/PROJECT_SOURCE_OF_TRUTH.md`.

---

## Связанные документы

- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/MVP_SCOPE_LOCK.md`
- `docs/DOCUMENTATION_AUDIT.md` — evidence аудита, не current decision authority.

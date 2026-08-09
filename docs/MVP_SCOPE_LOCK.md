# MVP Scope Lock

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать границы MVP так, чтобы человек и ИИ-агент одинаково понимали, что входит в scope, что уже реализовано, что отложено и где требуется решение владельца.
>
> **Проверено по `main`:** `83fdf34f5384e2d8e044590256d05149f4c39a6d` (2026-08-09).

## 1. Система статусов

- `IN-MVP` — нормативно входит в MVP.
- `OUT-OF-MVP` — нормативно не входит в MVP.
- `IMPLEMENTED` — подтверждено current repository.
- `PARTIAL` — реализована только часть требуемого поведения.
- `OWNER-DECISION` — scope нельзя менять без решения владельца.
- `LIVE-VERIFY` — зависит от внешней инфраструктуры и не подтверждается только repository code/config.
- `HISTORICAL` — старое решение/описание; не использовать как current scope.

ИИ-агент `MUST NOT` интерпретировать `IMPLEMENTED` как автоматическое изменение product scope: наличие кода и решение «входит в MVP» — разные вещи.

---

## 2. Что входит в MVP

### Core product

**Scope:** `IN-MVP`

- Organizations / tenant boundary.
- Users and fixed roles: `admin`, `manager`, `instructor`, `learner`.
- Groups/team management.
- Courses and lessons.
- Course materials/uploads.
- Learner progress.
- Assessments and attempts.
- Assignments/submissions.
- Certificates.
- Core admin/manager/instructor/learner Web workflows.
- Authentication/session lifecycle and RBAC.
- Basic operational readiness/security necessary to run the MVP.

### Current implementation note

**Статус:** `IMPLEMENTED` / `PARTIAL`

Большая часть core surface присутствует в current API/Web. Наличие конкретного module/route не означает, что каждый UX edge case или operational requirement закрыт; такие gaps должны жить в backlog/issue, а не молча менять scope.

### Self-enrollment

**Статус:** `IMPLEMENTED`

Self-enrollment behavior существует в current implementation. Это больше не следует описывать как запрещённое исключение из MVP только потому, что ранний scope snapshot его не включал.

Если владелец хочет запретить self-enrollment как product capability, это отдельное изменение scope/behavior.

---

## 3. Явно вне MVP

Следующее остаётся `OUT-OF-MVP`, пока отдельная задача не меняет scope:

- AI tutor / RAG / AI course builder;
- native mobile application;
- SCORM/xAPI/LTI runtime support;
- SSO/SAML;
- billing/payments;
- advanced BI/analytics platform;
- drag-and-drop visual course builder;
- custom role builder;
- push notifications;
- XLSX/advanced analytics exports как обязательный MVP gate;
- отдельный enterprise data warehouse/ClickHouse layer.

ИИ-агент `MUST NOT` добавлять эти capabilities «для полноты» при выполнении обычных MVP задач.

---

## 4. Scope decisions, которые ещё не закрыты

### Notifications

**Scope status:** `OWNER-DECISION`
**Implementation status:** `NOT-IMPLEMENTED`

Некоторые historical/planning docs относили Notifications к MVP, но current API module inventory не содержит notifications module.

Владелец должен выбрать ровно один вариант:

- `REQUIRED_FOR_MVP`;
- `POST_MVP`;
- `REMOVED_FROM_MVP`.

До решения:

- ИИ-агент `MUST NOT` считать Notifications обязательным завершённым MVP gate;
- ИИ-агент `MUST NOT` самостоятельно удалять Notifications из scope;
- ИИ-агент `MUST NOT` начинать реализацию Notifications без отдельной задачи/решения.

### General Audit Log

**Scope status:** `OWNER-DECISION`
**Implementation status:** `PARTIAL`

В repository есть domain-specific audit/security events, но универсальный append-only Audit Log как отдельная application capability не подтверждён.

Владелец должен выбрать:

- `REQUIRED_FOR_MVP`;
- `POST_MVP`;
- `REMOVED_FROM_MVP`.

До решения общий Audit Log не считать ни выполненным, ни автоматически исключённым.

---

## 5. Storage scope

### Storage contract

**Scope status:** `IN-MVP`
**Implementation status:** `IMPLEMENTED`

Для file/material workflows используется S3-compatible contract с private objects, authorized downloads, buffered/multipart upload и security/quarantine flow.

### Production provider

**Статус:** `LIVE-VERIFY`

MVP scope фиксирует **S3-compatible storage capability**, а не конкретного vendor/provider.

Repository не является доказательством, что production в данный момент использует MinIO, Cloudflare R2 или AWS S3.

**Agent rule:** `DO NOT ASSUME` provider без fresh deployment evidence.

Historical формулировка «Production storage = MinIO on Railway» больше не является canonical scope statement.

---

## 6. Deployment/environment boundary

### Deployment target

**Статус:** `IMPLEMENTED` для repository config, `LIVE-VERIFY` для фактического deployment.

Repository ориентирован на Railway-first + Docker portability.

Это не означает, что каждое live service/environment состояние подтверждено кодом.

### Staging

**Статус:** current documented model — `NO-SEPARATE-RAILWAY-STAGING`; future topology — `OWNER-DECISION`.

`docs/MIGRATION_BACKUP_POLICY.md` фиксирует текущую repository policy без отдельного Railway staging environment.

GitHub Actions environment с названием `staging` сам по себе не доказывает существование отдельного Railway staging environment.

ИИ-агент `MUST NOT` создавать/предполагать отдельный staging environment без отдельной owner/ops задачи.

### Backups / PITR / live provider state

**Статус:** `LIVE-VERIFY`

Backup policy может быть описана в repository, но фактическое наличие backup/PITR/restore readiness требует fresh external evidence.

---

## 7. Repository visibility

**Статус:** `CURRENT-FACT`

GitHub repository на момент проверки публичный.

Visibility не является MVP product feature. Старые scope statements «repo must be private» не являются canonical MVP requirement без отдельного owner decision/repository-setting task.

---

## 8. Auth/security boundary MVP

**Scope:** `IN-MVP`
**Implementation status:** `IMPLEMENTED` / `PARTIAL` по конкретным controls.

В MVP входят:

- authenticated sessions/access tokens;
- refresh rotation/session revocation;
- organization scoping;
- role-based authorization;
- sensitive-route rate limiting;
- basic security/readiness CI/runtime controls.

Не следует объявлять security control «blocking merge gate», если repository settings не делают соответствующий check required. Current `main` на момент проверки не защищён required status checks.

---

## 9. Certificates/reports boundary

### Certificates

**Scope:** `IN-MVP`

Current implementation поддерживает certificate listing/detail/issuance и learner certificate UI. PDF download/public verification URL не являются обязательным MVP gate, пока scope явно не изменён.

### Reports

**Scope:** `IN-MVP` только для basic reports, необходимых core workflows.

CSV/XLSX/advanced BI/analytics не являются обязательным MVP gate.

---

## 10. Что НЕ является доказательством scope completion

Следующие вещи сами по себе не доказывают, что MVP полностью готов:

- наличие route/module;
- зелёный CI без required branch protection;
- старый smoke report;
- historical `DONE` в project log;
- наличие env example;
- наличие script без доказательства scheduled/live execution;
- старый Railway URL;
- current code без проверки live external dependency.

Для operational completion нужен fresh evidence соответствующего уровня.

---

## 11. Правила изменения scope

1. ИИ-агент `MUST` считать этот файл canonical для MVP boundaries.
2. ИИ-агент `MUST NOT` менять `IN-MVP`/`OUT-OF-MVP`/`OWNER-DECISION` из соображений удобства реализации.
3. Если current code реализовал capability, отсутствующую в старом scope snapshot, это `IMPLEMENTATION FACT`, а не автоматический повод удалить код или объявить capability обязательным MVP feature.
4. `OWNER-DECISION` может быть закрыт только явным решением владельца.
5. `LIVE-VERIFY` не закрывается чтением repository code.
6. При принятии owner decision нужно в одной задаче обновить этот файл и соответствующий пункт `TODO_VERIFY.md`.
7. Historical документы не переопределяют этот scope lock.

---

## 12. MVP completion gate

MVP scope считается согласованным только когда:

- core `IN-MVP` capabilities имеют подтверждённый acceptance status;
- открытые `OWNER-DECISION`, которые являются release blockers, явно закрыты;
- live-dependent release checks имеют fresh evidence либо explicit accepted waiver;
- current canonical docs не противоречат друг другу.

На момент этой проверки Notifications и General Audit Log остаются `OWNER-DECISION`, поэтому ИИ-агент не должен самостоятельно объявлять их ни обязательными реализованными gates, ни удалёнными из MVP.

---

## Связанные canonical документы

- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/TODO_VERIFY.md`
- `docs/DOCUMENTATION_AUDIT.md` — audit evidence, не current scope authority.

# Pilot Checklist

> **Статус:** `CURRENT PROCEDURE`
>
> **Назначение:** процедура принятия решения GO/NO-GO для конкретного controlled pilot. Этот файл не является вечным утверждением, что pilot уже готов.
>
> **Проверено по `main`:** `35e0a7df530a894585b29ebd985273d36a63f666` (2026-08-09).

## 1. Evidence record для каждого pilot

Перед использованием checklist зафиксировать:

- pilot date/time;
- target environment;
- application/repository SHA или deployment reference;
- pilot owner;
- проверяемые роли/users;
- required live dependencies;
- известные accepted risks/waivers.

Если этих данных нет, нельзя переносить старый GO/NO-GO verdict на новый pilot.

---

## 2. Scope confirmation

- [ ] Pilot organization определена.
- [ ] Pilot users/roles определены.
- [ ] Pilot course/scenario определён.
- [ ] Expected learner/admin/instructor/manager flows явно перечислены.
- [ ] Out-of-scope capabilities зафиксированы.
- [ ] Notifications/Audit Log и другие `OWNER-DECISION` topics не считаются молча закрытыми.

Source: `docs/MVP_SCOPE_LOCK.md`, `docs/TODO_VERIFY.md`.

---

## 3. Environment/configuration

Для local pilot использовать current local runbook/env example.

Для Railway/live pilot:

- [ ] Web/API topology соответствует current private-API model.
- [ ] Production-required env validated.
- [ ] `TRUST_PROXY` configured where required.
- [ ] Redis state проверен, если pilot требует production-like distributed limiting.
- [ ] Storage configured и live-verified, если pilot включает upload/download.
- [ ] Scanner configured/live, если binary upload входит в scope.

Repository env examples не являются доказательством фактических live values.

---

## 4. Database/migrations

- [ ] Relevant migrations reviewed.
- [ ] CI migration replay green для pilot SHA.
- [ ] Если pilot использует live DB, deployment migration outcome проверен.
- [ ] Для risky/destructive migration определён recovery path.
- [ ] Backup/PITR requirement принят владельцем/ops там, где это требуется.

Не выполнять destructive production migration без explicit approval.

---

## 5. Pilot/demo data

Если используется demo seed:

- [ ] использовать current guarded procedure из `docs/ADMIN_DEMO_SEED.md`;
- [ ] dry-run выполнен перед apply, если procedure это требует;
- [ ] target DB/environment проверен;
- [ ] нет real secrets/passwords/personal production data;
- [ ] необходимые роли/scenario действительно присутствуют после seed.

Historical seed counts из старых pilot docs не являются обязательным current contract.

---

## 6. API/runtime validation

Проверить только relevant pilot flows, минимум:

- [ ] `/api/v1/health/live` отвечает ожидаемо.
- [ ] `/api/v1/health/ready` отвечает ожидаемо для configured dependencies.
- [ ] Login happy path работает.
- [ ] Protected endpoint без auth возвращает expected unauthorized response.
- [ ] Tenant/RBAC negative scenario проверен для pilot risk surface.
- [ ] Relevant learner/course/progress flow работает.
- [ ] Relevant admin/instructor/manager flow работает, если входит в pilot.

Не использовать historical `/api/v1/health` payload как единственный current readiness contract.

---

## 7. Web validation

- [ ] Login/redirect работают.
- [ ] Required role workspace доступен.
- [ ] Learner course/detail/lesson flow работает, если входит в scope.
- [ ] Assessment/assignment/certificate flow проверен, если входит в scope.
- [ ] Upload/download flow проверен только если storage/scanner live dependencies подтверждены.
- [ ] Error/empty/loading state, критичный для pilot, проверен.

---

## 8. Security/readiness validation

- [ ] No real secrets committed/used as demo data.
- [ ] Tenant isolation negative scenario проверен.
- [ ] RBAC relevant to pilot scenario проверен.
- [ ] Required GitHub CI/CodeQL run for pilot SHA green.
- [ ] Не утверждать, что checks merge-enforced: branch protection сейчас `DEFERRED / NOT-IMPLEMENTED`.
- [ ] Known implementation gaps оценены относительно pilot scenario.

See `docs/READINESS_AND_SECURITY_GATES.md`.

---

## 9. CI verification

Перед pilot зафиксировать actual GitHub Actions results для relevant SHA:

```text
CI: <run id> — <status>
CodeQL: <run id> — <status>
```

Нельзя оставлять шаблонное `[Check] Tests: OK` без ссылки/идентификатора конкретного run, если этим обосновывается go/no-go.

---

## 10. Live verification

Для live/Railway pilot выполнить fresh checks:

- [ ] Web entrypoint reachable.
- [ ] API through Web proxy reachable.
- [ ] readiness healthy for required configured dependencies.
- [ ] storage/provider/CORS verified if needed.
- [ ] scanner verified if needed.
- [ ] Redis verified if required by pilot policy.
- [ ] fresh smoke result recorded.

Old Railway domains/smoke reports = `HISTORICAL`, не current evidence.

---

## 11. Known risks and owner acceptance

Перед GO перечислить unresolved items, которые реально затрагивают pilot.

Примеры current known topics:

- health readiness 503 HTTP payload gap;
- instructor role assignment validation gap;
- password-reset skeleton;
- Notifications/Audit Log owner decisions;
- in-memory rate limiting, если Redis intentionally absent;
- live storage/scanner/backup uncertainty, если relevant.

Каждый release/pilot blocker должен быть либо закрыт, либо явно accepted/waived владельцем.

---

## 12. GO / NO-GO

### GO только если

- [ ] pilot scope подтверждён;
- [ ] relevant CI/CodeQL green на exact SHA;
- [ ] relevant runtime/Web smoke green;
- [ ] required live dependencies verified;
- [ ] no unresolved unaccepted blocker affects the scenario;
- [ ] rollback/recovery path понятен для planned risky operations.

### NO-GO если

- CI/CodeQL relevant run red;
- auth/tenant isolation unstable;
- required environment/dependency not verified;
- pilot data unsafe;
- required flow broken;
- owner has not accepted a known blocker/risk that affects the pilot.

### Verdict record

```text
Pilot date:
Environment:
SHA/deployment:
Owner:
CI run:
CodeQL run:
Smoke evidence:
Accepted risks:
Verdict: GO | NO-GO
```

---

## 13. Правила для ИИ-агента

1. `MUST NOT` переносить старый GO verdict на новый SHA/environment.
2. `MUST` привязывать CI/live statements к fresh evidence.
3. `MUST NOT` выбирать owner risk acceptance самостоятельно.
4. `MUST` использовать current guarded seed procedure.
5. `MUST NOT` предполагать live MinIO/Redis/staging/domain state по historical docs.
6. Checklist — процедура; результат отдельного pilot должен хранить дату/SHA/evidence.

## Связанные документы

- `docs/MVP_READINESS_DASHBOARD.md`
- `docs/MVP_SCOPE_LOCK.md`
- `docs/READINESS_AND_SECURITY_GATES.md`
- `docs/RAILWAY_DEPLOY_GUIDE.md`
- `docs/ADMIN_DEMO_SEED.md`

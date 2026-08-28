# Pilot Checklist

> **Статус:** `CURRENT PROCEDURE`.
>
> This checklist produces a GO/NO-GO decision for one controlled pilot. A prior verdict never proves readiness for another SHA/environment.

## 1. Bind the pilot to evidence

Record before verification:

- pilot date/time;
- target environment;
- exact application/repository SHA or deployment reference;
- pilot owner;
- tested users/roles/scenario;
- required live dependencies;
- accepted risks/waivers.

## 2. Confirm scope

Use [`../product/MVP_SCOPE_LOCK.md`](../product/MVP_SCOPE_LOCK.md) for product boundaries and [`../status/OPEN_DECISIONS.md`](../status/OPEN_DECISIONS.md) for unresolved owner/business decisions. Do not infer scope from implementation existence or retired trackers.

- [ ] pilot organization/users/scenario are defined;
- [ ] required role workflows are explicit;
- [ ] out-of-scope capabilities are explicit;
- [ ] unresolved owner decisions relevant to the pilot are not silently treated as closed.

## 3. Environment and data

For local work use the current local runbook. For live/Railway work verify current topology/config rather than copying an old evidence record.

- [ ] required environment variables validate;
- [ ] Redis state is verified when required by policy;
- [ ] storage/scanner are verified when uploads are in scope;
- [ ] relevant migrations are reviewed and replay green in CI;
- [ ] live migration outcome is verified when a live database is used;
- [ ] recovery/backup requirement is accepted for risky operations.

If demo seed is used, follow [`ADMIN_DEMO_SEED.md`](./ADMIN_DEMO_SEED.md) and verify the target environment before apply.

## 4. Runtime/API verification

Test only current owner-backed contracts and the relevant pilot surface:

- [ ] liveness/readiness behave as expected for configured dependencies;
- [ ] login works;
- [ ] unauthenticated protected access is rejected;
- [ ] relevant tenant/RBAC negative path is verified;
- [ ] relevant learner flow works;
- [ ] relevant admin/instructor/manager/mentor flow works when in scope.

Current HTTP surface comes from runtime OpenAPI/controllers, not a historical route list.

## 5. Web verification

- [ ] login/redirect works;
- [ ] required role workspace is reachable;
- [ ] required learning/assessment/assignment/certificate flows work;
- [ ] upload/download is tested only when required live dependencies are verified;
- [ ] critical error/empty/loading state is checked.

## 6. Repository security/readiness

For the exact pilot SHA:

- [ ] required CI is green;
- [ ] required CodeQL is green;
- [ ] current merge enforcement is re-read when it is used as evidence;
- [ ] relevant known implementation issues from GitHub Issues are assessed;
- [ ] no required risk/blocker remains unaccepted.

See [`../quality/READINESS_AND_SECURITY_GATES.md`](../quality/READINESS_AND_SECURITY_GATES.md).

Record actual run identifiers rather than writing a generic “CI OK”.

## 7. Live verification

For a live pilot:

- [ ] Web/API entrypoints are reachable;
- [ ] readiness is healthy for required dependencies;
- [ ] storage/provider/scanner are verified if needed;
- [ ] Redis is verified if required;
- [ ] fresh smoke evidence is recorded;
- [ ] rollback/recovery path is understood.

Historical Railway domains or smoke reports are not current evidence.

## 8. GO / NO-GO

### GO only if

- scope is confirmed;
- CI/CodeQL are green for the exact SHA;
- relevant runtime/Web smoke is green;
- required live dependencies are verified;
- no unresolved unaccepted blocker affects the scenario;
- recovery is understood for planned risky operations.

### NO-GO if

Any required check/flow/dependency is red, missing, unsafe, or requires owner acceptance that has not been obtained.

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

## Related docs

- [`../product/MVP_SCOPE_LOCK.md`](../product/MVP_SCOPE_LOCK.md)
- [`../status/OPEN_DECISIONS.md`](../status/OPEN_DECISIONS.md)
- [`../quality/READINESS_AND_SECURITY_GATES.md`](../quality/READINESS_AND_SECURITY_GATES.md)
- [`RAILWAY_DEPLOY_GUIDE.md`](./RAILWAY_DEPLOY_GUIDE.md)
- [`RELEASE_GATE.md`](./RELEASE_GATE.md)

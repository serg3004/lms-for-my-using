# Staging Smoke Report — Historical Archive

> **Статус:** `HISTORICAL / SUPERSEDED`
>
> Этот файл сохраняет результаты Railway bring-up/smoke 2026-06-06/07. Он не является current deployment runbook и не подтверждает текущее live состояние.

## 1. Historical Smoke #1 — 2026-06-06

Recorded historical outcome:

- PostgreSQL online;
- API online;
- Web online;
- Web → API proxy worked;
- admin and learner login worked;
- learner course/lesson/progress/assessment/assignment surfaces were exercised;
- historical verdict: `MVP READY for demo` for that environment/time.

Commit SHA for Smoke #1 was not recorded in the original report.

## 2. Historical Smoke #2 — 2026-06-07

**Recorded branch:** `main`

**Recorded commit SHA:** `5fa966e249c0fabd683fd2e868f72f9335010a54`

Recorded checks included:

- Web home page: OK;
- direct API health: OK;
- Web → API health proxy: OK;
- admin login: OK;
- learner login was not re-tested in Smoke #2.

The historical report described a Public Networking port mismatch and a manual API public-port fix.

## 3. Superseded operational guidance

The following historical instructions are **not current guidance**:

- exposing API through Railway Public Networking as normal topology;
- manually aligning a public API networking port to `3000`;
- requiring Railway `API_PORT=3000` for public routing;
- using the old direct-public API URL as a current dependency;
- treating `/api/v1/health` old payload as the canonical modern readiness contract;
- using historical seed credentials/commands as current production instructions.

Current architecture uses public Web + private API through Railway private networking/nginx.

See `docs/RAILWAY_DEPLOY_GUIDE.md` and `infra/railway/README.md`.

## 4. Why the old verdict is not current evidence

A smoke result is valid only for its recorded deployment/time/SHA.

Since 2026-06-07 the repository and deployment contract changed substantially. Therefore:

- historical `OK` does not imply current production health;
- historical public domains do not imply current domains;
- old provider/env values do not imply current configuration;
- old demo credentials must not be reused as operational guidance.

Current live claims require `LIVE-VERIFY`.

## 5. Current smoke procedure

For a new pilot/release use:

- `docs/PILOT_CHECKLIST.md`;
- `docs/RAILWAY_DEPLOY_GUIDE.md`;
- `docs/READINESS_AND_SECURITY_GATES.md`;
- current smoke script/workflow where applicable.

Record at minimum:

```text
Date/time:
Environment:
Deployment/SHA:
Web entrypoint:
Relevant CI run:
Relevant CodeQL run:
Smoke result:
Known accepted risks:
```

## 6. Historical evidence retention

The original detailed tables, URLs, environment notes and bring-up fixes remain available in Git history before this cleanup revision.

## 7. Правило для ИИ-агента

`MUST NOT` reuse a URL, port fix, env value or GO verdict from this file as a current fact.

This document is evidence of **what worked in June 2026**, not instructions for what to configure now.

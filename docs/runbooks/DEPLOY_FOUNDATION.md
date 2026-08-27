# Deploy Foundation

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать current deployment foundation и границы между repository-defined architecture и live infrastructure state.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## 1. Deployment model

**Статус:** `IMPLEMENTED` для repository config, `LIVE-VERIFY` для actual deployment.

Current project deployment foundation:

- Railway-first deployment;
- Docker-based API/Web services;
- public Web entrypoint;
- private API reachable through Railway private networking;
- PostgreSQL database;
- Redis-backed rate limiting in preferred production mode;
- optional/configured S3-compatible object storage;
- readiness-driven API healthcheck.

Repository config defines intended topology. It does not prove current Railway service state.

---

## 2. Network boundary

### Web

Public ingress terminates at Web/nginx.

### API

API is current private backend service. `/api/` requests are proxied from Web/nginx to the internal Railway API hostname.

Historical direct-public API topology is no longer current guidance.

**Rule:** `MUST NOT` treat API Public Networking as required for normal production traffic.

---

## 3. Startup and migrations

Current API Railway start command applies:

```text
prisma migrate deploy
```

before starting the API process.

Therefore migration deployment is automatic in current Railway API startup.

This foundation does **not** claim automatic database rollback. Application rollback and DB rollback are separate concerns.

---

## 4. Health/readiness foundation

Canonical endpoints:

- liveness: `/api/v1/health/live`;
- readiness: `/api/v1/health/ready`.

Railway uses readiness endpoint for API healthcheck.

Readiness evaluates DB plus configured Redis/storage dependencies.

`disabled` dependency status can still be technically ready, so readiness must not be confused with complete production feature readiness.

---

## 5. Production configuration foundation

Current production configuration requires/uses:

- database connection;
- frontend origin;
- JWT secret;
- production mode;
- `TRUST_PROXY`;
- Redis unless explicit in-memory fallback is enabled;
- S3-compatible storage only when file storage is configured;
- optional Sentry/observability and malware scanner integrations.

Exact env inventory lives in `.env.production.example` and current env validation code.

---

## 6. Storage foundation

**Статус:** `IMPLEMENTED` contract / `LIVE-VERIFY` provider.

Project storage architecture is provider-neutral S3-compatible.

Implemented capabilities include:

- private object keys;
- authorized presigned download;
- buffered and multipart upload;
- quarantine/malware-scan flow;
- cleanup tooling;
- storage readiness.

No canonical document should claim a specific production provider without fresh external evidence.

---

## 7. Redis/rate-limit foundation

Preferred production state: Redis-backed distributed limiting.

Explicit emergency fallback:

```text
ALLOW_IN_MEMORY_RATE_LIMIT=true
```

This permits startup without Redis but degrades protection to per-process in-memory limiting.

Configured-but-down Redis should make readiness fail even while sensitive routes may continue under local fallback.

---

## 8. Staging model

**Current documented state:** no separate Railway staging environment.

Any old text that assumes permanent staging Web/API/Postgres services is `HISTORICAL` unless fresh external evidence confirms otherwise.

GitHub Actions staging-named workflow/environment does not prove separate Railway staging topology.

---

## 9. Backup/restore foundation

Repository documentation may define desired backup policy, but actual backup/PITR/restore state is `LIVE-VERIFY`.

Deployment readiness must not infer backup success from:

- Railway presence;
- database availability;
- migration success;
- env/config comments.

A production recovery claim requires fresh backup/restore evidence.

---

## 10. Operational evidence levels

Use these statuses consistently:

- `IMPLEMENTED` — confirmed by current code/config.
- `CONFIGURED` — repository config exists.
- `LIVE-VERIFY` — external current state required.
- `HISTORICAL` — old deployment evidence, not current truth.
- `OWNER-DECISION` — future infrastructure choice requires explicit decision.

---

## 11. Explicit non-claims

This document does **not** claim that currently:

- Railway API Public Networking is enabled;
- production uses MinIO specifically;
- a separate Railway staging environment exists;
- backups/PITR are enabled;
- Redis/scanner/storage/Sentry are live and healthy;
- a fresh production smoke has passed.

All such statements require `LIVE-VERIFY` evidence.

---

## 12. Rules for AI agents

1. `MUST` use private API + Web proxy as current architecture.
2. `MUST` use automatic `prisma migrate deploy` as current startup behavior.
3. `MUST NOT` assume staging or a specific storage provider.
4. `MUST NOT` equate technical readiness with production compliance.
5. `MUST NOT` claim backup/restore readiness without actual evidence.
6. `MUST` update this document if deployment architecture itself changes.

## Связанные документы

- `docs/RAILWAY_DEPLOY_GUIDE.md`
- `docs/MIGRATION_BACKUP_POLICY.md`
- `docs/STORAGE_UPLOAD_STATUS.md`
- `infra/railway/README.md`
- `docs/READINESS_AND_SECURITY_GATES.md`

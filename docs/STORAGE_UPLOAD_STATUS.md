# Storage Upload Status

> **Статус:** `CURRENT`
>
> **Назначение:** разделить подтверждённый storage/upload implementation contract и external production state, которое требует live verification.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## 1. Status model

- `IMPLEMENTED` — подтверждено current repository code/config/tests.
- `CONFIGURED` — repository содержит configuration surface.
- `LIVE-VERIFY` — provider/runtime state требует external evidence.
- `HISTORICAL` — старое состояние или migration note, не current fact.

**Правило для ИИ-агента:** наличие code/config не является доказательством, что live provider/scanner/scheduler реально настроены и работают.

---

## 2. Storage contract

**Статус:** `IMPLEMENTED`

Current storage architecture — S3-compatible и provider-neutral.

Основные свойства:

- private object storage;
- opaque tenant/material-scoped object keys;
- authorized download path;
- short-lived presigned download URLs;
- buffered upload;
- multipart upload;
- quarantine/malware-scan flow;
- delete/cleanup tooling;
- storage readiness check.

Конкретный production provider не является частью implementation fact.

---

## 3. Download contract

**Статус:** `IMPLEMENTED`

Material download проходит через authorized application route и только затем выдаёт presigned URL.

Current presign TTL ограничен максимумом 300 секунд.

Download response forced как attachment / binary-safe content handling.

**LIVE-VERIFY:** фактическая browser accessibility URL зависит от live provider/network/CORS/origin configuration.

---

## 4. Buffered upload

**Статус:** `IMPLEMENTED`

Buffered upload endpoint предназначен для файлов до 8 MiB.

Этот path выполняет server-side validation, включая content/magic-byte/archive checks, применимые к buffered file.

Overall material upload validation допускает больший общий размер; для больших файлов используется multipart path.

---

## 5. Multipart upload

**Статус:** `IMPLEMENTED`

Current multipart flow:

1. создаёт quarantine object/key;
2. выдаёт presigned upload parts;
3. использует 8 MiB part size;
4. завершает multipart upload по ETags;
5. поддерживает abort;
6. проверяет фактический object size после completion;
7. не делает object available до malware verdict.

### Web behavior

Current Web upload helper автоматически выбирает:

- `<= 8 MiB` → buffered upload;
- `> 8 MiB` → direct multipart upload.

Это current end-to-end client behavior, а не backend-only capability.

---

## 6. Malware/quarantine flow

**Статус:** `IMPLEMENTED` для code integration; `LIVE-VERIFY` для scanner service.

Binary upload начинает lifecycle в quarantine state.

Current integration включает:

- scanner dispatch;
- timeout/deadline;
- authenticated callback;
- clean promotion в normal material prefix;
- infected/error/timeout rejection;
- quarantine cleanup on failure;
- fail-closed behavior.

Если scanner URL/callback secret отсутствуют, binary upload не становится available: material остаётся/reaches rejected state и quarantine object удаляется according current flow.

### Live scanner

Repository не доказывает:

- какой scanner provider/service используется;
- что scanner сейчас reachable;
- что callback secret deployed correctly;
- fresh clean/infected end-to-end result.

Это `LIVE-VERIFY`.

---

## 7. Storage configuration

Canonical env inventory — `.env.production.example` + current env validation.

### Required configured-storage fields

S3-compatible configuration использует endpoint/bucket/access key/secret key и связанные options.

### `S3_FILE_ORIGIN`

`S3_FILE_ORIGIN` — optional dedicated signed-download origin, а не обязательный provider parameter.

### Provider

Current production documentation не должна утверждать без evidence:

```text
production = MinIO
```

Compatible options включают provider-neutral S3 implementations, например R2/AWS S3, а self-hosted MinIO остаётся одним из вариантов.

**Agent rule:** `DO NOT ASSUME` provider.

---

## 8. Readiness semantics

**Статус:** `IMPLEMENTED`

Если storage configured, readiness выполняет bucket-level health check.

Если storage не configured, readiness может возвращать:

```text
storage: disabled
```

и technical readiness может оставаться 200.

**Важно:** `storage: disabled` не доказывает production readiness file-upload capability.

---

## 9. Cleanup tooling

**Статус:** `IMPLEMENTED` scripts / `LIVE-VERIFY` scheduling.

Current API package содержит cleanup commands для:

- orphan storage cleanup;
- multipart cleanup.

Наличие script не доказывает, что production scheduler/cron реально запускает его.

Live scheduling, last run, orphan counts и cleanup history — `LIVE-VERIFY`.

---

## 10. Delete semantics

**Статус:** `IMPLEMENTED`

Material/file deletion удаляет associated normal/quarantine objects и очищает metadata according current service behavior.

S3-compatible object deletion может быть idempotent на object layer, но full DB+object operation не следует описывать как строго атомарную distributed transaction.

Operational failure handling должно оцениваться по current service/tests, а не по одному свойству S3 `DeleteObject`.

---

## 11. CORS / direct multipart provider requirements

Direct multipart browser upload требует provider-side CORS, включая разрешённый `PUT` и доступ к ETag response headers according client flow.

Repository documentation/config может описывать требование, но фактический bucket CORS — `LIVE-VERIFY`.

---

## 12. Historical data / backfill

Legacy storage transition/backfill steps являются migration plan/history, а не автоматическим доказательством, что production historical rows/bucket полностью reconciled.

Если backfill завершён, status должен иметь fresh evidence:

- timestamp;
- run/deployment reference;
- affected counts;
- verification result.

Без этого completion = `LIVE-VERIFY`.

---

## 13. Backup/recovery

Storage recovery требует согласования database metadata и object storage.

Repository не доказывает actual production backup/restore state для DB+bucket.

Fresh backup/PITR/object recovery evidence относится к `LIVE-VERIFY` и `docs/MIGRATION_BACKUP_POLICY.md`.

---

## 14. Production readiness checklist

Для утверждения `storage production-ready` нужно отдельно подтвердить:

- [ ] provider/bucket configured;
- [ ] credentials valid;
- [ ] bucket CORS supports current browser multipart flow;
- [ ] presigned download origin reachable;
- [ ] scanner configured and callback works;
- [ ] clean/infected flows verified;
- [ ] cleanup scheduling exists;
- [ ] upload/download/delete smoke passed;
- [ ] recovery/backup expectations accepted.

Repository implementation закрывает code contract, но не автоматически эти live items.

---

## 15. Rules for AI agents

1. `MUST` distinguish implementation from live provider state.
2. `MUST NOT` assume MinIO/R2/AWS S3 without evidence.
3. `MUST` treat `S3_FILE_ORIGIN` as optional.
4. `MUST` document current Web buffered/multipart selection.
5. `MUST NOT` claim scanner availability because integration code exists.
6. `MUST NOT` claim cleanup scheduled because scripts exist.
7. `MUST NOT` use `storage: disabled` as proof of upload production readiness.
8. Live CORS/provider/backfill/backup/smoke assertions require fresh evidence.

## Связанные документы

- `docs/RAILWAY_DEPLOY_GUIDE.md`
- `docs/DEPLOY_FOUNDATION.md`
- `docs/MIGRATION_BACKUP_POLICY.md`
- `docs/READINESS_AND_SECURITY_GATES.md`
- `.env.production.example`

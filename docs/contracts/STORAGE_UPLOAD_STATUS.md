# Storage Upload Status

> **Статус:** `CURRENT`
>
> **Назначение:** разделить подтверждённый storage/upload implementation contract и external production state, которое требует live verification.
>
> **Проверено по `main`:** `7c2710335b6a1f840c9d412ab5ac270cb76e4fae` (2026-08-22).

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

### Аудит методов `UploadService`

В таблице `implemented` означает, что метод выполняет реальную операцию через AWS SDK либо формирует реальный storage key. `stub` означает placeholder без рабочей операции, `missing` — требуемой операции в сервисе нет.

| Метод | Статус | Фактическое поведение |
| --- | --- | --- |
| `isConfigured` | `implemented` | Сообщает, создан ли S3 client из полного набора обязательных настроек. |
| `checkReadiness` | `implemented` | Выполняет `HeadBucket`; возвращает `disabled`, только когда storage не настроен. |
| `uploadMaterialFile` | `implemented` | Загружает buffered material в tenant-scoped quarantine key через `PutObject`. |
| `createMaterialObjectKey` | `implemented` | Создаёт opaque tenant/material-scoped normal key. |
| `uploadChecklistItemPhoto` | `implemented` | Загружает validated photo в tenant/instance/item-scoped key через `PutObject`. |
| `uploadOrganizationLogo` | `implemented` | Загружает validated logo в tenant-scoped branding key через `PutObject`. |
| `getInlinePresignedUrl` | `implemented` | Выдаёт presigned `GetObject` для inline display с TTL не более 300 секунд. |
| `createQuarantineObjectKey` | `implemented` | Создаёт opaque tenant/material-scoped quarantine key. |
| `createMultipartUpload` | `implemented` | Создаёт S3 multipart upload и требует `UploadId` в ответе. |
| `getMultipartPartUrl` | `implemented` | Выдаёт presigned `UploadPart` URL с TTL не более 900 секунд. |
| `completeMultipartUpload` | `implemented` | Завершает multipart upload, поддерживает безопасный retry через `HeadObject` и возвращает фактический размер. |
| `abortMultipartUpload` | `implemented` | Отменяет multipart upload через S3. |
| `listMultipartUploads` | `implemented` | Постранично перечисляет незавершённые uploads под ограниченным prefix. |
| `promoteQuarantinedObject` | `implemented` | Копирует clean object из quarantine в normal prefix и удаляет quarantine copy. |
| `getPresignedUrl` | `implemented` | Выдаёт binary-safe attachment URL с безопасным именем и TTL не более 300 секунд. |
| `listObjects` | `implemented` | Постранично перечисляет objects под заданным prefix для lifecycle cleanup. |
| `deleteObject` | `implemented` | Удаляет object через `DeleteObject`. |

**Итог:** `implemented: 17`, `stub: 0`, `missing: 0` для публичных методов current `UploadService`. Отдельного upload controller нет намеренно: storage используется из domain controllers (materials, checklists, organization branding), где применяются auth/scope/role guards и validation.

### Аудит upload orchestration

| Операция | Статус | Фактическое поведение |
| --- | --- | --- |
| Buffered material upload | `implemented` | 8 MiB server-buffer limit, metadata/content/archive validation, quarantine и scan dispatch. |
| Multipart initiate/complete/abort | `implemented` | DB-backed tenant/material-owned session, 8 MiB parts, 24-hour expiry, ordered ETags и actual-size check. |
| Expired multipart cleanup | `implemented` | Dry-run по умолчанию; keyset pagination читает по 100 sessions, execute aborts с concurrency 5 и marks DB session aborted; отдельная ошибка остаётся pending для retry и не останавливает batch. |
| Malware scan dispatch/callback | `implemented` | Authenticated callback, bounded dispatch timeout, fail-closed rejection and clean promotion. |
| Orphan object cleanup | `implemented` | Сверяет normal/quarantine objects с DB references; dry-run по умолчанию. |
| Automatic cleanup scheduling | `missing` | Команды существуют, но repository не создаёт cron/scheduler. Это deployment task. |
| Live provider/CORS/scanner verification | `missing` | Не может быть реализовано repository code: требуется deployment evidence. |

Детальный план закрытия deployment-зависимых пунктов, inventory env и оценка приведены в [`STORAGE_PLAN.md`](../runbooks/STORAGE_PLAN.md).

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

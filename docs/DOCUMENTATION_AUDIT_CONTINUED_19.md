# Продолжение аудита актуальности документации — часть 19

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_18.md` содержат результаты №21–38. Этот файл продолжает последовательный аудит с №39.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 39 | `STORAGE_UPLOAD_STATUS.md` | ⚠️ В основном актуален как code contract | Private tenant-scoped storage, buffered/multipart upload, quarantine scanning, presigned download, cleanup и UI flow реализованы; live provider/scanner/scheduling/backfill остаются operational evidence, а storage optional для MVP/readiness |

---

## 39. `STORAGE_UPLOAD_STATUS.md`

**Статус:** ⚠️ в основном актуален как описание current implementation. Основные API/storage/security semantics совпадают с кодом, но документу не хватает явного разделения между реализованным repository contract и live production/provider status.

### Подтверждено

- File objects используют opaque tenant/material-scoped keys; original filename не включается в object key.
- Download выдаётся через authorized `/materials/:id/download`; presigned TTL hard-capped at 300 seconds, response forces attachment + `application/octet-stream`.
- Buffered endpoint существует и ограничен 8 MiB.
- Frontend `uploadMaterialFileWithProgress()` действительно выбирает buffered upload для `<= 8 MiB` и direct multipart для больших файлов.
- Multipart flow создаёт quarantine key, presigned 8 MiB parts, завершает upload через ETags и поддерживает abort.
- Upload validation сохраняет общий 50 MiB limit; buffered path дополнительно выполняет content/magic-byte/ZIP checks, а multipart после complete проверяет фактический object size.
- Каждый binary upload попадает в quarantine со scan state; downloader требует ordinary `objectKey` + `scanStatus === available`.
- Malware scan dispatch использует 5-second deadline, authenticated callback и fail-closed behavior. `clean` promotes quarantine object в normal material prefix; infected/error/timeout удаляют quarantine object и mark rejected.
- Если scanner URL/callback secret отсутствуют, binary upload не становится available: quarantine object удаляется, material rejected, request получает 503.
- Delete file удаляет normal/quarantine objects и очищает metadata; cleanup scripts `storage:cleanup` и `storage:multipart-cleanup` реально существуют в `apps/api/package.json`.
- `.env.production.example` документирует S3-compatible configuration, TTL, orphan retention, multipart cleanup и malware scanner settings.
- Storage readiness делает `HeadBucket` при configured storage и возвращает `disabled`, если storage не настроен.
- Admin Materials UI реально поддерживает create/upload, replace file и progress display; Web helper автоматически переключается на multipart для больших файлов.

### Несоответствия и уточнения

1. **Название `STATUS` смешивает code implementation и live environment readiness.** Repository подтверждает S3-compatible implementation, но не подтверждает, какой provider/bucket сейчас реально используется production.
2. `.env.production.example` прямо говорит `Storage optional for MVP` и рекомендует Cloudflare R2/AWS S3; MinIO — self-hosted option. Поэтому document нельзя трактовать как подтверждение конкретного live provider.
3. `S3_FILE_ORIGIN` — optional dedicated signed-download origin, а не обязательная storage variable. Required quartet — endpoint/bucket/access-key/secret-key.
4. Cleanup scripts существуют, но их **scheduled execution** в production не подтверждено repository config. Наличие команды ≠ работающий cron/job.
5. Legacy transition section описывает безопасный migration/backfill plan, но сам по себе не доказывает, что inventory/backfill historical rows фактически выполнен в live DB/bucket.
6. Backup DB+bucket instruction является operational requirement; fresh backup/restore evidence не содержится в этом status file.
7. Malware scan integration code реализован, но live scanner service, URL, callback secret и successful end-to-end verdict flow остаются external operational state.
8. Storage can be disabled while technical readiness remains green (`storage: disabled`). Следовательно, `/health/ready` не является доказательством, что file-upload capability production-ready.
9. Document хорошо объясняет 8 MiB buffered vs multipart, но полезно явно указать, что current Web client уже автоматически выбирает эти paths; это больше не backend-only capability.
10. Direct multipart CORS requirement (`PUT` + exposed `ETag`) является provider configuration requirement, а не repository-enforced S3 bucket setting. Его live correctness не подтверждена.
11. `S3 DeleteObject is idempotent` помогает повторяемости object deletion, но full API delete transaction не атомарна между S3 и DB; operational failure handling/audit нужно оценивать по current delete service/tests, а не сводить к idempotency S3 call.
12. Документу не хватает freshness marker `Verified against main SHA`; storage/upload subsystem активно менялся последними PR.

### Что изменить

1. Сохранить current runtime/storage contract — он в основном точен.
2. Разделить sections на `Implemented in repository` и `Production/live verification required`.
3. Явно маркировать production provider/bucket/scanner/scheduling как external state, не как code fact.
4. Уточнить `S3_FILE_ORIGIN` как optional и ссылаться на `.env.production.example` как canonical env inventory.
5. Для cleanup commands добавить status `script exists; scheduler not repository-enforced` и требовать run timestamp/log для operational readiness.
6. Legacy transition назвать migration plan/status; если backfill завершён, добавить exact migration/run evidence, counts/date/SHA; если нет — оставить `[НЕ ПРОВЕРЕНО]`.
7. Добавить current Web behavior: `<=8 MiB` buffered, `>8 MiB` multipart automatically.
8. Явно отделить `health ready` от `file upload production-ready`: `storage: disabled` допускается техническим health contract.
9. Для malware scanner добавить `code integration implemented / live scanner not verified`.
10. Добавить `Verified at` и `Verified against main SHA`.

### [НЕ ПРОВЕРЕНО]

- Live production S3-compatible provider, endpoint, bucket, CORS и credentials.
- Live `S3_FILE_ORIGIN` и фактическая browser accessibility signed URLs.
- Malware scanner service/provider, callback secret и fresh end-to-end clean/infected verdict run.
- Фактический scheduler/cron для orphan и multipart cleanup scripts.
- Live orphan count, expired multipart count и cleanup execution history.
- Historical legacy-row inventory/backfill completion и production DB/bucket backup/restore evidence.
- Fresh live upload/download/delete smoke against production storage.

### Итог

`STORAGE_UPLOAD_STATUS.md` — один из наиболее актуальных status docs: его tenant isolation, private object keys, presigned downloads, upload limits, multipart design, quarantine scanning и cleanup contracts подтверждаются current code. Основной remaining drift — слово `STATUS` создаёт впечатление live readiness. Repository доказывает **implementation**, но не provider configuration, scanner availability, bucket CORS, scheduled cleanup, legacy backfill или fresh production smoke. После явного разделения code contract и operational evidence документ будет точным current source для storage subsystem.

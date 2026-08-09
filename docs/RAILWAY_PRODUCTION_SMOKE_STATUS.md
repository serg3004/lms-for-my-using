# Railway Production Smoke Status — Historical Snapshot

> **Статус:** `HISTORICAL / STALE / LIVE-VERIFY REQUIRED`
>
> **Last verified in this historical record:** 2026-07-08.
>
> Этот файл больше не является current production status page.

## 1. Last known-good historical result

Оригинальный документ фиксировал на 2026-07-08:

```text
MVP smoke test: Passed 17 / Failed 0
```

Он также фиксировал успешный Web → API → DB path и health check для тогдашнего production deployment.

Эти результаты являются историческим evidence только для того deployment/time.

## 2. Почему статус stale

Уже 2026-08-06 документ был помечен stale: после последней проверки в `main` вошло много изменений, а fresh production smoke из доступного environment выполнить не удалось из-за outbound network restrictions.

С тех пор current deployment model/documentation также был reconciled.

Следовательно `OK as of 2026-07-08` нельзя сокращать до просто `production OK`.

## 3. Superseded topology details

Historical version содержала:

- direct public API URL;
- Web `API_UPSTREAM_URL` на этот public API;
- direct public API health verification;
- troubleshooting для public upstream TLS/timeouts.

Current canonical repository model — public Web + private Railway API through internal networking/nginx.

Поэтому эти URLs/upstream instructions являются `HISTORICAL` и не должны использоваться как current config.

See `docs/RAILWAY_DEPLOY_GUIDE.md`.

## 4. Current production status

**Статус:** `LIVE-VERIFY`

Repository не подтверждает текущие:

- production domains;
- Railway service state;
- Redis availability;
- S3-compatible provider/bucket/CORS;
- scanner availability;
- backup/PITR;
- fresh production smoke result.

Green GitHub Actions также не является production verification.

## 5. How to create a new current smoke record

Для нового production smoke:

1. использовать current Web/private-API topology;
2. привязать run к exact deployment/SHA;
3. проверить `/api/v1/health/live` и `/api/v1/health/ready` через intended path;
4. выполнить relevant MVP smoke flows;
5. проверить required live dependencies;
6. записать passed/failed counts и known accepted risks;
7. не перезаписывать historical result как будто он был выполнен на новом SHA.

Current procedure: `docs/PILOT_CHECKLIST.md` + `docs/RAILWAY_DEPLOY_GUIDE.md`.

## 6. Historical provenance

Original detailed URLs, commands, PR #341/#342 notes and troubleshooting remain available in Git history before this cleanup revision.

## 7. Правило для ИИ-агента

`MUST NOT` утверждать current production health на основании этого файла.

Допустимая формулировка без fresh evidence:

> Последний сохранённый historical smoke result: 2026-07-08, 17 passed / 0 failed; current production state requires live verification.

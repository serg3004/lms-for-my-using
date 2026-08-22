# Railway deployment notes

> **Статус:** `CURRENT`
>
> Краткая operational reference для текущей Railway topology. Подробности и policy — в `docs/RAILWAY_DEPLOY_GUIDE.md`.
>
> **Проверено по `main`:** `bd602622a4647f825cf5f5bc3bf10f663940c0a5` (2026-08-09).

## Topology

- Web service — public entrypoint.
- API service — private Railway service.
- Nginx проксирует `/api/` на `api.railway.internal:3000`.
- Не включать Public Networking для API без отдельной owner/ops задачи.
- Malware scanner (`services/malware-scanner/`) — опциональный private-сервис для malware scanning материалов (`MALWARE_SCANNER_URL`/`MALWARE_SCANNER_CALLBACK_SECRET`). Без него `POST /materials/:id/file` возвращает `503`. Инструкция по деплою: `services/malware-scanner/README.md`.

## Ports

Railway runtime `PORT` используется current API env loader как `API_PORT`, если `API_PORT` не задан явно.

Не нужно вручную фиксировать public API port 3000 для нормальной topology.

## API startup

Current Railway start command:

```text
prisma migrate deploy
node dist/main.js
```

Фактическая команда задаётся `apps/api/railway.json`; этот файл является source of truth для Railway API startup.

## Health

Canonical API readiness endpoint:

```text
/api/v1/health/ready
```

Liveness:

```text
/api/v1/health/live
```

## Production env

Использовать `.env.production.example` и current env validation как canonical inventory.

Особенно учитывать:

- `TRUST_PROXY` required in production;
- Redis preferred/required unless explicit `ALLOW_IN_MEMORY_RATE_LIMIT=true` emergency fallback;
- storage provider-neutral S3-compatible;
- `S3_FILE_ORIGIN` optional.

Не считать комментарии env-файла доказательством фактического live provider state.

## Demo seed

Historical command `node dist/scripts/seed.js` не использовать.

Current guarded demo seed описан в:

```text
docs/ADMIN_DEMO_SEED.md
```

Перед apply соблюдать dry-run/environment/database safeguards из этого документа.

## Staging

Current repository policy не определяет отдельный Railway staging environment.

GitHub Actions environment/workflow с названием `staging` не является доказательством отдельного Railway deployment.

## Live verification

Repository config не подтверждает фактические:

- Railway service topology/domains;
- Redis state;
- storage provider/bucket/CORS;
- scanner availability;
- backup/PITR;
- fresh production smoke.

Для этих утверждений требуется fresh external evidence (`LIVE-VERIFY`).

## Related docs

- `docs/RAILWAY_DEPLOY_GUIDE.md`
- `docs/DEPLOY_FOUNDATION.md`
- `docs/MIGRATION_BACKUP_POLICY.md`
- `docs/STORAGE_UPLOAD_STATUS.md`
- `docs/READINESS_AND_SECURITY_GATES.md`

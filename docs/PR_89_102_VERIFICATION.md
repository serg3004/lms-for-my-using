# PR 89–102 Verification — Historical Snapshot

> **Статус:** `HISTORICAL / SUPERSEDED`
>
> **Snapshot date:** 2026-06-04.
>
> **Назначение:** сохранить provenance ранней проверки planned items 89–102. Документ не является current backlog или implementation authority.

## 1. Что представлял собой этот snapshot

В июне 2026 года документ сверял ранний план items 89–102 с состоянием repository перед продолжением MVP/Railway work.

Нумерация `PR 89…102` — исторические planning identifiers. Она не должна автоматически интерпретироваться как GitHub PR numbers.

## 2. Почему snapshot больше нельзя использовать как current status

После snapshot repository существенно изменился. В частности, statements о том, что следующие области не подтверждены/не реализованы, больше не являются current facts:

- backend S3-compatible upload service;
- frontend upload flow;
- multipart/presigned upload;
- learner completion flow;
- assessment taking/result behavior;
- certificates/issuance surfaces;
- guarded demo seed;
- current Railway deployment contract.

Current implementation должен проверяться по code/config/tests и canonical docs, а не по этому snapshot.

## 3. Historical themes 89–102

Snapshot охватывал:

- Railway configuration/environment setup;
- admin users/courses/lessons/materials/assignments/assessments UI;
- file upload backend/frontend;
- learner lesson completion;
- learner assessment flow;
- certificate issuance;
- demo seed alignment.

Эти темы полезны как карта того, что проверялось в ранней фазе, но не как список оставшейся работы.

## 4. Railway/staging caveat

Historical verification предполагала отдельную Railway staging verification/deploy sequence.

Current canonical deployment docs не определяют отдельный Railway staging environment. GitHub workflow/environment с названием `staging` не доказывает его наличие.

Использовать:

- `docs/RAILWAY_DEPLOY_GUIDE.md`;
- `docs/DEPLOY_FOUNDATION.md`;
- `docs/MIGRATION_BACKUP_POLICY.md`.

## 5. Upload/storage caveat

Historical snapshot отмечал upload как отсутствующий/неподтверждённый.

Это superseded: current repository имеет S3-compatible buffered/multipart upload, presigned access, quarantine/scanner integration и related Web flow.

Live provider/bucket/CORS/scanner state при этом всё ещё `LIVE-VERIFY`.

См. `docs/STORAGE_UPLOAD_STATUS.md`.

## 6. Seed caveat

Historical target counts и demo credentials не являются current contract.

Current guarded procedure находится в `docs/ADMIN_DEMO_SEED.md`.

Не использовать old snapshot seed instructions для production/live environment.

## 7. Current sources

Для current status использовать:

- `docs/PROJECT_SOURCE_OF_TRUTH.md`;
- `docs/MVP_SCOPE_LOCK.md`;
- `docs/TODO_VERIFY.md`;
- `docs/MVP_READINESS_DASHBOARD.md`;
- `docs/PRODUCTION_HARDENING_BACKLOG.md`;
- `docs/DEVELOPMENT_PLAN.md`.

## 8. Historical evidence

Оригинальный подробный PR 89–102 table/findings сохранён в Git history до этой cleanup-ревизии.

Если требуется расследовать конкретное старое planning item, читать historical revision и затем обязательно перепроверять вывод против current repository.

## 9. Правило для ИИ-агента

`MUST NOT` создавать работу только потому, что этот snapshot помечал item как missing/remaining.

Сначала проверить current code/config/tests и current canonical status.

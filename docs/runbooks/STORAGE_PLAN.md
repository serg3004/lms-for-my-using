# Storage/upload rollout plan

> **Статус:** `IMPLEMENTATION COMPLETE / LIVE ROLLOUT REQUIRED`
>
> **Основание аудита:** repository state `7c2710335b6a1f840c9d412ab5ac270cb76e4fae` от 2026-08-22.

## 1. Цель и границы

Repository уже содержит рабочий provider-neutral S3-compatible contract: buffered и multipart uploads, private download, quarantine, malware scan, cleanup и readiness. Поэтому этот документ не предлагает повторную реализацию storage abstraction. Он описывает оставшуюся работу для безопасного включения существующего кода в конкретном environment.

Конкретный provider (AWS S3, R2, MinIO или другой S3-compatible service) выбирается владельцем deployment. Наличие совместимого кода не доказывает, что какой-либо provider уже настроен.

## 2. Configuration inventory

Значения и secrets в Git не коммитятся.

| Переменная | Обязательность | Назначение |
| --- | --- | --- |
| `S3_ENDPOINT` | required | API endpoint выбранного S3-compatible provider. |
| `S3_REGION` | optional, default `auto` | Signing/provider region. |
| `S3_BUCKET` | required | Private bucket name. |
| `S3_ACCESS_KEY_ID` | required secret | Least-privilege application credential. |
| `S3_SECRET_ACCESS_KEY` | required secret | Secret для application credential. |
| `S3_FORCE_PATH_STYLE` | optional, default `false` | Включается только для provider, которому нужен path-style addressing (часто self-hosted S3). |
| `S3_FILE_ORIGIN` | optional | Отдельный browser-reachable origin только для signed downloads. |
| `S3_PRESIGNED_TTL_SECONDS` | optional, default/max `300` | TTL material download URL; код ограничивает значение пятью минутами. |
| `S3_ORPHAN_RETENTION_DAYS` | optional, default `30` | Минимальный возраст orphan object до cleanup. |
| `MALWARE_SCANNER_URL` | required for binary uploads | Internal scanner dispatch endpoint. |
| `MALWARE_SCANNER_CALLBACK_SECRET` | required secret for binary uploads | Bearer secret для dispatch и authenticated verdict callback. |

Все четыре required `S3_*` credential/endpoint fields должны присутствовать одновременно; иначе storage считается disabled. Scanner fields также включаются парой, иначе binary upload завершается fail-closed.

## 3. Пошаговый rollout и оценка

Оценки — engineering hours для одного environment после выбора provider; procurement, ожидание DNS и security approval не включены.

| Шаг | Работа и проверяемый результат | Оценка |
| --- | --- | ---: |
| 1. Provider decision | Выбрать provider/region, data residency, retention и cost limits; записать owner и решение без утверждений о ещё не проверенном runtime. | 2–4 ч |
| 2. Private bucket | Создать private bucket, запретить public access, включить encryption/versioning/lifecycle согласно policy. | 2–4 ч |
| 3. Least-privilege identity | Создать отдельные credentials только для нужного bucket и команд `Get/Put/Head/Copy/Delete/List/Multipart`; сохранить secrets в deployment platform. | 2–3 ч |
| 4. API configuration | Задать environment inventory из раздела 2, deploy и подтвердить `storage: ok` в readiness. Не считать `storage: disabled` успешным storage rollout. | 1–2 ч |
| 5. Browser origin и CORS | Если используется direct multipart, разрешить нужным Web origins `PUT`, разрешить request headers и expose `ETag`; проверить preflight и загрузку каждой части. | 2–4 ч |
| 6. Scanner | Deploy/connect scanner, сгенерировать callback secret, ограничить network access, проверить timeout и authenticated callback. | 4–8 ч |
| 7. Functional smoke | Проверить buffered upload, multipart upload, download attachment, inline logo/photo, delete, tenant isolation, clean/infected/error verdicts. | 4–6 ч |
| 8. Cleanup scheduling | Запланировать orphan и expired-multipart commands сначала в dry-run, затем с execute; настроить logs/alerts и documented owner. | 2–4 ч |
| 9. Recovery and observability | Согласовать DB/object recovery point, проверить metrics/logs/alerts, выполнить restore drill или зафиксировать принятый gap. | 4–8 ч |
| 10. Evidence and handoff | Записать timestamp, environment, deployment reference, smoke results и cleanup schedule в operational docs. Secrets и signed URLs не прикладывать. | 1–2 ч |
| **Итого** | Без внешнего ожидания и исправления provider-specific defects. | **24–45 ч** |

## 4. Обязательные acceptance checks

- Readiness вызывает bucket-level check и возвращает `storage: ok`.
- Bucket остаётся private; object нельзя прочитать без authorized application flow/presigned URL.
- Buffered файл `<= 8 MiB` проходит validation, quarantine и clean promotion.
- Multipart файл `> 8 MiB` загружается browser client, все ответы на parts предоставляют читаемый `ETag`.
- Declared/factual size mismatch, invalid MIME/content и unsafe archive отклоняются.
- Infected, scanner error, timeout и missing scanner configuration не делают object available.
- Cross-tenant material/download/upload access отклоняется.
- Download URL истекает не позднее пяти минут и использует attachment-safe response.
- Delete очищает normal/quarantine object и metadata; повторные/частичные failures наблюдаемы.
- Cleanup сначала подтверждён dry-run output, затем scheduled execute run; известны owner и last-run evidence.
- DB metadata и bucket recovery рассматриваются вместе в backup/restore procedure.

## 5. Rollback

1. Остановить новые binary uploads на application/deployment уровне, сохранив link materials.
2. Не удалять bucket и credentials, пока не завершены активные multipart/scanner operations и reconciliation.
3. Откатить application deployment/config; проверить, что existing authorized downloads имеют ожидаемое поведение.
4. Запустить cleanup только после dry-run review; не использовать cleanup как механизм rollback.
5. Зафиксировать затронутые material IDs/object keys и выполнить DB/bucket reconciliation без публикации secrets.

## 6. Необходимые будущие изменения кода

На момент аудита обязательных storage methods со статусом `stub` или `missing` нет. Code change нужен только если выбранный provider не выполняет current S3 contract либо smoke выявит defect. Deployment automation для schedules, provider resources и secrets остаётся отдельной infrastructure задачей; до её выполнения эти пункты имеют статус `LIVE-VERIFY`, а не `implemented in production`.

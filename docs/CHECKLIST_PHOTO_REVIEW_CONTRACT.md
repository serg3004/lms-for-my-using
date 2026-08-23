# Checklist photo review contract

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать источник истины для photo evidence и правила безопасного просмотра доказательства reviewer'ом.

## 1. Source of truth

Checklist photo evidence считается прикреплённым только по storage-backed metadata, созданным object-backed upload flow.

На backend канонический признак — `photoObjectKey`. Browser API намеренно не раскрывает object key; UI использует возвращаемый `photoFileName` как публичный признак наличия object-backed evidence.

Legacy `photoUrl` сохраняется для обратной совместимости данных и API, но **не определяет**, прикреплено ли доказательство. Значение `photoUrl` без storage-backed metadata не удовлетворяет `photoRequired` и не должно скрывать предупреждение reviewer'а.

## 2. Reviewer UX

Для каждого результата reviewer видит:

- текст пункта;
- required/optional status;
- photo-required status;
- ответ или scale level;
- баллы;
- комментарий learner'а;
- существующий review comment;
- состояние evidence;
- Approve/Reject и review comment input.

Если object-backed evidence существует, UI показывает имя файла и действие `Open photo`.

`Open photo` не строит storage URL в браузере. UI запрашивает временный URL через защищённый endpoint:

`GET /api/v1/checklist-instances/:instanceId/items/:itemId/photo`

После успешного ответа reviewer получает thumbnail/link на временный presigned URL. Ошибка получения URL показывается как безопасная ошибка с возможностью повторить запрос. Временный URL может истечь; повторный запрос получает новый URL.

Если submitted instance содержит required photo item без object-backed evidence, reviewer UI явно помечает пункт как проблемный, а не считает legacy `photoUrl` достаточным.

## 3. Access control

Photo download сохраняет organization isolation и learner ownership.

Reviewer roles определяются `checklistReviewWrite`. Manager без admin role дополнительно ограничен существующим `ManagerTeamScope` на checklist instance operations:

- pending-review queue содержит только пользователей из управляемой команды;
- прямой instance read вне managed team возвращает `404`;
- privileged answer submission вне managed team возвращает `404`;
- privileged photo upload вне managed team возвращает `404` до записи объекта;
- photo download вне managed team возвращает `404`;
- review action вне managed team возвращает `404`.

Admin, instructor и mentor сохраняют существующий organization-level reviewer scope. Learner сохраняет ownership-проверку собственного instance/evidence.

Отсутствующее object-backed evidence возвращает `404` и не приводит к раскрытию storage metadata.

## 4. Security properties

- browser не получает `photoObjectKey`;
- browser не конструирует storage URL;
- presigned URL выдаётся только после проверки API access;
- legacy `photoUrl` не используется как authorization/evidence signal;
- cross-organization instance не раскрывается;
- manager не может читать, изменять или review checklist instance вне managed team;
- learner не может получить evidence другого learner'а.

## 5. Проверки

Regression coverage должна подтверждать:

1. `photoUrl=null` + `photoFileName` распознаётся как evidence;
2. legacy `photoUrl` без `photoFileName` не распознаётся как evidence;
3. required item без evidence помечается reviewer'у;
4. reviewer получает temporary URL только через API;
5. no-evidence и foreign-organization access возвращают safe `404`;
6. learner ownership сохраняется;
7. manager team scope применяется к queue и прямым instance operations;
8. reviewer UI показывает имя evidence, открытие фото и retry при ошибке temporary URL;
9. browser flow покрывает learner answer/upload и instructor evidence open/approve.

## 6. Не входит

PR 219 не меняет storage provider, upload pipeline, schema БД, legacy `photoUrl` field, deadline lifecycle, bulk assignments или analytics workflow.

Связанный completion contract: `docs/CHECKLIST_COMPLETION_CONTRACT.md`.

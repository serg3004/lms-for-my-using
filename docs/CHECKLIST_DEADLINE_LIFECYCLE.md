# Checklist deadline lifecycle

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать серверный контракт срока выполнения checklist assignment и фоновое истечение просроченных заданий.

## 1. Lifecycle

`ChecklistInstance.dueAt` хранится как `timestamptz` и передаётся через API как ISO datetime. `null` означает, что assignment не имеет срока и автоматически не истекает.

Сервер применяет следующие правила:

- `assigned` + `dueAt <= now` → `expired`;
- `in_progress` + `dueAt <= now` → `expired`;
- `submitted` не истекает: отправленную вовремя работу можно review после дедлайна;
- `completed` не меняется;
- `expired` является terminal state и не возвращается в `assigned`, `in_progress`, `submitted` или `completed`.

Граница дедлайна включительная: при `dueAt === now` изменение уже запрещено.

## 2. Write-time correctness

Фоновый worker не является источником бизнес-корректности. Перед изменением item result и перед записью photo evidence backend проверяет фактический `dueAt`.

Если active instance уже просрочен, backend выполняет conditional tenant-scoped update только для `assigned`/`in_progress` с `dueAt <= now`, переводит запись в `expired` и отклоняет mutation с сообщением `This checklist assignment has expired`.

Photo upload выполняет preflight-проверку до записи объекта. После upload `attachItemPhoto` повторно проверяет deadline; если между проверками срок истёк или последующее сохранение не удалось, только что загруженный объект удаляется best-effort и mutation отклоняется.

`recomputeInstance` также проверяет deadline и выполняет conditional update, который не может перезаписать уже установленный `expired`. Это закрывает race между worker и пользовательской записью.

## 3. Read consistency

Learner и admin list/read endpoints обновляют overdue active instances перед формированием ответа, если обнаруживают `dueAt <= now`. Поэтому API не обязан ждать следующего фонового tick, чтобы показать `expired`.

Pending-review endpoint читает только `submitted`; такие instances по контракту не истекают.

## 4. Background worker

Используется существующий `BackgroundJobsService` и BullMQ backend. Новый queue/scheduler stack не добавляется.

Job:

- name: `checklists.expire-overdue`;
- scheduler id: `checklists-expire-overdue-v1`;
- interval: 60 секунд;
- batch size: 500;
- attempts: 3 с exponential backoff.

Worker выбирает только non-deleted `assigned`/`in_progress` rows с `dueAt <= now`, сортирует по `dueAt`, затем `id`, группирует выбранные ids по `organizationId` и выполняет tenant-scoped conditional `updateMany`. Повторный запуск безопасен: уже `expired`, `submitted` и `completed` больше не соответствуют query.

Recurring schedule регистрируется через BullMQ Job Scheduler (`upsertJobScheduler`) только в процессе, где `BACKGROUND_JOBS_RUN_WORKER=true`.

## 5. Индекс

Migration добавляет индекс:

`checklist_instances(status, due_at, organization_id)`

Он соответствует глобальному worker query: сначала отбираются active statuses и диапазон `due_at`, а `organization_id` сохраняется в индексе для tenant-scoped обработки выбранного batch.

Migration additive и не меняет существующие данные. Rollback индекса выполняется `DROP INDEX`, если откат действительно требуется; lifecycle columns/status уже существовали до PR 220.

## 6. Frontend и timezone

Admin задаёт optional deadline через `datetime-local`. Browser преобразует локальное значение в ISO UTC перед `POST /checklists/:checklistId/instances`.

API возвращает `dueAt` как ISO datetime, а browser форматирует его через локальную timezone пользователя. Learner/admin/reviewer используют один deadline helper для отображения due/due-soon/expired state.

Learner controls остаются editable только для `assigned`/`in_progress`; `expired` автоматически отключает answer/photo controls, а UI показывает причину и срок.

## 7. Проверки

Regression coverage должна подтверждать:

1. момент до дедлайна разрешён;
2. `dueAt === now` и `dueAt < now` истекают;
3. `dueAt=null` не истекает;
4. `submitted` и `completed` не изменяются worker'ом;
5. `expired` terminal и не оживает при recompute;
6. batch обрабатывает несколько организаций с явным tenant scope и повторный запуск даёт `0`;
7. recurring job регистрируется через существующий background-jobs backend;
8. database migration действительно создаёт overdue-query index;
9. frontend helper преобразует local datetime в ISO UTC и отображает lifecycle states.

Тесты времени используют фиксированный `now` и не используют `sleep`.

## 8. Не входит

PR 220 не добавляет reminder/escalation notifications, массовые assignment flows, новые checklist status values или отдельный scheduler service.

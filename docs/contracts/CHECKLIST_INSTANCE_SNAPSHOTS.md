# Checklist instance snapshots

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать неизменяемый контракт checklist assignment после назначения пользователю.

## 1. Основной принцип

`Checklist` остаётся mutable authoring resource: опубликованный шаблон можно изменять для будущих назначений.

`ChecklistInstance` является historical assignment. При создании instance backend сохраняет versioned snapshot бизнес-конфигурации шаблона. После этого изменения live `Checklist` и `ChecklistItem` не меняют содержимое, требования или scoring уже выданного задания.

## 2. Snapshot version 1

В `ChecklistInstance` хранятся внутренние поля:

- `templateSnapshot` — JSON snapshot;
- `snapshotVersion` — версия формата snapshot, сейчас `1`.

Snapshot v1 содержит:

- checklist `id`, `organizationId`, `title`, `description`, `status`;
- `scoringMode`, `passThreshold`, `scaleLevels`, `requiresReview`;
- ordered items с original `id`, `checklistId`, `text`, `points`, `isRequired`, `photoRequired`.

Snapshot не является новым публичным API object. HTTP contract продолжает возвращать существующий `instance.checklist`; service наполняет его snapshot-данными для historical instance.

## 3. Runtime contract

Для instance со snapshot backend использует snapshot как source of truth при:

- выдаче instance/list responses;
- проверке доступности item для ответа;
- вычислении points для нового ответа;
- проверке required/photo completion rules;
- вычислении `maxScore`, `percentage`, pass threshold;
- определении `requiresReview` и completion status.

Live template не должен участвовать в этих вычислениях после назначения.

`ChecklistItemResult.itemId` продолжает хранить original item id. Item rows используют soft delete, поэтому существующий FK contract не меняется.

## 4. Изменения шаблона

После назначения можно изменить live template, например:

- title/description;
- points;
- `isRequired` / `photoRequired`;
- scoring mode/scale levels;
- pass threshold;
- набор items.

Existing instances продолжают использовать snapshot момента assignment. New instances получают новую конфигурацию.

Полноценный UI истории версий, compare/rollback и именованные template revisions не входят в текущий scope.

## 5. Legacy instances и migration

До внедрения snapshots историческая версия template не сохранялась. Поэтому точное исходное состояние старого assignment восстановить невозможно, если template уже менялся.

Migration выполняет **best-effort backfill**: для существующих instances сохраняется текущее на момент migration состояние checklist и его non-deleted items. Это compatibility baseline, а не доказательство исторической точности.

Поля snapshot остаются nullable для rolling-deploy compatibility. Если instance без snapshot будет создан старой версией приложения во время deployment window, новая версия backend использует current live template как legacy fallback. Все assignments, создаваемые новой версией backend, всегда получают snapshot v1.

Malformed snapshot или неизвестная non-null версия не должны молча переключаться на live template: backend fail-closed отклоняет такой instance как unsupported/invalid snapshot.

## 6. Rollback и совместимость

Изменение БД additive:

- старый application code игнорирует новые nullable columns;
- новый application code умеет читать legacy rows без snapshot;
- удалять snapshot columns при rollback не требуется и не рекомендуется, поскольку это уничтожит historical assignment data.

Public checklist instance response сохраняет прежнюю форму; новые internal storage fields намеренно не экспортируются клиентам.

## 7. Проверки

Обязательный regression scenario:

1. создать/publish checklist;
2. назначить пользователю;
3. изменить live title, threshold, item text/points/photo requirement и добавить item;
4. убедиться, что старый instance продолжает показывать и считать исходную конфигурацию;
5. завершить старый instance по исходным правилам;
6. назначить checklist повторно;
7. убедиться, что новый instance получает изменённую конфигурацию.

Database integration test также проверяет наличие `snapshotVersion=1` и persisted `templateSnapshot`.

## 8. Связанные документы

- `docs/CHECKLIST_COMPLETION_CONTRACT.md`
- `docs/DEVELOPMENT_PLAN.md` — PR 218

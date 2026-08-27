# Checklist completion contract

> **Статус:** `CURRENT`
>
> **Назначение:** зафиксировать runtime-семантику завершения checklist instance для `isRequired`, `photoRequired` и manual review.

## 1. Термины

- **Required item** — пункт с `isRequired=true`; он обязан быть выполнен до `submitted/completed`.
- **Optional item** — пункт с `isRequired=false`; его можно полностью пропустить.
- **Valid answer** — для `sum_points` и `all_required` это `checked=true`, для `scale` — выбранный допустимый scale level.
- **Evidence** — фото, сохранённое через object-backed upload flow. На backend source of truth — `photoObjectKey`; legacy `photoUrl` не удовлетворяет `photoRequired`.
- **Satisfied item** — пункт с valid answer и, если `photoRequired=true`, с прикреплённым evidence.

## 2. Completion rules

1. Каждый required item должен быть `satisfied`.
2. Optional item без ответа не блокирует завершение.
3. Если optional item получил valid answer и у него `photoRequired=true`, он становится начатым и требует evidence до завершения instance.
4. Сохранённый `checked=false` в checkbox-based scoring не считается valid answer.
5. Для `scale` valid answer существует только при выбранном допустимом уровне.
6. `photoRequired=true` проверяется по object-backed photo metadata.
7. После загрузки evidence backend повторно пересчитывает instance, поэтому фото последнего required item может выполнить переход `in_progress → completed` либо `in_progress → submitted`.

## 3. Manual review

Если `requiresReview=false`, удовлетворение completion requirements переводит instance в `completed`.

Если `requiresReview=true`, удовлетворение completion requirements переводит instance с reviewable answers в `submitted`. После обработки reviewable results instance переходит в `completed`.

Reviewer не должен получать новый `submitted` instance, в котором отсутствует обязательное evidence.

## 4. Scoring

PR 217 изменяет только completion eligibility. Формулы `totalScore`, `maxScore`, `percentage` и pass threshold сохраняют существующую semantics.

В частности, optional items по-прежнему входят в текущий `maxScore`; пропущенный optional item может снизить итоговый percentage, но сам по себе не блокирует completion.

Изменение scoring semantics требует отдельного решения и не входит в этот контракт.

## 5. UI contract

Learner UI:

- показывает required/optional status пункта;
- считает progress по выполненным required items;
- не показывает пункт завершённым, если valid answer есть, но required photo отсутствует.

Admin preview использует те же completion rules и отдельно симулирует наличие required photo. Builder предоставляет явные настройки `Required item` и `Photo required`.

## 6. Не входит

Этот контракт не определяет:

- immutable/versioned assignment snapshots;
- deadline/expiration lifecycle;
- bulk assignment;
- reviewer routing;
- analytics и audit trail.

Эти изменения запланированы отдельными PR после checklist completion correctness.

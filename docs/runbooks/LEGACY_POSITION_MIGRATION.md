# Legacy `User.position` migration (PR 276)

> **Статус:** `CURRENT`
>
> **Назначение:** описать, как безопасно перенести существующие строковые `User.position` в
> tenant-scoped каталог `Position`/`DepartmentMembership.positionId` (PR 275), и rollback/
> forward-fix для этой операции.
>
> **Проверено по `main`:** `f8df830f9514cd9f057bfceaeac66507c708729a` (2026-08-30).

## 1. Зачем и что не делается автоматически

`User.position` — старое свободнотекстовое поле. `Position` (PR 275) — новый, нормализованный,
tenant-scoped каталог должностей с `UNIQUE(organizationId, code)`, привязанный к
`DepartmentMembership.positionId`. Эта миграция — мост между ними, но **не автоматическое
угадывание**: одинаковые по смыслу, но по-разному написанные строки (`"Senior Dev"` vs
`"Senior Developer"`) никогда не объединяются алгоритмически. Каждое сопоставление
`legacy-значение -> Position code` — explicit решение человека.

`User.position` при этом **не удаляется и не изменяется** ни на одном шаге — источник истины
для отчётности "что было" сохраняется независимо от прогресса миграции.

## 2. Инструменты

Оба — CLI-скрипты, без HTTP-эндпоинта (как `session:cleanup`, `storage:cleanup`):

```bash
pnpm --filter @lms/api positions:legacy-inventory [--organization=<organizationId>]
pnpm --filter @lms/api positions:migrate-legacy [--organization=<organizationId>] [--apply]
```

`positions:legacy-inventory` — read-only отчёт: все различные (после trim + Unicode NFC +
case-fold нормализации только для группировки, не для склейки *похожих* строк) значения
`User.position`, их исходные написания (`rawVariants`), количество пользователей по каждой
организации, и текущий статус (`mapped` / `skip` / `unresolved` / `ambiguous`) относительно
файла `apps/api/src/scripts/migrate-legacy-positions.mapping.ts`.

`positions:migrate-legacy` без `--apply` — **dry-run** (по умолчанию, ничего не пишет).
С `--apply` — реально проставляет `DepartmentMembership.positionId`.

Оба выводят JSON-отчёт в stdout.

## 3. Explicit mapping

`apps/api/src/scripts/migrate-legacy-positions.mapping.ts` — единственное место, где задаётся
соответствие. Формат:

```ts
export const legacyPositionMapping: LegacyPositionMappingEntry[] = [
  { legacyValue: 'Senior Developer', action: 'map', positionCode: 'senior-developer' },
  { legacyValue: 'N/A', action: 'skip', reason: 'placeholder value, not a real position title' },
];
```

- `action: 'map'` — сопоставить с Position по `code` (Position уже должен существовать в
  организации — создать его заранее через `/admin/positions` или `POST /positions`; этот
  скрипт **никогда не создаёт Position**, только читает).
- `action: 'skip'` — явное решение "не мигрировать это значение" (с обязательной `reason`),
  чтобы отличать "мы ещё не решили" (`unresolved`) от "мы решили не переносить" (`skipped`).
- Значение без записи в mapping остаётся `unresolved` — не ошибка, а видимый факт для отчёта.
- Два конфликтующих entry на одну нормализованную строку (разные `positionCode`, или одна и
  та же строка одновременно `map` и `skip`) — `ambiguous`; ни одно не применяется, пока
  конфликт не устранён вручную.

## 4. Правила применения (per user)

Для каждого пользователя с непустым `User.position`:

1. Нормализованное значение ищется в mapping. Нет записи → `unresolved` (`no_mapping_entry`).
2. Запись `skip` → `skipped`.
3. Конфликтующие записи → `ambiguous`.
4. Запись `map`, но такого `code` нет в **этой** организации → `unresolved`
   (`position_code_not_found_in_organization`) — разные организации могут не иметь
   одинакового каталога должностей, это ожидаемо, не ошибка конфигурации.
5. Position с этим `code` архивирован → `unresolved` (`position_archived`) — архивную
   Position нельзя вновь назначить на relation (тот же инвариант, что в PR 275 для
   `createMembership`/`transferPrimaryDepartment`/`bulkTransfer`).
6. У пользователя нет текущего primary `DepartmentMembership` → `unresolved`
   (`no_current_primary_membership`). **Membership для него не создаётся** — задача этой
   миграции — заполнить существующую связь, а не изобретать оргструктуру пользователю,
   которого в ней нет.
7. Membership уже указывает на нужный Position → `mapped`, `alreadyApplied: true`, ничего не
   пишется (идемпотентность).
8. Membership уже указывает на **другой** Position (кто-то уже назначил его вручную через UI
   после PR 275) → `skipped` (`membership_already_has_a_different_position`) — миграция
   никогда не перезаписывает уже сделанное explicit-решение.
9. Иначе (membership без Position) → при `--apply` проставляется `positionId`, пишется
   `OrgStructureEvent` (`department_membership.legacy_position_migrated`) в той же транзакции.

## 5. Идемпотентность

Повторный `--apply` с тем же mapping:
- не создаёт вторую запись `OrgStructureEvent` для уже мигрированной membership (шаг 7 выше —
  no-op при совпадении);
- не создаёт Position (скрипт их не создаёт вообще);
- не меняет membership, уже несущую другой Position (шаг 8).

Проверено `apps/api/src/integration/legacy-position-migration.database.spec.ts` против
реального Postgres: apply → повторный apply → идентичный набор событий, идентичное состояние.

## 6. Порядок операций (recommended workflow)

1. `pnpm --filter @lms/api positions:legacy-inventory` — снять полный inventory по всем
   организациям (или `--organization=<id>` по одной).
2. Для каждой организации создать нужные `Position` (code+title) через admin UI/API, если их
   ещё нет — руководствуясь `rawVariants`/`totalUsers` из отчёта.
3. Дополнить `migrate-legacy-positions.mapping.ts` explicit-записями `map`/`skip` для
   значений, которые администратор готов классифицировать; оставить остальные без записи.
4. `pnpm --filter @lms/api positions:migrate-legacy` (dry-run) — проверить итоговые счётчики
   (`mapped`/`unresolved`/`ambiguous`/`skipped`) прежде чем писать.
5. `pnpm --filter @lms/api positions:migrate-legacy --apply` — применить.
6. `pnpm --filter @lms/api positions:migrate-legacy` (снова без `--apply`) сразу после apply —
   это и есть validation report: тот же прогон должен показать `alreadyApplied: true` для
   каждого только что мигрированного пользователя и без новых `unresolved`/`ambiguous`
   относительно шага 4.
7. Повторить шаги 3-6 по мере того, как появляются новые explicit-решения по `unresolved`
   значениям — процесс инкрементальный, не одноразовый big-bang.

## 7. Rollback / forward-fix

Это не schema-миграция (Prisma schema не менялась в PR 276 — `DepartmentMembership.positionId`
уже существовал с PR 275), поэтому классического "миграция БД, которую нужно откатывать" нет.
Откат — это откат **данных**, а не схемы:

- **Откатить конкретное присвоение** — обычный `PATCH` через уже существующий API
  (`department-memberships`/transfer) или прямой апдейт `positionId = NULL` на конкретной
  membership; никакого специального rollback-скрипта не требуется, т.к. затронутое поле —
  обычная nullable-колонка без побочных эффектов на другие таблицы.
- **Откатить весь прогон** — каждое применённое присвоение оставляет
  `OrgStructureEvent(eventType: 'department_membership.legacy_position_migrated')` с
  `metadata: { userId, legacyValue, positionCode }` и `operationId`; это полный аудиторский
  след для forward-fix (найти все затронутые membership по `eventType` + временному диапазону
  и точечно поправить/обнулить `positionId`).
- **`User.position` не трогается на всех этапах** — при любой ошибке маппинга исходные данные
  никогда не теряются, повторный (исправленный) прогон миграции всегда можно запустить заново
  с нуля для конкретной организации.

Отдельный data backfill или backup сверх общей policy (`MIGRATION_BACKUP_POLICY.md`) не
требуется — эта операция не меняет схему и не создаёт новых таблиц.

## Связанные документы

- [`docs/product/future/ORG_STRUCTURE_IMPLEMENTATION_PLAN.md`](../product/future/ORG_STRUCTURE_IMPLEMENTATION_PLAN.md) — PR 275/276/277 план.
- [`docs/runbooks/MIGRATION_BACKUP_POLICY.md`](./MIGRATION_BACKUP_POLICY.md) — общая схема-миграция policy.

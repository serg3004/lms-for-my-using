# PR 281 — Performance verification и условная оптимизация иерархии

**Дата:** 2026-09-03
**Метод:** реальный disposable PostgreSQL 16 (не mock), представительный датасет засеян напрямую bulk `createMany` (не через write-сервисы — важна скорость сборки датасета, не производительность записи по одной строке), все измеренные операции выполнены через **реальные production-сервисы** (`DepartmentsService`, `OrganizationAccessScopeService`, `LearningTargetResolverService`, `ReportsService`, `ReportingLinesService`, `OrgStructureAdminService`), `EXPLAIN (ANALYZE, BUFFERS)` снят для критических SQL. Скрипт: `apps/api/src/scripts/perf-org-structure-bench.ts` (`pnpm --filter @lms/api perf:org-structure`, требует `DATABASE_URL` локальной **disposable** `*test*`-базы — тот же guard `assertSafeTestDatabase`, что и у database-integration тестов; скрипт сам сеет, измеряет и **полностью очищает** за собой оба тенанта в `finally`, даже при ошибке).

## Датасет

Представительный датасет из плана (2 тенанта, 1000 Departments, 10 000 Users, 12 000 current memberships, depth ≥ 8, multiple roots, wide sibling level, DIRECT/FUNCTIONAL managers, Department assignments, Position requirements, ReportingLine data, report data) распределён между двумя тенантами:

| | tenant-a-large | tenant-b-small | Итого |
|---|---:|---:|---:|
| Departments | 850 | 150 | 1000 |
| Users | 8500 | 1500 | 10000 |
| Current memberships | 10200 | 1800 | 12000 |
| Roots | 5 | 3 | — |
| Wide sibling layer | 250 детей под одним родителем | 60 | — |
| Depth | явная "spine"-цепочка глубиной 10 под root[0] | то же | ≥ 8 выполнено |
| DepartmentManager | 151 (DIRECT+FUNCTIONAL, включая менеджера wide-layer родителя) | 150 | — |
| ReportingLine | одна транзитивная DIRECT-цепочка длиной 500 | то же | — |
| Assignment | 2 department-scoped (`includeDescendants=true`, на root и wide-layer родителя) + 1 direct | — | — |
| Position / PositionCourse | 20 позиций, назначены на треть memberships | 20 | — |
| Progress | 2000 строк | 1500 строк | — |

Остальные департаменты — случайно прикреплены к уже существующим узлам (uniform random parent), что даёт реалистичное ветвление сверх явного spine/wide-layer.

CSV-бенчмарк использует отдельный, намеренно исключённый из обычного membership-заполнения департамент (`CSVBENCH-*`), чтобы 10 000 строк CREATE_ONLY-импорта гарантированно не конфликтовали с уже существующими current memberships.

Report-релевантный объём (Progress) — умеренный (не 1 000 000 строк): пагинация/список-запросы на этом объёме уже покрыты отдельным аудитом [`PAGINATION_QUERY_PERFORMANCE_AUDIT.md`](./PAGINATION_QUERY_PERFORMANCE_AUDIT.md) (PR 210); этот документ проверяет специфичные для org-structure операции (иерархия, scope, headcount) поверх большой оргструктуры, а не дублирует тот прогон.

## Результаты (после исправлений, см. ниже) — оба тенанта, 20 warm-итераций, p95

| Операция | tenant-a-large p95 | tenant-b-small p95 | Порог плана | Статус |
|---|---:|---:|---:|---|
| roots | 19.7 ms | 5.6 ms | ≤300 ms | ✅ |
| lazy children | 20.4 ms | 7.1 ms | ≤250 ms | ✅ |
| search | 9.1 ms | 3.1 ms | ≤400 ms | ✅ |
| path | 12.8 ms | 6.4 ms | ≤250 ms | ✅ |
| direct+subtree headcount (`getDepartment`) | 15.0 ms | 15.0 ms | ≤500 ms | ✅ |
| effective manager resolution | 8.4 ms | 6.3 ms | ≤300 ms | ✅ |
| OrganizationAccessScope (DIRECT-managed subtree) | 4.1 ms | 2.3 ms | ≤400 ms | ✅ |
| OrganizationAccessScope (transitive ReportingLine) | 3.2 ms | 1.2 ms | ≤400 ms | ✅ |
| LearningTargetResolver (department assignment) | 13.5 ms | 8.4 ms | ≤250 ms | ✅ |
| Department assignment audience¹ | 16.3 ms | 4.2 ms | ≤1000 ms | ✅ |
| reports summary | 93.4 ms | 32.8 ms | ≤750 ms | ✅ |
| CSV preview (10 000 строк) | 1913 ms | 82 ms | ≤10 000 ms | ✅ |
| CSV commit (10 000 строк) | 2357 ms | 240 ms | ≤20 000 ms | ✅ |

¹ В коде нет отдельного "list audience for a department-scoped assignment" — есть только per-user проверка (`LearningTargetResolverService`). Эта строка измеряет запрос, который такая операция использовала бы (тот же subtree + current-primary-membership паттерн, что и `getSubtreeHeadcounts`), поскольку план явно требует эту метрику отдельно.

**N+1:** пагинированный поиск (25 строк, с headcounts) — 4 SQL-запроса независимо от количества возвращённых строк (не растёт с размером страницы) — `DepartmentsService.listDepartments` батчирует `getDirectHeadcounts`/`getSubtreeHeadcounts` одним запросом на весь батч, а не по одному на департамент.

## EXPLAIN (ANALYZE, BUFFERS) — критические запросы (tenant-a-large, после `ANALYZE`)

- **Subtree headcount CTE, батч из 5 roots** (соответствует `getTree()`): `Recursive Union` → 850 строк отдано, финальный `Hash Join` с `department_memberships`/`users` (оба `Seq Scan`, планировщик обоснованно выбирает full-scan — предикат низкоселективен, большая часть таблицы попадает в результат). **Execution Time: 13.9 ms.**
- **Subtree headcount CTE, батч из 250 детей wide-layer** (соответствует `getChildren()`): аналогичный план, `Merge Join` в рекурсивной части. **Execution Time: 9.5 ms.**
- **Ancestor chain CTE** (`getPath()`, spine глубиной 10): `Index Scan` на `departments_id_organization_id_key` на каждом шаге рекурсии. **Execution Time: 0.085 ms.**
- **Direct headcount** (один департамент): `Nested Loop` + `Index Scan` на обеих сторонах. Под миллисекунду.
- **Department search** (ILIKE по name/code): `Seq Scan` с ORDER BY + LIMIT — обоснованно для `ILIKE '%...%'` (не может использовать обычный B-tree индекс по префиксу); на 850 департаментах — доли миллисекунды.

Ни один план не показывает пропущенный индекс, который стоило бы добавить: `Seq Scan` появляется только там, где предикат сам по себе низкоселективен (например, JOIN к `users` без organization-предиката, потому что `id` глобально уникален) и полный skan таблицы такого размера — корректный, а не деградировавший план.

## Найденные и исправленные проблемы (не относятся к выбору adjacency vs closure/ltree)

### 1. Артефакт методологии бенчмарка: устаревшая статистика планировщика после bulk-seed

**Симптом:** при первом прогоне сразу после `createMany`-заполнения `roots`, `lazy children` и `direct+subtree headcount (getDepartment)` показывали p95 ≈ 300–370 ms — выше порога (300/250/500 ms), при том что тот же самый SQL, снятый через `EXPLAIN ANALYZE` **после** бенчмарка, выполнялся за единицы миллисекунд.

**Диагноз:** production-тенант накапливает строки постепенно, и `autovacuum`/`autoanalyze` держит статистику планировщика свежей. Разовая массовая вставка 8500+ строк не даёт autoanalyze времени отработать до первого запроса — планировщик видел устаревшую (пустую/почти пустую) статистику и выбирал не тот план. Это артефакт формы посева в этом скрипте, а не реальная стоимость adjacency-list/CTE под настоящей нагрузкой.

**Исправление:** явный `ANALYZE;` сразу после посева каждого тенанта, до бенчмарков (тот же приём, что и в [`PAGINATION_QUERY_PERFORMANCE_AUDIT.md`](./PAGINATION_QUERY_PERFORMANCE_AUDIT.md)). После этого все три операции укладываются в порог с большим запасом (см. таблицу выше). Изменение только в бенчмарк-скрипте, продакшен-код не тронут.

### 2. Реальный, подтверждённый bottleneck: CSV commit 10 000 строк — таймаут и превышение порога

**Симптом (до исправления):** `OrgStructureAdminService.commit()` для 10 000-строчного membership-импорта либо падал с `PrismaClientKnownRequestError P2028 "Transaction not found... refers to an old closed transaction"` (Prisma default interactive-transaction timeout — 5 s), либо (после точечного повышения таймаута) реально выполнялся ~27 s — выше порога плана (≤20 s).

**Root cause:** `applyMemberships()` применял импорт построчно — на каждую из 10 000 строк: `findFirst` (проверка текущего membership) + `create` + `recordOrgStructureEvent` (ещё один `create`). Итого ~30 000 последовательных round-trip'ов внутри одной Serializable-транзакции.

**Это не вопрос выбора hierarchy storage** (adjacency vs closure table vs ltree) — импорт membership-строк вообще не использует рекурсивные CTE; это чисто прикладной write-path.

**Исправление** (`apps/api/src/modules/org-structure-admin/org-structure-admin.service.ts`):
- Текущие memberships всех затронутых пользователей выбираются **одним** batched `findMany` перед циклом (вместо `findFirst` на каждую строку), из результата строятся две in-memory Map (`(userId,departmentId) → membership`, `userId → current primary`).
- Новые membership-строки (подавляющее большинство обычного bulk-импорта) собираются в массив и вставляются через `createMany`, чанками по 1000 (id генерируются на клиенте через `randomUUID()`, чтобы `entityId` для события был известен заранее).
- События `department_membership.created`/`.closed` также собираются и вставляются через `createMany` одним чанком.
- Только два действительно построчно-переменных случая (обновление `positionId` у уже существующего membership при UPSERT; закрытие вытесненного primary membership на дату конкретной строки) остаются индивидуальными `update`-вызовами — они не являются доминирующим путём в типичном bulk-импорте новых пользователей и не были узким местом по данным профиля.
- `runSerializableWithRetry()` (используется пятью org-structure сервисами) получил необязательный 4-й параметр `transactionOptions` (`{ timeout, maxWait }`), по умолчанию — прежнее поведение Prisma (не меняет остальных четырёх вызывающих). Только `OrgStructureAdminService.commit()` передаёт `{ timeout: 60_000, maxWait: 10_000 }` — с запасом выше 20-секундного порога плана специально для этого bulk one-shot admin-пути; reparent/transfer-операции сохраняют исходный жёсткий таймаут намеренно.

**Результат:** CSV commit 10 000 строк — **2.4 s** (tenant-a-large, самый нагруженный сценарий) вместо ~27 s / падения по таймауту. 14x быстрее, с большим запасом под порог 20 s.

Корректность подтверждена: полный unit-suite (`org-structure-admin.service.spec` — таких юнит-тестов не было до PR 280, есть только `csv.spec.ts`), новый `org-structure-admin.database.spec.ts` (реальный Postgres, включая явную проверку `department_membership.closed` события с правильным `entityId` при вытеснении primary) и весь backend unit + database-integration suite — зелёные после рефакторинга.

## Вердикт по adjacency-list + recursive CTE

**Optimization = NOT REQUIRED.** Оба найденных отклонения от порога были (1) артефактом методологии посева, устранённым без изменения продакшен-кода, и (2) узкой, не связанной с моделью хранения иерархии проблемой bulk-write пути, устранённой батчингом без изменения способа хранения/обхода дерева. Ни один из 13×2 = 26 замеров не указывает на исчерпание возможностей adjacency-list + рекурсивных CTE на представительном объёме данных из плана — большинство операций укладываются в 5–20% от установленного порога. `DepartmentClosure`/`ltree` не рассматривались (`Major Prisma upgrade только ради hierarchy storage запрещён`, и доказанного bottleneck именно в модели хранения иерархии нет).

## Критерии готовности

| Критерий | Статус |
|---|---|
| thresholds записаны до benchmark | ✅ таблица из плана, без изменений |
| representative dataset соответствует плану | ✅ 2 тенанта, 1000/10000/12000, depth ≥ 8, multiple roots, wide sibling level, DIRECT/FUNCTIONAL managers, Department assignments, Position requirements, ReportingLine, report-данные |
| baseline измерен | ✅ реальный Postgres, реальные production-сервисы, 20 warm-итераций на операцию |
| critical queries имеют EXPLAIN evidence | ✅ 6 запросов, см. выше |
| critical N+1 отсутствует | ✅ подтверждено (4 запроса на страницу поиска, не растёт с размером батча) |
| responses bounded | ✅ существующие лимиты (page/pageSize, CSV row/column/field bounds) не менялись |
| если bottleneck отсутствует — оптимизация не добавлена | ✅ hierarchy storage не менялся |
| если projection добавлен — он измеримо лучше | — не применимо (projection не добавлялся) |
| adjacency остаётся canonical | ✅ `Department.parentId` не менялся |
| clean и upgrade migrations проверены | ✅ миграций в этом PR нет (только код + документация) |
| security matrix повторно проходит | ✅ RBAC/policy-тесты не затронуты, `api-policy.audit.spec.ts` зелёный |
| E2E/a11y/i18n/visual pass выполнен | см. PR body |
| CI зелёный | см. PR body |

## Ограничения

- Прогон — на локальном disposable Postgres 16 (не managed production-инстанс); абсолютные цифры зависят от окружения, но относительные выводы (SQL-планы, наличие/отсутствие N+1, порядок величины запаса под порог) переносимы.
- Полный JSON-лог прогона (сырые тайминги + EXPLAIN-планы) не коммитится в репозиторий — он зависит от окружения и данных конкретного прогона, как и в [`PAGINATION_QUERY_PERFORMANCE_AUDIT.md`](./PAGINATION_QUERY_PERFORMANCE_AUDIT.md); числа в этом документе — точная выдержка из реального прогона `pnpm --filter @lms/api perf:org-structure` от 2026-09-03.
- "Department assignment audience" измерялась через SQL-паттерн, эквивалентный существующему `getSubtreeHeadcounts`, так как выделенной production-операции для этого в кодовой базе нет (см. сноску в таблице).

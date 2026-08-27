# Generated documentation

Этот каталог содержит deterministic source-derived inventories. Файлы генерируются командой `pnpm docs:generate` и не редактируются вручную.

Canonical owners остаются исходными source/runtime источниками:

- `API_INDEX.md` — compact index из runtime OpenAPI (`createOpenApiDocument`); authority остаётся `/api/v1/api-json`;
- `RBAC.md` — `rolePolicies` + проверка role set against shared `USER_ROLES` и Prisma `UserRole`;
- `MODULES.md` — direct imports `AppModule`;
- `ENTITIES.md` — Prisma DMMF.

Generated docs не входят в default AI reading path. Открывайте их только для API/RBAC/module/schema задач или для проверки generated drift. Human semantics, invariants и rationale остаются в `docs/contracts/`, `docs/architecture/` и других current manual docs.

## Troubleshooting generated drift

Если `pnpm docs:generate:check` сообщает stale generated documentation:

1. Не редактировать `API_INDEX.md`, `RBAC.md`, `MODULES.md` или `ENTITIES.md` вручную и не ослаблять checker ради зелёного CI.
2. Запустить `pnpm docs:generate`.
3. Проверить фактический результат через `git diff -- docs/generated`. Если локальный diff недоступен, использовать diff/annotation из CI; не угадывать исправление по одному сообщению `stale`.
4. Если diff неожиданный, пустой или выглядит partial, сверить canonical owner-source:
   - API → runtime OpenAPI + controllers;
   - DB entities/enums → Prisma schema;
   - RBAC → `rolePolicies`/guards/access metadata;
   - modules → `AppModule`.
5. Если owner-source корректен, закоммитить результат генератора. Если output остаётся неверным, пустым или partial, исправлять authoritative source/generator/checker по фактической причине, а не generated Markdown вручную.
6. Запустить `pnpm docs:generate:check` повторно.
7. Перед merge требуются idempotency, zero diff и зелёный CI.

`docs:generate:check` должен оставаться strict: stale generated state завершается non-zero и публикует фактический diff/diagnostic; clean state завершается успешно.

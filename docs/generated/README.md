# Generated documentation

Этот каталог содержит deterministic source-derived inventories. Файлы генерируются командой `pnpm docs:generate` и не редактируются вручную.

Canonical owners остаются исходными source/runtime источниками:

- `API_INDEX.md` — compact index из runtime OpenAPI (`createOpenApiDocument`); authority остаётся `/api/v1/api-json`;
- `RBAC.md` — `rolePolicies` + проверка role set against shared `USER_ROLES` и Prisma `UserRole`;
- `MODULES.md` — direct imports `AppModule`;
- `ENTITIES.md` — Prisma DMMF.

Generated docs не входят в default AI reading path. Открывайте их только для API/RBAC/module/schema задач или для проверки generated drift. Human semantics, invariants и rationale остаются в `docs/contracts/`, `docs/architecture/` и других current manual docs.

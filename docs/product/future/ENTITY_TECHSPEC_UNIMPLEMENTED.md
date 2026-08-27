# Future entity techspec snapshot — superseded

> **Статус:** `SUPERSEDED` на DOC-12 / `FUTURE`, non-authoritative.
>
> Этот путь сохранён как redirect для старой навигации. Снимок 2026-08-07 больше не должен использоваться как current role/schema/API assumption или как active-work tracker.

Original 99-entity concept draft смешивал future design ideas с тогдашними assumptions о существующих ролях и текущей модели данных. DOC-12 изолирует его как history, чтобы будущая продуктовая проработка начиналась с актуальных owner-sources, а не с frozen snapshot.

## Для новой future-работы

1. Создать/использовать canonical GitHub Issue/Project work item.
2. Сверить продуктовый scope с `docs/product/MVP_SCOPE_LOCK.md` и owner decision при необходимости через `docs/status/OPEN_DECISIONS.md`.
3. Сверить current implementation facts по canonical owners:
   - DB entities/enums → `apps/api/prisma/schema.prisma` / `docs/generated/ENTITIES.md`;
   - RBAC → `apps/api/src/modules/auth/roles.ts` / `docs/generated/RBAC.md`;
   - API surface → runtime OpenAPI/controllers / `docs/generated/API_INDEX.md`.
4. Не переносить role/schema/API assumptions из historical snapshot без rebaseline.

Historical pre-DOC-12 snapshot preserved byte-for-byte at `docs/archive/remediation/ENTITY_TECHSPEC_UNIMPLEMENTED_PRE_DOC12.md`.
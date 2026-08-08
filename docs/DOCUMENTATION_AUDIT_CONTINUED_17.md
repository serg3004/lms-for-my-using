# Продолжение аудита актуальности документации — часть 17

Основной файл `docs/DOCUMENTATION_AUDIT.md` содержит результаты №1–20. Продолжения `_CONTINUED.md`—`_CONTINUED_16.md` содержат результаты №21–36. Этот файл продолжает последовательный аудит с №37.

## Сводка продолжения

| № | Документ | Статус | Краткий итог |
|---:|---|---|---|
| 37 | `SHARED_IMPORT_POLICY.md` | ⚠️ В основном актуален, но требует уточнения enforcement/contract | ESLint реально блокирует root `@lms/shared` imports и CI lint зелёный; при этом package root всё ещё экспортируется, test aliases его сохраняют, explicit subpath сейчас только `types/api`, а rationale для `import type` сформулирован слишком широко |

---

## 37. `SHARED_IMPORT_POLICY.md`

**Статус:** ⚠️ в основном актуален. Центральное правило — не импортировать app code через barrel `@lms/shared`, а использовать explicit package subpaths — действительно существует и реально проверяется ESLint/CI. Однако документ немного переоценивает package-level enforcement и неточно объясняет риск type-only root imports.

### Проверено

- полный `docs/SHARED_IMPORT_POLICY.md`;
- `eslint.config.js`;
- `packages/shared/package.json`;
- `packages/shared/src/index.ts`;
- `packages/shared/src/types/api.ts`;
- `packages/shared/src/{constants,schemas,types}` inventory;
- `pnpm-workspace.yaml`;
- root `package.json`/Turbo lint orchestration;
- `apps/api/package.json`, `apps/web/package.json`, `apps/e2e/package.json`, `packages/shared/package.json` lint scripts;
- `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `apps/api/tsconfig.test.json`;
- current API Jest config as exposed by the latest merge diff;
- Git history introducing the root-import lint restriction (`d4bcbb381aed57594d64428ac5aa96570dd7839b`) and policy doc (`b58763eff368b17a237f0a169fae1654c59d3812`);
- previous audit HEAD CI #1321 / CodeQL #829;
- current `main` at PR #532.

### Подтверждённые факты

- `eslint.config.js` defines `no-restricted-imports` with exact restricted path `@lms/shared` and error message directing developers to explicit subpaths such as `@lms/shared/types/api`.
- Rule applies to global `**/*.{ts,tsx}` config, not just Web.
- Turbo root `lint` runs package lint scripts. API lints `src/**/*.ts`; Web lints `src/**/*.{ts,tsx}`; E2E lints its TS test/config trees; Shared lints `src/**/*.ts`.
- Previous audit HEAD based on current PR #532 main passed **CI #1321** and **CodeQL #829**. Because root imports are ESLint errors in linted TS/TSX, current checked code contains no lint-visible prohibited root imports.
- `packages/shared/package.json` exposes two package entry points:
  - root `.` → `src/index.ts` types / `dist/index.js` runtime;
  - `./types/api` → `src/types/api.ts` / `dist/types/api.js`.
- `packages/shared/src/index.ts` is a runtime-capable barrel. It re-exports `constants/locales`, `constants/roles`, `schemas/pagination.schema` and `types/api`.
- Shared package has runtime dependency `zod`; pagination schema is part of the root barrel.
- `@lms/shared/types/api` is genuinely type-only source: `ApiErrorDetail`, `ApiError`, `ApiErrorResponse`, `PaginatedResponse<T>` are all `export type` declarations.
- API and Web both declare `@lms/shared` as `workspace:*` dependency. E2E does not declare it.
- Workspace includes `apps/*` and `packages/*`, so API/Web/E2E/Shared are all normal pnpm workspaces.

### Несоответствия и уточнения

1. **Policy enforcement is ESLint-level, not package-level.** `packages/shared/package.json` still exports root `.`. Node/TypeScript package resolution therefore continues to recognize `@lms/shared`; the import is forbidden only when ESLint runs. The document says this accurately in one sentence (`blocked by ESLint`), but the opening imperative can be misread as package exports making root imports impossible.

2. **API test configuration still preserves a root alias.** Current `apps/api/tsconfig.test.json` maps `@lms/shared` directly to `../../packages/shared/src/index.ts`. The latest API Jest config also retains `^@lms/shared$ → packages/shared/src/index.ts`. These aliases are compatible with historical tests but structurally contradict the goal of making explicit subpaths the only supported app-facing contract. A lint-bypassed test/import can still use the root barrel successfully.

3. **There is currently only one focused package subpath export.** The policy gives `@lms/shared/types/<area>` as the preferred model, but `package.json` currently exposes only `./types/api`. Existing root runtime content — locales, roles and pagination schema — has no focused package export. This is not a violation while apps do not need those contracts through Shared, but it means the package has not yet fully migrated from barrel-oriented runtime exports to explicit public subpaths.

4. **The rationale for `import type` is too broad.** Document groups both ordinary root import and `import type ... from '@lms/shared'` under explanation that root imports “can pull runtime dependencies into app bundles or Docker builds when only type-only contracts are needed.” A genuine TypeScript `import type` is erased from emitted JavaScript; by itself it does not load the root runtime barrel. The architecture may still intentionally forbid it for consistency, API encapsulation and to prevent later accidental conversion to a runtime import, but the stated runtime-bundle mechanism does not apply equally to type-only imports.

5. **The strongest real risk is ordinary/barrel runtime import.** Because root `index.ts` re-exports runtime constants and a Zod-backed pagination schema, a normal root import can couple an app to the broad Shared runtime surface and its runtime dependency graph. That is the better technical explanation for the restriction.

6. **The restriction matches only the exact bare root specifier.** `no-restricted-imports.paths` blocks `@lms/shared`, while package `exports` determines which deep/subpath imports actually resolve. This is appropriate for the current package because only declared subpaths should resolve, but the policy should say that public subpaths must be added to `exports`; ESLint alone is not what makes undeclared deep imports unsupported.

7. **CI checks the policy, but merge enforcement is still off.** As confirmed in earlier gate audits and current branch metadata, `main` is unprotected. A lint failure would make CI red, but GitHub currently does not machine-enforce `CI / Checks` as a required merge gate. Therefore “intentionally blocked by ESLint” is true; “cannot be merged” would not be true under current repository settings.

8. **No dedicated policy regression test exists.** Enforcement relies on ESLint config plus normal lint execution. This is sufficient for practical use, but there is no small fixture/test proving root import fails while `@lms/shared/types/api` passes. Future ESLint config refactors could accidentally remove the restriction and only code containing a root import would expose it.

9. **Recent PR #532 strengthens the general type-only-import discipline but also reveals legacy root aliasing.** PR #532 moved many API type symbols to `import type` for isolated modules and simplified Jest mapper rules, yet intentionally retained the `@lms/shared` root mapper and root test tsconfig path. The current shared import policy therefore remains an ESLint convention layered over a broader test-resolution contract.

### Что изменить

1. Сохранить central rule: app workspaces must import Shared through explicit public subpaths, not root `@lms/shared`.
2. Уточнить enforcement wording: `root import is rejected by ESLint/CI; package root still exists for compatibility/internal package shape` — либо, если compatibility больше не нужна, удалить root `.` export отдельным breaking/architecture change.
3. Переписать rationale:
   - ordinary root/barrel imports broaden runtime coupling and may pull runtime Shared dependencies;
   - type-only root imports are also forbidden for contract consistency/encapsulation, even though `import type` itself is erased at runtime.
4. Указать, что every supported subpath must be declared explicitly in `packages/shared/package.json#exports`; не рекомендовать undeclared deep imports.
5. Решить судьбу existing runtime root exports (`locales`, `roles`, `pagination.schema`):
   - если apps должны их переиспользовать, добавить intentional focused exports such as `./constants/locales`, `./constants/roles`, `./schemas/pagination`;
   - если не должны, оставить internal/root-only and document that they are not app contracts.
6. Reconcile API test config with the policy: remove `@lms/shared` root `paths`/Jest mapper if no longer required, or explicitly mark them legacy/test-infrastructure compatibility aliases that app source still must not import.
7. Добавить небольшой regression check/fixture for architecture policy if this boundary is important enough to survive ESLint config refactors: bare root import fails lint, explicit `types/api` import passes.
8. Добавить `Verified at` / `Verified against main SHA`.
9. Если policy должна быть machine-enforced at merge boundary, separately enable required `CI / Checks` branch protection/ruleset; это не должно смешиваться с import policy itself.

### [НЕ ПРОВЕРЕНО]

- Не выполнен отдельный repository-wide textual search command по всем файлам: GitHub connector не предоставляет code-search primitive. Отсутствие prohibited imports подтверждается успешным current CI lint для linted TS/TSX, а не отдельным grep.
- Не выполнялся bundle-size experiment comparing root runtime import vs explicit subpath; statement about broader runtime coupling основан на current root barrel + package runtime dependency graph, не на measured bundle delta.
- Не проверено, нужен ли `@lms/shared` root Jest/tsconfig alias как compatibility requirement для конкретного hidden/legacy test outside linted source; current visible configuration его сохраняет.
- Не принято архитектурное решение, следует ли вообще удалять package root export. Это потенциально breaking boundary change и не требуется для текущего documentation audit.

### Итог

`SHARED_IMPORT_POLICY.md` в своей основной части **работает и соответствует текущему репозиторию**: bare `@lms/shared` imports запрещены ESLint, explicit `@lms/shared/types/api` export существует, а current CI lint проходит. Документ стоит не переписывать концептуально, а уточнить уровни enforcement и техническое обоснование. Сейчас package root остаётся реально экспортируемым и поддерживается API test aliases, explicit public subpath только один, а `import type` сам по себе не тянет runtime code. После этих уточнений policy будет точно описывать реальную границу: ESLint-enforced app contract over an intentionally broader/legacy Shared package root.

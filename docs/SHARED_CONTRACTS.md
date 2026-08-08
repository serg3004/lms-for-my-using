# Shared contracts

`@lms/shared` owns the small cross-application contracts that must remain identical in the API and web applications.

## Public entry points

Consumers must use focused package exports rather than the root barrel:

- `@lms/shared/constants/roles` — canonical role values, `UserRole`, and `userRoleSchema`;
- `@lms/shared/constants/locales` — supported locales and the default locale;
- `@lms/shared/schemas/pagination` — query coercion, limits, defaults, and `PaginationQuery`;
- `@lms/shared/types/api` — API error envelopes and paginated DTOs.

The source TypeScript files are the type-checking targets while built JavaScript under `dist/` is the runtime target. Adding or renaming a public contract therefore requires updating the package export map and its contract tests together.

## Ownership rules

Runtime validation belongs here only when more than one application needs the exact same wire contract. Application-specific validation remains in that application. In particular, role and pagination validation are shared; authentication forms and domain commands remain API-owned.

The shared package must not import application code. Its tests scan internal imports and fail on application dependencies or circular imports. API and web consumers import the focused exports so role, locale, pagination, and error DTO changes produce compile-time or test failures instead of silently drifting.

## Verification

Run the package checks with:

```bash
pnpm --filter @lms/shared lint
pnpm --filter @lms/shared typecheck
pnpm --filter @lms/shared test:coverage
pnpm --filter @lms/shared build
```

Coverage is enforced at 95% for statements, branches, functions, and lines.

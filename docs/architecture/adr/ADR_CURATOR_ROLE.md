# ADR: Curator/Mentor role

**Status:** Accepted
**Date:** 2026-08-23
**Context:** PR 146 — Curator role: решение по доменной модели

## Context

The historical roadmap (`docs/archive/development-ledger/DEVELOPMENT_PLAN.md`, PR 146) flagged that `curator` was never implemented: `Prisma.UserRole`
only has `learner | instructor | manager | admin`, and no code, API, or UI referenced `curator` anywhere.

Auditing where the term came from: the archived pre-implementation master spec (`docs/archive/pre-implementation-master-context/01_LMS_Master_Product_Specification.md`) is internally
inconsistent about it. Section 2 lists "куратор" as a role separate from instructor in one general enumeration,
but every workflow section (5.2, 11.2, 13) instead writes **"Instructor/Инструктор или куратор"** — treating it
as a synonym for instructor, not a distinct role with its own permissions. There is no description anywhere of
what a curator could do that an instructor couldn't.

Two directions were on the table:
1. Treat `curator` as a documentation artifact — an alias for `instructor` — and fix the one inconsistent list
   entry. No code changes.
2. Implement a genuinely separate role with its own permissions.

## Decision

**A genuinely separate role — implemented as `mentor` in the technical layer, labeled "Наставник" (ru) /
"Mentor" (en) in the UI.**

Scope, confirmed explicitly rather than inferred from the ambiguous spec text: **mentor reviews checklist
submissions** (`checklistReviewWrite`), the same capability `instructor` already has via
`InstructorChecklistReviewsPage`. Mentor gets this **in addition to** instructor — instructor keeps the
capability, this is not a reassignment. Mentor gets no other permission: no course/lesson/assessment
read-or-write access, no team/report visibility. This makes mentor the narrowest role in the system by design —
a single-purpose reviewer role, not a general-purpose "lighter instructor."

### Why `mentor` and not `curator` as the technical name

Every existing `UserRole` value is an English word (`learner`, `instructor`, `manager`, `admin`) with the
Russian label supplied by i18n, not baked into the enum. `curator` is a literal transliteration that reads
oddly in English contexts (API responses, seed data, e2e test names) and doesn't match the requested Russian UI
label anyway — "Наставник" is "mentor," not "curator," in ordinary usage. Naming the enum value `mentor` keeps
the established English-technical/localized-display split consistent and avoids a name that doesn't match its
own translation.

## Implementation

- **Prisma**: `UserRole` enum gains `mentor` (migration `20260823140000_add_mentor_role`, a plain
  `ALTER TYPE ... ADD VALUE`, applied and verified against a live Postgres instance).
- **Single source of truth**: `packages/shared/src/constants/roles.ts`'s `USER_ROLES` gains `'mentor'` — this
  flows into every Zod schema and TS type across both `apps/api` and `apps/web` that imports `UserRole` from
  `@lms/shared`.
- **RBAC**: `apps/api/src/modules/auth/roles.ts`'s `rolePolicies` — `mentor` added to `checklistReviewWrite`
  (alongside admin/manager/instructor, not replacing them) and to `checklistInstancesRead` (needed to view an
  instance and its attached photos before deciding approve/reject — without this, mentor could review but not
  see what it's reviewing). `isLearnerOnly()` now also excludes `mentor`, matching admin/manager/instructor,
  since a mentor viewing a checklist instance or a submitted photo is not "acting as a learner viewing their
  own record."
- **Validation schemas that had their own hardcoded 4-role enum** (a real gap distinct from `rolePolicies` — a
  request could be RBAC-permitted but still rejected by input validation before reaching the guard):
  `apps/api/src/modules/auth/auth.schemas.ts`, `apps/api/src/modules/users/users.schemas.ts`,
  `apps/api/src/modules/memberships/memberships.schemas.ts` (the last one backs the actual
  `POST /memberships` role-assignment endpoint AdminRolesPage calls — without this fix, an admin could never
  actually assign the mentor role through the UI).
- **Frontend routing**: new `/mentor` route (`apps/web/src/app/routes/MentorRoutes.tsx`), gated by
  `canAccessPath`/`protectedPathPrefixes` in `navigationPolicy.ts`. Login redirect
  (`LoginPage.tsx#getLoginRedirectPath`) sends a mentor-only user to `/mentor`, checked after admin/instructor/
  manager so a user holding multiple roles lands in the highest-privilege workspace, same precedence pattern
  the existing roles already follow. `rootNavigation.ts` and `accountSwitcher.tsx` (nav item, role order, home
  path, active-role detection) extended the same way every other role already is.
- **Frontend page**: rather than duplicating `InstructorChecklistReviewsPage.tsx`'s review logic, it now takes
  an optional `Layout` prop (default `InstructorPageLayout`) so `MentorChecklistReviewsPage.tsx` can reuse the
  exact same data loading, review actions, and markup under a different (much smaller — one nav item) shell,
  `apps/web/src/shared/mentorLayout.tsx`. This was the deliberate choice over copy-pasting the ~250-line
  component: mentor and instructor reviewing a checklist is the same feature, only the surrounding chrome
  differs.
- **Admin UI**: `AdminRolesPage.tsx`'s local `AdminRole` type/`adminRoles` list/`ROLE_DESCRIPTIONS`, and
  `features/admin-users/model.ts`'s separate `USER_ROLES` constant (yes — there were two independent
  role-enumeration arrays in the frontend, one shared, one admin-users-local; both needed the addition) — an
  admin can now assign/see the mentor role through the same UI used for every other role, no new screens.
  `AdminUserForm.tsx`/`AdminUsersFilters.tsx` needed no changes — they already iterate `USER_ROLES` rather than
  hardcoding options.
- **i18n**: `mentor.navLink` (new top-level key) plus `admin.roles.options.mentor` /
  `admin.roles.descriptions.mentor`, added to all four locales (en/ru/zh/kk) — ru: "Наставник" / "Проверяет
  чек-листы.", matching the pattern of the other three roles' existing translations rather than falling back to
  the raw enum value.
- **Seed data**: `apps/api/prisma/seed.mjs` gains a `mentor@demo.com` demo user (same password as every other
  demo account) with a `mentor` membership, mirroring the existing one-user-per-role demo pattern. Verified by
  actually running the guarded `admin:demo-seed` script against a local Postgres and confirming the membership
  row.
- **Tests**: `roles.spec.ts`'s `allRoles`/`expectedRolePolicies` (the completeness test that fails if a policy
  key's expected-roles list drifts from `rolePolicies` — this is what actually caught the checklist policies
  needing an update, not manual inspection), `api-policy.audit.spec.ts`'s `allRoles` (drives the full guard
  audit across every controller method for every role), `navigationPolicy.spec.ts` (protected-prefix list +
  new mentor-access cases), e2e `login-role-redirect.spec.ts` and `accessibility.spec.ts` (`DemoRole` type +
  workspace destination list) all extended to cover mentor the same way they already cover the other four
  roles.

## What was deliberately not done

- Mentor gets no course-scoped access (`CourseAccessGuard` doesn't apply to the checklist controllers at all,
  so this isn't a gap — it's the same as instructor's checklist access today).
- No standalone `docs/ENTITY_TECHSPEC_*` rewrite beyond `docs/contracts/API_RBAC_MATRIX.md`'s role table (which also
  picked up the previously-undocumented checklist policy rows while it was being edited for the mentor column
  — a pre-existing gap, fixed as a side effect of touching this table, not a separate audit).
- Full browser-driven Playwright e2e was not re-run end-to-end in this session due to a local Playwright
  browser-version mismatch in the sandbox (config pins a build the pre-installed browser cache doesn't have) —
  CI runs the full suite with a matching browser and is the source of truth for that verification. Everything
  that could be verified without a browser was: real migration + seed run against local Postgres, full API
  (1283 tests) and web (485 tests) suites, typecheck and lint across `apps/api`, `apps/web`, `packages/shared`,
  and `apps/e2e`.

## Consequences

- `Prisma.UserRole` and `docs/contracts/API_RBAC_MATRIX.md` are back in sync — no more gap between the schema and the
  documented role model, closing PR 146's stated readiness criterion.
- Any future hardcoded role enumeration (a `Record<UserRole, X>`, a literal role-string array, a role-count
  assumption in a test) will now either be caught by TypeScript (`Record<UserRole, ...>` forces every key) or
  needs the same audit this PR did — grep for the literal 4-role sequence — since not every such list is
  type-checked (the two frontend `USER_ROLES` constants found during this audit were plain arrays, not
  `Record`s, so they don't get a compiler nudge).
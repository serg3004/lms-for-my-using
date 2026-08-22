# ADR: Frontend data loading — internal hook vs. `@tanstack/react-query`

**Status:** Accepted
**Date:** 2026-08-22
**Context:** PR 141 — Frontend data loading architecture

## Context

Web pages fetch data on mount (and on filter/pagination changes) and need to render loading, success, and error states. Before this change, the pattern was hand-copied per page: a local union type (`{idle|loading|loaded|unauthenticated|error}`), a `useEffect` with an `isMounted` guard, a `try/catch` that special-cased `ApiClientError.status === 401` into a "session expired" message, and a fetch on mount. Confirmed duplicated in at least 20 of the ~33 pages under `apps/web/src/app`, and already independently re-implemented as a feature-local hook in `apps/web/src/features/admin-users/useAdminUsers.ts` — without the `isMounted`/cancellation guard the page-level copies had, a real race condition where a stale response could overwrite a newer one on rapid page/filter changes.

Two standard approaches were considered:

1. **`@tanstack/react-query`** — the standard React data-fetching library.
2. **An internal hook** — generalize the pattern already duplicated across the codebase.

Constraint that shaped the decision: `apps/web/vitest.config.ts` runs with `environment: 'node'` — no jsdom, no `@testing-library/react`, no `react-test-renderer`. There is no way to mount a real component tree and observe effect-driven state transitions in this repo's test setup today. Existing tests either unit-test pure logic directly (`features/admin-users/model.spec.ts`, the PR 96 precedent) or mock React's `useState`/`useEffect` and assert on `renderToStaticMarkup` output (`app/ManagerDashboardPage.spec.tsx`, `app/*.smoke.spec.tsx`).

## Decision

**An internal hook: `apps/web/src/shared/useAsyncData.ts`, built on pure state-transition functions in `apps/web/src/shared/asyncData.ts`.**

```ts
// asyncData.ts — no React import, fully unit-testable
export type AsyncDataState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

export function toAsyncDataErrorState<T>(error: unknown, messages: AsyncDataMessages): AsyncDataState<T> { /* ... */ }
```

```ts
// useAsyncData.ts — thin wiring around the pure functions above
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  messages: AsyncDataMessages,
): { state: AsyncDataState<T>; reload: () => Promise<void> } { /* ... */ }
```

## Rationale

- **No new dependency, no `QueryClientProvider`.** React Query would need both, plus jsdom/RTL-style tests to exercise it properly — infrastructure this repo doesn't have and this PR isn't scoped to add.
- **Fits the established testing convention.** `toAsyncDataErrorState`/`toLoadedState`/`toLoadingState` are pure and directly unit-tested (`asyncData.spec.ts`) exactly like PR 96's `model.ts`. `useAsyncData` itself is tested by mocking `useState`/`useEffect`/`useCallback`/`useRef` and driving the captured effect/callback directly (`useAsyncData.spec.ts`) — the same mocking technique already used by `ManagerDashboardPage.spec.tsx` and the `*.smoke.spec.tsx` files, extended to actually exercise the async resolve/reject paths rather than only a pre-built rendered state.
- **`idle` is dropped.** Every caller treated `idle` and `loading` identically in render logic; it was dead weight. `useAsyncData` starts directly in `loading`.
- **Fixes a real bug found in `useAdminUsers.ts`.** Its hand-rolled version had no cancellation guard at all. `useAsyncData` cancels the previous in-flight request whenever `reload()` is called or `deps` change, discarding a stale response — closing that race.
- **`reload(): Promise<void>` is load-bearing, not incidental.** `apps/web/src/features/admin-users/useAdminUsers.ts` passes its `reload` into `useAdminUserMutations(reload)`, which does `await reload()` after a create/update/toggle so the dialog only closes once the list has actually refreshed. `useAsyncData`'s `reload` is the same memoized loader function the mount-time effect calls, so `await`ing it genuinely waits for the new state to be applied — not just for a token bump to be scheduled.
- **Cheap to swap the internals for React Query later, if the need is only "same behavior, different engine".** Because every caller depends on `useAsyncData`'s `{state, reload}` contract rather than on `fetch`/`useEffect` directly, replacing this hook's internals with `useQuery` (mapped back into the same `AsyncDataState` shape) would touch one file, not every call site. Getting React Query's actual benefits — shared cross-page cache, request de-duplication, background refetch — would still require assigning real query keys per call site, which is the same amount of work whenever it's done, independent of how many pages call `useAsyncData` by then.

## Applied to

Initial 3 (first PR): `LearnerCoursesPage.tsx`, `LearnerAssignmentsPage.tsx`, `features/admin-users/useAdminUsers.ts`.

Follow-up pass, migrating the remaining pages with the pattern:
- `AdminCoursesPage.tsx`, `AdminLessonsPage.tsx`, `AdminOrgStructurePage.tsx`, `AdminResultsCertificatesPage.tsx`, `AdminRolesPage.tsx`, `AdminCourseBuilderPage.tsx`
- `InstructorChecklistReviewsPage.tsx`
- `LearnerCertificateDetailPage.tsx`, `LearnerCourseDetailPage.tsx`, `LearnerLessonDetailPage.tsx`, `LearnerLessonsPage.tsx`

That's 14 call sites total. Every migrated `.spec.tsx`/`*.smoke.spec.tsx` fixture was updated for the new `useState` call order and the `{status:'loaded', data: T}` shape (via `useStateAtCalls({N: ...})`, computed by counting each page's `useState` calls before its `useAsyncData` call). Verified beyond the automated suite: a live manual pass through every migrated admin/instructor/learner page against a running API + web dev server and seeded Postgres, logged in as each relevant role — zero console/page errors, correct content rendered (including a real pending checklist review and a real draft course from the PR 133 seed data).

**Found and fixed along the way:** `useAsyncData`'s `useState` was initialized with a bare lazy-initializer function reference (`useState(toLoadingState)` instead of `useState(toLoadingState())`). This works fine at runtime, but broke `LearnerCertificateDetailPage.spec.tsx`'s mock, which (unlike the smoke-test mocks) doesn't unwrap function initializers — it received the function reference itself as "state" and crashed on `.data`. Since `toLoadingState()` has no meaningful cost, lazy initialization bought nothing; switched to a plain object literal, which is also what every hand-rolled page in this codebase already did.

**Deliberately excluded** (two categories):
1. **Pages that mutate loaded state in place without a full reload** — `AdminMaterialsPage.tsx` (optimistic per-material status patch, bidirectional `selectedCourseId` ↔ load coupling with a bootstrapping default) and `AdminChecklistsPage.tsx` (`setLoadState((prev) => ...)` patching one checklist in the loaded array). Forcing these through `useAsyncData`'s `{state, reload}` contract — which only supports "replace the whole loaded value" — would mean losing the optimistic in-place update or meaningfully growing the hook's API for two consumers. Left as-is; a good candidate for a dedicated follow-up once there's a clear answer for how `useAsyncData` should (or shouldn't) support partial state patches.
2. **Pages with a pre-existing `.spec.tsx` asserting on rendered content tied to hook-call order that this migration didn't already need to touch** — `ManagerDashboardPage.tsx`, `ManagerTeamPage.tsx`, `LearnerHomePage.tsx`, `LearnerProgressPage.tsx`. (Note: `LearnerCertificateDetailPage.tsx` was originally in this excluded set too, but ended up migrated and its spec fixed — see above.) Still good follow-up candidates; same mechanical `useStateAtCalls({N: ...})` treatment applies.

Two minor, deliberate behavior simplifications made during the follow-up pass, both flagged here rather than silently applied:
- `LearnerLessonsPage.tsx` and `LearnerCertificateDetailPage.tsx` previously had a distinct `notFound` (404) status with its own message, separate from generic `error`. `AsyncDataState` only distinguishes `unauthenticated` vs. `error`, not a third "not found" case; both now render under the shared `error` message. The on-screen action link is unchanged (still points back to the courses/certificates list).
- Where a page had no `unauthenticated`-vs-`error` distinction at all before (`AdminLessonsPage.tsx`, `AdminOrgStructurePage.tsx`, `AdminResultsCertificatesPage.tsx` previously used a single generic error message, or in `InstructorChecklistReviewsPage.tsx`'s case the raw upstream `ApiClientError.message`), migrating to `useAsyncData` added the standard `unauthenticated` branch with a translated "session expired, sign in again" message and a login link — consistent with the rest of the app. This is a strict improvement (a 401 now correctly prompts re-authentication instead of a generic error), but is a behavior change worth naming. One new translation key (`checklistReview.sessionExpired`) was added to `ru`/`kk` locale files for this.

## Consequences

- New pages that fetch data should use `useAsyncData` rather than hand-rolling the `idle|loading|loaded|unauthenticated|error` pattern again.
- `docs/RATE_LIMIT_FAILURE_POLICY.md`-style "source of truth" documents aren't needed here; this ADR plus `useAsyncData.ts`/`asyncData.ts` themselves are the reference.
- Remaining candidates for the same migration: the 4 pages with pre-existing order-dependent specs (above), and a dedicated design decision for `AdminMaterialsPage.tsx`/`AdminChecklistsPage.tsx`'s in-place-mutation needs before migrating them.

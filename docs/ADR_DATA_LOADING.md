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

- `apps/web/src/app/LearnerCoursesPage.tsx`
- `apps/web/src/app/LearnerAssignmentsPage.tsx`
- `apps/web/src/features/admin-users/useAdminUsers.ts` (consumed by `AdminUsersPage.tsx`, unchanged aside from dropping the now-dead `idle` check)

These three were chosen because none had a pre-existing `.spec.tsx`/`.spec.ts` tied to a specific `useState`/`useEffect` call order beyond the project's own smoke-test suite (`LearnerPages.smoke.spec.tsx`, `AdminPages.smoke.spec.tsx`), which were updated alongside the migration (see `docs/DEVELOPMENT_PLAN.md`, PR 141, for the specific call-order adjustments). Pages that already have a bespoke `.spec.tsx` relying on hook-call order (e.g. `ManagerDashboardPage.tsx`, `ManagerTeamPage.tsx`, `LearnerHomePage.tsx`, `LearnerProgressPage.tsx`, `LearnerCertificateDetailPage.tsx`) are deliberately left for a follow-up PR to avoid mixing a broad rename with the risk of an unrelated test regression.

## Consequences

- New pages that fetch data should use `useAsyncData` rather than hand-rolling the `idle|loading|loaded|unauthenticated|error` pattern again.
- `docs/RATE_LIMIT_FAILURE_POLICY.md`-style "source of truth" documents aren't needed here; this ADR plus `useAsyncData.ts`/`asyncData.ts` themselves are the reference.
- Roughly 17 more pages still hand-roll the old pattern and are good candidates for the same migration in follow-up PRs — several of them will additionally need their existing `.spec.tsx` files' mocked `useState` call-order updated, since inserting `useAsyncData` shifts which call index is the load state (see the LearnerAssignmentsPage/useAdminUsers cases in this PR for the pattern: use `useStateAtCalls({N: ...})` targeting the new index rather than assuming call #1).

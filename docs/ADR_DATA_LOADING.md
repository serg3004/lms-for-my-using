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
  | { status: 'notFound'; message: string }
  | { status: 'error'; message: string };

export function toAsyncDataErrorState<T>(error: unknown, messages: AsyncDataMessages): AsyncDataState<T> { /* ... */ }
```

```ts
// useAsyncData.ts — thin wiring around the pure functions above
export function useAsyncData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  messages: AsyncDataMessages,
): { state: AsyncDataState<T>; reload: () => Promise<void>; mutate: (updater: (data: T) => T) => void } { /* ... */ }
```

## Rationale

- **No new dependency, no `QueryClientProvider`.** React Query would need both, plus jsdom/RTL-style tests to exercise it properly — infrastructure this repo doesn't have and this PR isn't scoped to add.
- **Fits the established testing convention.** `toAsyncDataErrorState`/`toLoadedState`/`toLoadingState` are pure and directly unit-tested (`asyncData.spec.ts`) exactly like PR 96's `model.ts`. `useAsyncData` itself is tested by mocking `useState`/`useEffect`/`useCallback`/`useRef` and driving the captured effect/callback directly (`useAsyncData.spec.ts`) — the same mocking technique already used by `ManagerDashboardPage.spec.tsx` and the `*.smoke.spec.tsx` files, extended to actually exercise the async resolve/reject paths rather than only a pre-built rendered state.
- **`idle` is dropped.** Every caller treated `idle` and `loading` identically in render logic; it was dead weight. `useAsyncData` starts directly in `loading`.
- **Fixes a real bug found in `useAdminUsers.ts`.** Its hand-rolled version had no cancellation guard at all. `useAsyncData` cancels the previous in-flight request whenever `reload()` is called or `deps` change, discarding a stale response — closing that race.
- **`reload(): Promise<void>` is load-bearing, not incidental.** `apps/web/src/features/admin-users/useAdminUsers.ts` passes its `reload` into `useAdminUserMutations(reload)`, which does `await reload()` after a create/update/toggle so the dialog only closes once the list has actually refreshed. `useAsyncData`'s `reload` is the same memoized loader function the mount-time effect calls, so `await`ing it genuinely waits for the new state to be applied — not just for a token bump to be scheduled.
- **Cheap to swap the internals for React Query later, if the need is only "same behavior, different engine".** Because every caller depends on `useAsyncData`'s `{state, reload, mutate}` contract rather than on `fetch`/`useEffect` directly, replacing this hook's internals with `useQuery` (mapped back into the same `AsyncDataState` shape) would touch one file, not every call site. Getting React Query's actual benefits — shared cross-page cache, request de-duplication, background refetch — would still require assigning real query keys per call site, which is the same amount of work whenever it's done, independent of how many pages call `useAsyncData` by then.

### Follow-up decision: `mutate()` for in-place updates

Several pages patch already-loaded data after a mutation (e.g. one item's status changes) without a full reload, to avoid a loading flash or — in the checklist builder's case — remounting a view mid-edit. The original `{state, reload}` contract couldn't express this: a caller either replaced the whole loaded value via a private `setState` (never exposed) or paid for a full `reload()`.

**Decision: add `mutate(updater: (data: T) => T): void` to `useAsyncData`'s return value**, mirroring the `mutate()` API already familiar from SWR/React Query:

```ts
const mutate = useCallback((updater: (data: T) => T) => {
  setState((current) => (current.status === 'loaded' ? toLoadedState(updater(current.data)) : current));
}, []);
```

No-op outside the `loaded` status (a patch arriving mid-reload or mid-error is simply dropped, matching what the hand-rolled `setLoadState((prev) => prev.status === 'loaded' ? ... : prev)` pattern already did on every page that needed this). Chosen over inventing a page-specific escape hatch each time, since five separate pages needed the exact same shape.

### Follow-up decision: `notFound` status

Three pages distinguish "not found" (404) from a generic error, with its own message and (in two cases) no dedicated recovery action beyond going back to the list. `AsyncDataState` gained a `notFound` status and `AsyncDataMessages` gained an optional `notFound` key; `toAsyncDataErrorState` maps a 404 `ApiClientError` to it only when the caller supplied a `notFound` message — omitting it keeps the prior behavior (404 falls into the generic `error` branch), so this is backward compatible with every page migrated before this decision.

## Applied to

Initial 3 (first PR): `LearnerCoursesPage.tsx`, `LearnerAssignmentsPage.tsx`, `features/admin-users/useAdminUsers.ts`.

Second pass, 14 more:
- `AdminCoursesPage.tsx`, `AdminLessonsPage.tsx`, `AdminOrgStructurePage.tsx`, `AdminResultsCertificatesPage.tsx`, `AdminRolesPage.tsx`, `AdminCourseBuilderPage.tsx`
- `InstructorChecklistReviewsPage.tsx`
- `LearnerCertificateDetailPage.tsx`, `LearnerCourseDetailPage.tsx`, `LearnerLessonDetailPage.tsx`, `LearnerLessonsPage.tsx`

Third pass — the remaining backlog, 18 more, bringing the total to 35 pages/hooks migrated:
- **Needed `mutate()`:** `AdminMaterialsPage.tsx`, `AdminChecklistsPage.tsx`, `ManagerDashboardPage.tsx`, `AdminAssignmentCompletionPage.tsx`, `InstructorCourseFormPage.tsx`.
- **Needed the `notFound` status:** `LearnerAssessmentDetailPage.tsx`, `LearnerAssessmentReviewPage.tsx`, `LearnerAssignmentDetailPage.tsx`.
- **Mechanical:** `ManagerTeamPage.tsx`, `LearnerHomePage.tsx`, `LearnerProgressPage.tsx`, `AdminDashboardPage.tsx`, `InstructorCourseStudentsPage.tsx`, `InstructorCoursesPage.tsx`, `InstructorDashboardPage.tsx`, `LearnerAssessmentsPage.tsx`, `LearnerCertificatesPage.tsx`, `LearnerChecklistsPage.tsx`.

Fourth pass — the one deliberate holdout from the third pass, `LearnerAssessmentTakingPage.tsx`, bringing the total to 36. See "Resolved holdout" below for how the side-channel write was resolved.

Every migrated `.spec.tsx`/`*.smoke.spec.tsx` fixture was updated for the new `useState` call order and the `{status:'loaded', data: T}` shape (via `useStateAtCalls({N: ...})`, computed by counting each page's `useState` calls before its `useAsyncData` call). Adding the `notFound` status was a cross-cutting type change: every page already on `useAsyncData` that didn't opt into `notFound` needed its `error`-status guard widened to also catch `notFound` (`status === 'error' || status === 'notFound'`), so the new status still narrows correctly — otherwise TypeScript couldn't tell the remaining branch was `loaded`.

**Found and fixed along the way (second pass):** `useAsyncData`'s `useState` was initialized with a bare lazy-initializer function reference (`useState(toLoadingState)` instead of `useState(toLoadingState())`). This works fine at runtime, but broke `LearnerCertificateDetailPage.spec.tsx`'s mock, which (unlike the smoke-test mocks) doesn't unwrap function initializers — it received the function reference itself as "state" and crashed on `.data`. Since `toLoadingState()` has no meaningful cost, lazy initialization bought nothing; switched to a plain object literal, which is also what every hand-rolled page in this codebase already did.

**Resolved holdout: `LearnerAssessmentTakingPage.tsx` (fourth pass).** The third pass left this page unmigrated because a timer `useEffect` (the countdown for timed assessments) wrote `setLoadState({status:'error', ...})` directly on a failed `startAssessmentAttempt` call — a side channel outside the normal load cycle, which `useAsyncData`'s `{state, reload, mutate}` contract has no way to express. Rather than growing the hook's API for one consumer, the fix was local to the page: the timer effect now writes to its own `const [timerError, setTimerError] = useState<string | null>(null)` instead of the load state, and the render logic checks `timerError` as one more terminal branch (same `PageState`/action link as the existing `error` branch, just sourcing the message from `timerError` instead of `loadState.message`). With the side channel gone, the rest of the page migrated mechanically — no `mutate()` or `notFound` needed (it has no in-place patches and no distinct 404 case).

**Deliberately left out of scope:**
1. **Nested, self-contained data fetches inside otherwise-migrated pages** — `ManagerDashboardPage.tsx`'s `AssignTrainingModal` (its own `listCourses` fetch for a dropdown) and `LearnerChecklistsPage.tsx`'s `PhotoAttachment` (its own `getChecklistItemPhotoUrl` fetch). Both are small, modal/card-local fetches unrelated to the parent page's load state — out of scope for this pattern.

Two minor, deliberate behavior simplifications made during the second pass, both flagged here rather than silently applied:
- `LearnerLessonsPage.tsx` and `LearnerCertificateDetailPage.tsx` previously had a distinct `notFound` (404) status with its own message, separate from generic `error`; at the time `AsyncDataState` didn't support a third status, so both were folded into the shared `error` message. (The `notFound` status introduced in the third pass could restore this distinction for these two pages, but that wasn't done here — out of scope for this round.)
- Where a page had no `unauthenticated`-vs-`error` distinction at all before (`AdminLessonsPage.tsx`, `AdminOrgStructurePage.tsx`, `AdminResultsCertificatesPage.tsx` previously used a single generic error message, or in `InstructorChecklistReviewsPage.tsx`'s case the raw upstream `ApiClientError.message`), migrating to `useAsyncData` added the standard `unauthenticated` branch with a translated "session expired, sign in again" message and a login link — consistent with the rest of the app. This is a strict improvement (a 401 now correctly prompts re-authentication instead of a generic error), but is a behavior change worth naming. One new translation key (`checklistReview.sessionExpired`) was added to `ru`/`kk` locale files for this.

## Consequences

- New pages that fetch data should use `useAsyncData` rather than hand-rolling the `idle|loading|loaded|unauthenticated|error` pattern again. Use `mutate()` for in-place patches after a mutation, and pass `messages.notFound` when a page needs to distinguish 404 from a generic error.
- If a page needs to force an error state from outside the normal load cycle (the way `LearnerAssessmentTakingPage.tsx`'s timer used to), don't grow `useAsyncData`'s API for it — keep that as page-local state and treat it as one more terminal branch in the render logic (see "Resolved holdout" above for the pattern).
- `docs/RATE_LIMIT_FAILURE_POLICY.md`-style "source of truth" documents aren't needed here; this ADR plus `useAsyncData.ts`/`asyncData.ts` themselves are the reference.
- No remaining candidates: every page identified in the PR 141 audit is now on `useAsyncData` (36 total), aside from the two intentionally-out-of-scope nested fetches noted above.

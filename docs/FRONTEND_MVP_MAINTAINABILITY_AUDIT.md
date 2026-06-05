# Frontend MVP maintainability audit

## Status

This document captures the frontend MVP page-size audit and next maintainability targets.

This PR intentionally avoids router, API contract, auth flow, design, or business-logic changes before staging smoke.

## Largest MVP-critical pages

Approximate file sizes observed from `apps/web/src/app`:

| File | Approx. size | Risk |
| --- | ---: | --- |
| `AdminMaterialsPage.tsx` | 24.7 KB | High |
| `AdminAssessmentBuilderPage.tsx` | 21.1 KB | High |
| `AdminAssignmentCompletionPage.tsx` | 15.8 KB | Medium |
| `AdminLessonsPage.tsx` | 15.5 KB | Medium |
| `LearnerAssessmentTakingPage.tsx` | 14.3 KB | Medium |
| `App.tsx` | 14.3 KB | Medium |
| `AdminUsersPage.tsx` | 12.8 KB | Medium |

## Safe cleanup applied in PR 109

This PR applies one low-risk code cleanup:

- `LearnerCoursesPage.tsx` keeps the same data loading, routing, and UI output.
- Course list rendering is moved into a local leaf component.
- No API client, route, auth, or translation keys were changed.

## Deferred cleanup targets

Do not clean the largest admin pages in a big batch before staging smoke. Use separate, small PRs:

1. `AdminMaterialsPage.tsx`: extract upload field and progress UI only after staging upload smoke is green.
2. `AdminAssessmentBuilderPage.tsx`: extract question editor and answer list when assessment smoke is green.
3. `AdminLessonsPage.tsx`: extract form rendering after admin lessons smoke is green.
4. `App.tsx`: route config should be segregated only after full learner/admin smoke verification.

## Guardrails

- Keep changes behavior-preserving.
- Do not change routes, permissions, auth, or API contracts.
- Do not introduce a new UI kit or styling system.
- Prefer local leaf component extractions over cross-app abstractions.
- Add or update frontend tests only when the cleanup touches logic, not pure JSX separation.

## Rollback

Revert this PR to restore the previous frontend page structure and remove the audit document.

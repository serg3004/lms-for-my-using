# Frontend coverage roadmap

Status: PR 204, stage 1 complete

## Baseline

Before PR 204, `pnpm --filter @lms/web test:coverage` reported:

| Metric | Baseline | Previous gate |
| --- | ---: | ---: |
| Statements | 34.25% | 25% |
| Branches | 36.01% | 23% |
| Functions | 29.65% | 25% |
| Lines | 37.67% | 25% |

The low function coverage was the primary risk: route decisions, form callbacks,
error paths, session wrappers, and assessment calculations could regress without
failing CI.

## Stage 1 result

PR 204 establishes a 40% global gate for statements, branches, functions, and
lines. The implementation covers:

- the complete role/path policy matrix and rendered protected-route outcomes;
- the route error boundary fallback and reporting contract;
- theme persistence, normalization, application, and reset behavior;
- login/current-user/logout and domain API request contracts;
- admin, assessment, and material form validation/error states;
- assessment-taking answer mapping, completion counting, option labels, and
  API-error classification in a dedicated domain model;
- previously uncovered admin and learner page states.

The new assessment-taking domain model has its own 80% threshold for every
coverage metric. Production source files remain included; only the application
entry point, declarations, and tests are excluded.

## Follow-up stages

Coverage should increase without broad exclusions or ignore comments:

1. **50%:** assessment submission/certificate flows, admin mutations, login and
   logout interactions, route loaders, and learner error/retry states.
2. **65%:** remaining page branches, responsive navigation interactions, manager
   and instructor mutations, and per-domain thresholds for all extracted models.

Every new domain model or validation module must ship with at least 80% coverage
for statements, branches, functions, and lines. Global thresholds may only move
upward. CI already runs the workspace `test:coverage` scripts and therefore
blocks merges that fall below these gates.

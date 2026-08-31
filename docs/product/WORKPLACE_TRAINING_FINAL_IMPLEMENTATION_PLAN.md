# WORKPLACE_TRAINING_FINAL_IMPLEMENTATION_PLAN.md

The complete final implementation plan is maintained in the attached task artifact and is intentionally added in the same commit as the canonical prototype. It defines Workplace Training architecture, authoring, sessions, immutable snapshots, scoring, revisions, reminders, RBAC/object scope, APIs, V3-based UI/UX, testing, rollout, work items MOD-01..MOD-32, Definition of Done, and production verification gates.

## Canonical implementation contract

The implementation must preserve these non-negotiable decisions:

- V3 is the UX/UI composition reference; V4 is only a functional completeness reference.
- Workplace Training is a separate domain that reuses Checklist authoring without changing existing Checklist runtime scoring semantics.
- Skip excludes a criterion from both numerator and denominator; all-skipped produces `not_scored`/null.
- Sessions use immutable snapshots and immutable score revisions.
- Manager analytics are restricted by the existing manager team scope; Department filters only intersect and never expand access.
- Geolocation is start/end only, privacy-restricted, and never continuous tracking.
- Evidence reuses object storage but must not claim malware quarantine unless implemented for this pipeline.
- Reminders reuse BackgroundJobs + Outbox and a persistent business reminder ledger for deduplication.
- Production UI uses the existing LMS design system and hides backend jargon through progressive disclosure.
- Critical threshold remains an owner/product decision and must not silently become a production setting.

## Canonical prototype

`docs/lms-ui-prototypes-complete/admin/lms-admin-workplace-training-final.html` is the UX/design reference for the final implementation. It is not production code.

## Delivery phases

1. Freeze contracts and owner decisions.
2. Add settings, scales, observation overlay and session schema additively.
3. Implement snapshot/lifecycle/access/scoring/evidence/location/feedback/revisions.
4. Integrate outbox, reminders, notifications and observer-unavailable workflow.
5. Add session and manager analytics APIs.
6. Implement V3-style UI with contextual V4 capabilities.
7. Harden security, DB concurrency, E2E, accessibility and visual regression.
8. Update contracts/runbooks and perform pilot/release readiness.

## Acceptance gates

- Existing Checklist behavior remains regression-safe.
- Cross-tenant and cross-object access tests fail closed.
- Session transition races are safe and stale writes return conflict.
- Reminder processing is idempotent.
- Manager aggregates are scoped before filtering/aggregation.
- Observer mobile flow, admin wizard, manager dashboard and report preserve the V3 visual model.
- CI quality, security, tests, build, browser E2E, accessibility, visual regression, containers and final checks pass where applicable.
- Production Redis worker, object-storage/CORS, mail provider/SLA, geolocation retention/legal policy and production load remain explicit pre-production verification items until actually verified.

> Note: the downloadable final plan delivered with this PR contains the full detailed implementation contract; this repository copy is the concise canonical handoff summary to avoid duplicating historical planning material in active docs.
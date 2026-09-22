# ADR: ChecklistSession as a 1:1 overlay over ChecklistInstance (Workplace Training PR 285)

**Status:** Accepted
**Date:** 2026-09-22
**Context:** `docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md`, PR 285 — first PR of the
Checklist workplace-training extension (PR 285–308). No runtime code changes in this PR; this document is the
gate PR 286+ depend on.

## Context

The implementation plan requires this session-based "workplace training" mode to be an **extension of the
existing `Checklist` module**, not a new module: no new module boundary under
`apps/api/src/modules/workplace-training/`, Prisma names in the `Checklist*` family, existing services extended
rather than duplicated (`ChecklistReviewAccessService`, `OrganizationAccessScopeService`,
`ChecklistDeadlineWorker`, the existing photo-evidence columns on `ChecklistItemResult`). The plan (section 0)
already settles most of the module-boundary questions; what PR 285 has to settle before PR 286+ can start
writing schema/API code is: the exact relationship between `ChecklistSession` and `ChecklistInstance`, the
Observer role, the session state machine, the scoring formula, and a concrete value for every "safe default"
the plan defers to this PR.

Two shapes were on the table for `ChecklistSession`:

1. **A new top-level entity** that owns its own submission/scoring lifecycle, with `ChecklistInstance` either
   unused for this mode or relegated to a denormalized mirror.
2. **A 1:1 overlay** — `ChecklistSession` holds only what a live, observed, in-person session needs that a
   normal (self-paced, async) `ChecklistInstance` doesn't: scheduling, an observer, pause/resume, geolocation
   capture policy, timezone. Everything `ChecklistInstance` already tracks (`totalScore`, `maxScore`,
   `percentage`, `passed`, `templateSnapshot`, `snapshotVersion`, `status`, `dueAt`, `submittedAt`,
   `completedAt`) stays there, addressed through the same `ChecklistInstance`/`ChecklistItemResult` read paths
   every other Checklist consumer already uses.

## Decision

**`ChecklistSession` is a 1:1 overlay over `ChecklistInstance`.**

- `ChecklistSession.instanceId` is a unique FK to `ChecklistInstance.id`, `onDelete: Cascade`. A session cannot
  exist without its instance; deleting the instance deletes the session row (event/reminder/location-capture
  children cascade from the session, per PR 288).
- `ChecklistSession` owns exactly: `scheduledAt`, `startedAt`, `pausedAt`, `observerId`, `locationCapturePolicy`,
  `timezone`, and its own `status` (the session lifecycle — see below). It does **not** duplicate `totalScore`,
  `maxScore`, `percentage`, `passed`, `templateSnapshot`, `snapshotVersion`, `submittedAt`, or `completedAt` —
  those reads and writes go through `ChecklistInstance`/`ChecklistItemResult` exactly as they do for a
  non-session checklist.
- Scoring (PR 290) writes to the existing `ChecklistItemResult` rows, extending the existing percentage
  computation described below — it does not introduce a parallel result table.
- A `ChecklistScoreRevision` (PR 288) is an audit trail of re-scoring events, not a second source of truth for
  the current score; the current score is always `ChecklistInstance`'s own fields.

This keeps every existing Checklist consumer (reports, `AdminChecklistsPage`, learner progress, audit log)
working against `ChecklistInstance` unchanged — a session-mode instance is a normal `ChecklistInstance` with an
attached `ChecklistSession` row, not a fork of the read model.

### Observer = the existing `instructor` role

The prototype's "Observer" screen maps to the existing `instructor` role, not a new role and not a "manager"
special case. Rationale: `docs/product/MVP_SCOPE_LOCK.md` puts custom/new roles `OUT-OF-MVP`, and `instructor` is
already the role that owns checklist review (`checklistReviewWrite`, `ChecklistReviewAccessService`) — an
in-person observed session is the same reviewer relationship as an async review, just live. No new
`Prisma.UserRole` value is added by this workstream.

- `ChecklistSession.observerId` MUST reference a user holding `instructor` (directly checked in the PR
  287/292 access/validation layer, not inferred from `manager`/`admin`).
- **"Manager-as-observer" safe default: not privileged.** A `manager` who is not also `instructor` cannot be
  assigned as observer. A user holding both roles can, through the same `instructor`-gated path everyone else
  uses — there is no separate "manager can observe" branch of logic to build or reason about for IDOR purposes.
  This is the conservative reading of "Observer = instructor": it keeps exactly one authorization rule for
  "who can be an observer" instead of two roles' worth of special-casing, and avoids silently widening who can
  see session evidence (photos, location) beyond the existing checklist-reviewer population.

### Session state machine

`ChecklistSession.status` is a lifecycle **separate from and orthogonal to** `ChecklistInstance.status`
(`assigned/in_progress/submitted/completed`, which is about the learner's submission/review flow and is
untouched by this feature):

```text
scheduled --start--> in_progress --pause--> paused --resume--> in_progress --complete--> completed
scheduled --cancel--> cancelled
```

- `scheduled` is the only state a session can be cancelled from (PR 289's "запрет смены участников после
  старта" — once `in_progress`, participants/observer are frozen; cancellation of a live session is not
  in scope for v1 and is not a transition this state machine defines).
- `paused` only reaches `in_progress` (resume) or stays `paused`; it cannot go directly to `completed` or
  `cancelled` — pause is a suspension of an active session, not an exit state.
- `completed` and `cancelled` are terminal: no transition leaves them.
- There is no `result_fixed` session status. Whether a score is final is a property of `ChecklistInstance` /
  `ChecklistScoreRevision` (PR 288/290), not of the session lifecycle — a `completed` session's result can still
  go through an audited re-score revision without the session itself changing state.
- All transitions are conditional on `(status, version)` (optimistic concurrency) and rejected with `409` on a
  stale write, exactly as PR 289 specifies; every transition appends a `ChecklistSessionEvent` row.

### Scoring algorithm v1

Extends `ChecklistInstance`'s existing percentage logic; it does not introduce a second algorithm:

```text
earned = sum(ChecklistItemResult.score) over items where answerState != 'skipped'
max    = sum(ChecklistItemResult.maxScore) over items where answerState != 'skipped'
percentage = max > 0 ? round(earned / max * 100) : not_scored
```

- `answerState` is one of `unanswered | answered | skipped` (PR 290). Skipped items are excluded from **both**
  the numerator and the denominator — a skip must not silently count as zero, and must not inflate the
  denominator against an item nobody could answer.
- **All-skipped is `not_scored`, not `0%`.** A session where every non-required item was skipped has no
  meaningful percentage; treating it as `0%` would be indistinguishable from "answered everything wrong."
- Per-criterion `weight` (PR 288/290) multiplies into both `earned` and `max` for that item before the sums
  above — a weighted item that's skipped is excluded the same way as an unweighted one.
- `passed` on `ChecklistInstance` is derived from `percentage` against the checklist's existing pass threshold
  mechanism (whatever `ChecklistInstance` already uses for non-session checklists) — this PR does not introduce
  a second pass/fail rule.

### API/RBAC contract (binding for PR 287, 292)

- Admin: tenant-wide access to `ChecklistSession`, unchanged from the existing admin Checklist scope.
- Manager: sees sessions for employees inside their effective team scope, defined as
  `OrganizationAccessScopeService`'s existing union (Group ∪ Department DIRECT-manager ∪ ReportingLine DIRECT),
  transitively — **not** the narrower `ManagerTeamScope` `ChecklistReviewAccessService` currently uses. PR 287
  migrates that service onto `OrganizationAccessScopeService`; this is a widening/correction of an existing
  service, not a new access model.
- Observer (`instructor`): can read and act on sessions where they are the assigned `observerId`; cannot browse
  or act on sessions observed by someone else, and being `instructor` alone (without an assignment) grants no
  session visibility.
- Employee (`learner`): can read only `ChecklistSession` rows for their own `ChecklistInstance`
  (`ChecklistInstance.userId == self`), same self-scope rule the rest of the Checklist module already applies.
- Every nested resource reachable from a session id — `ChecklistSessionEvent`, `ChecklistLocationCapture`,
  photo evidence on `ChecklistItemResult` — inherits the parent session's access check; a valid UUID for a
  nested resource is never sufficient on its own (PR 287's stated IDOR criterion).
- List/analytics endpoints filter server-side by the same scope; the frontend is never the access boundary
  (restated from PR 286/287's "frontend не источник истины").

### Entity ownership

All new tables listed in PR 288 (`ChecklistSession`, `ChecklistSessionEvent`, `ChecklistScoreRevision`,
`ChecklistSessionReminder`, `ChecklistLocationCapture`, `ChecklistScale`, `ChecklistScaleLevel`) are owned by
`apps/api/src/modules/checklists/` — no new Prisma schema file, no new NestJS module, no new entry in
`app.module.ts`. `docs/_meta/ownership.json` is not amended with a `workplace-training` mapping; changes to
`checklists.controller.ts`/`roles.ts`/`schema.prisma`/`app.module.ts` continue to be covered by the existing
`api-surface`/`auth-rbac`/`data-model`/`module-topology` mappings, per the plan's section 0.

### Safe defaults (binding for PR 286)

| Setting | Default | Why |
| --- | --- | --- |
| `moduleEnabled` | `false` | Stated by the plan; a tenant opts in explicitly. |
| `highPerformanceThreshold` | `90` | Stated by the plan. |
| `criticalThreshold` / `lowThreshold` | **unset — not shipped in PR 286** | Explicitly deferred to an owner/product decision in the plan; shipping a guessed number would silently define what "critical performance" means for every tenant. Track as an open item in `docs/status/OPEN_DECISIONS.md` rather than defaulting it. |
| `defaultGeolocationPolicy` | `off` | Matches `moduleEnabled=false`'s opt-in posture; a tenant that wants location capture turns it on (`optional` or `required`) deliberately. Consistent with PR 290's "no continuous tracking, start+end only, audited override" constraints — the conservative default is capturing nothing until asked. |
| `feedbackVisibility` | `after_completion` | The employee sees their result once the session (and any review) is `completed`, not live during an in-progress observed session. Avoids a partially-scored, possibly-still-revised result being shown as if final, and avoids an observer's in-progress notes being visible to the person being observed in real time. |
| Manager-as-observer | not privileged (see Observer section above) | Keeps a single authorization rule for observer assignment. |
| Email reminders | off unless a production email delivery capability is configured | Restated from PR 291; a missing email capability must never block or break the reminder/session workflow itself. |

## Consequences

- PR 286–308 build against this document: any deviation (e.g. giving `ChecklistSession` its own score fields,
  allowing a plain `manager` to observe, treating an all-skipped session as `0%`) is a change to this ADR, not a
  local implementation detail, and needs the same review as decisions like the mentor-role ADR.
- `criticalThreshold`/`lowThreshold` remaining unset means PR 286's settings UI must render an org performance
  view without a "critical" band until that decision lands — this is intentional, not a gap to silently fill in
  during PR 286.
- Because `ChecklistSession` never duplicates `ChecklistInstance` fields, every existing report/audit/progress
  code path that already reads `ChecklistInstance` needs zero changes to keep working for session-mode
  instances — the workstream is additive by construction, matching the plan's "not a new module" framing.

## What was deliberately not decided here

- The exact `ChecklistWorkplaceSettings` schema/migration (PR 286) and the exact `ChecklistSession` Prisma
  fields/indexes (PR 288) — this ADR fixes the *values and relationships* those PRs must implement, not their
  column-by-column DDL.
- `criticalThreshold`/`lowThreshold` values — left open for `docs/status/OPEN_DECISIONS.md`, not guessed here.
- Anything about the UI beyond what's already fixed by the plan's routing table (section 0.1) — PR 294 owns
  visual/component decisions.

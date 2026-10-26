# Checklist workplace-training session workflow

`ChecklistSession` (PR 285-307, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`) is a
distinct mode from the older assignment/review workflow documented in
[`CHECKLIST_ANALYTICS_REVIEW_WORKFLOW.md`](./CHECKLIST_ANALYTICS_REVIEW_WORKFLOW.md) and
[`CHECKLIST_COMPLETION_CONTRACT.md`](./CHECKLIST_COMPLETION_CONTRACT.md): a scheduled, observed,
in-person evaluation (someone watches someone else perform a task and scores it live), not a
self-paced form an employee fills in alone. This is a per-role navigation aid across the detailed
per-PR contracts in [`API_CONTRACTS.md`](./API_CONTRACTS.md); it does not restate mechanics already
covered there or in the RBAC matrix -- see [`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md) for the
authoritative policy/scope for every endpoint named below.

`ChecklistWorkplaceSettings.moduleEnabled` (tenant-off by default) is currently a stored/displayed
preference only -- at this SHA no session route, controller, or nav item reads it to gate access,
so setting it to `false` does not disable the module for a tenant's users; treat it as a
not-yet-enforced setting, not an access-control gate, until a guard actually checks it. The module
adds exactly one new top-level nav item across every role, `/manager/checklists` -- everything else
below is a sub-route or contextual dialog of an existing screen.

## Admin (`/admin/checklists/sessions`)

Creates and schedules sessions via a 4-step wizard (participants -> checklist -> schedule/location
-> confirm), single or bulk (PR 295/292); manages the workplace settings dialog from the same
screen's header (`ChecklistWorkplaceSettingsDialog`, PR 286/305); opens a per-session report
(`/admin/checklists/sessions/:id`, PR 300) with Summary/Participants/Criteria/Files/History tabs;
recalculates a session's score with a required audited reason (`POST .../recalculate`, PR 300);
submits a required-location override with a reason when an observer couldn't capture geolocation
(PR 290/304). Admin is the only role that can recalculate, and the only role unrestricted by
`sessionScope()`/`observerActionScope()` row-level checks -- see API_RBAC_MATRIX.md's PR 300/302
entries for exactly which actions that unlocks (e.g. overriding a session outside the admin's own
assigned-observer relationship).

The recalculation dialog (PR 335) offers **Checklist settings** (the assignment's original points
and weights, also the default for older clients) and **By criteria** (marked / non-skipped total,
equal weight). A selected scale level counts as a mark; rejected answers earn nothing. A reason
is required. After saving, the dialog shows the actual before/after; close it to return to the
report. Summary and History show each immutable revision's formula. Retrying an unchanged failed
request reuses its idempotency key; changing the formula/reason starts a new operation. The
original revision is returned on replay and never rewritten. See `API_CONTRACTS.md` for skip,
not-scored, scale and snapshot semantics.

The schedule step supports **Same for everyone** and **Set each separately** (PR 329). A shared
schedule keeps the existing Start now / Schedule for later behavior and accepts an optional
duration. Individual scheduling requires a date/time for every selected employee and allows an
optional duration for each (1–1440 minutes). Switching modes or navigating back/forward preserves
edits; removed employees are excluded from the submitted schedule. The confirmation step shows
each employee's appointment and duration before creation. Individual appointments are created as
scheduled sessions and are never auto-started, even if the shared mode was previously Start now.

The displayed timezone is the browser's IANA timezone, as in PR 303. Local datetime inputs are
converted to absolute UTC instants; invalid dates and nonexistent local times at a spring DST
transition block progression instead of silently moving the appointment. An ambiguous autumn
hour retains the browser's existing earlier-offset behavior. Session reads and reminders retain
each session's declared timezone/instant; see the PR 329 bulk contract in `API_CONTRACTS.md`.

## Manager (`/manager/checklists`, and the admin session screens scoped to their team)

Manager shares the admin session-list/wizard/report screens (`checklistSessionsManage`:
create/reschedule/cancel), scoped to their effective team (Group ∪ Department DIRECT ∪
ReportingLine DIRECT) by `sessionScope()` -- a manager can schedule and reschedule sessions for
their reports but never runs one (`checklistSessionsRun` excludes manager) or recalculates a score
(`checklistScoreRecalculate` is admin-only). `/manager/checklists` (PR 299, the module's one new
nav item) is a dashboard, not a session-management screen: period-scoped aggregate cards, a
distribution/trend chart with an accessible table fallback, and an employee table with per-employee
drill-down into their sessions -- all through `GET /checklists/manager-analytics`
(`checklistManagerAnalyticsRead`), scoped the same way.

## Instructor / observer (`/instructor/checklists`, "Проведение" tab)

The observer's session list at `/instructor/checklists/sessions` includes “New session” (PR 331).
It opens the shared mobile wizard with the signed-in instructor fixed as observer and no change
or observer-search control. Employee lookup has loading, empty and retryable error states;
published-sheet lookup also distinguishes loading, failure and an empty library. Scheduling,
individual appointments and optional duration use the same controls as the admin wizard.
“Start now” creates and starts the observer's own session; scheduled sessions remain scheduled.
Creation refreshes the observer list. Server validation is authoritative: `checklistSessionsCreateOwn`
allows creation only for oneself, within the tenant/manager learner scope described in
`API_RBAC_MATRIX.md`, without granting general scheduling management rights.

The instructor named as a session's `observerId` is the day-to-day role that runs it through this
screen and the only one who answers criteria during conduct -- checking off/scoring each item live while watching the learner perform
the task, not the learner self-reporting. `checklistSessionsRun` (start/pause/resume/complete) is
`['admin', 'instructor']`, not instructor-only -- admin is unrestricted by session scope and can
run any session directly via the lifecycle API, this screen is just the instructor's day-to-day
entry point into the same endpoints. Mobile-first conduct screen
(`ChecklistSessionConduct`, PR 297): stepped criterion cards (checkbox, scale, or per-item
`ChecklistScale` when set, PR 293), Skip when `item.allowSkip`, required photo evidence when
`item.photoRequired`, one-shot geolocation capture on start/end (never continuous tracking, PR
290), and structured feedback (`PATCH .../feedback`, independently-saved strengths/development
areas/next steps). If the assigned observer genuinely cannot run a scheduled session, they (or
admin on their behalf) report it via `POST .../observer-unavailable` (PR 302); reassignment is a
manager/admin action (the existing `PATCH .../:id`), not something the unavailable-report itself
does. See API_RBAC_MATRIX.md's PR 302 entry for the dual-role (manager+instructor) scope nuance
that action deliberately enforces.

## Learner / employee (`/learn/checklists`)

Three client-side status tabs over the learner's own sessions (`ChecklistInstance.userId ===
self`, PR 298); result visibility is server-enforced, not merely hidden in the UI --
`ChecklistWorkplaceSettings.feedbackVisibility` (`after_completion` by default, or `live`)
decides whether a learner can see the observer's score/structured feedback before the session
reaches `completed`; every other role always sees it. A completed session with every criterion
skipped renders an explicit "not scored" result (PR 306 anomaly #11's `describeChecklistSessionResult()`),
never a blank or misleading `0%`.

## Cross-cutting, not specific to one role

- **Notifications/reminders**: `ChecklistSessionReminderWorker` (PR 291) is a peer of the existing
  `ChecklistDeadlineWorker` on its own job/scheduler id, not a variant of it; `pre_start` (24h
  before `scheduledAt`) and `incomplete_after_start` (24h after `startedAt`) reminders are
  created/moved/suppressed by lifecycle hooks in `create`/`update`/`transition`, DB-idempotent
  independent of the job queue's own retry/backoff.
- **Concurrency/idempotency**: every lifecycle mutation is version/status-conditional inside a
  Serializable transaction; `create`/every transition/`recalculate` additionally accept a
  client-supplied `idempotencyKey` so a network retry replays the original response instead of
  erroring or double-mutating -- see API_CONTRACTS.md's PR 301 section for the full mechanism.
- **Privacy/audit**: admin geo-override (submit and read) and privileged photo-evidence access
  outside a normal review assignment are audited (`checklist_location.accessed`/
  `checklist_evidence.accessed`); routine access by the learner or their assigned reviewer is not,
  since it is already covered by the existing `checklist_item_result.reviewed` entry. Retention/
  deletion policy is an intentionally open owner decision, `docs/status/OPEN_DECISIONS.md`
  DEC-CHKS-002 -- not yet implemented.

## Changes delivered to participants (PR 345)

The existing notification center shows localized notices when a session is assigned, rescheduled
(including duration/timezone changes) or deleted. Both participants receive them; replacing an
observer also notifies the former observer. Bulk scheduling sends each recipient one notice for
the call, including one for a shared observer. Completion notifies the employee, with a link to
that session in `/learn/checklists`; the link works even when the session is outside the first
list page. Detail access and feedback visibility are still enforced by the API. Deleted sessions
and former observers link back to their own list. An unavailable employee session shows a back
action instead of silently opening an unrelated session.

Notice and mail text is generic: it contains no feedback, scores, location or other people's
email addresses. Mail is optional and uses the existing configured delivery capability; portal
notices are persisted with the change regardless of mail availability. Queued mail about an old
change is suppressed after deletion; the deletion notice itself remains deliverable. The
transaction/replay and delivery contract is specified in `API_CONTRACTS.md`.

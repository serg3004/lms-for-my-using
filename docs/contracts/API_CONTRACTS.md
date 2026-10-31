# API Contracts

> **Статус:** `CURRENT` human semantics / invariants.
>
> **API surface authority:** runtime OpenAPI + controllers. This file is not a complete route inventory.

## Current API authority

- Base path: `/api/v1`.
- Runtime OpenAPI JSON: `/api/v1/api-json`.
- Swagger UI: `/api/v1/docs`.
- Legacy `/api/v1/openapi` is deprecated and is not current authority.
- Generated API navigation: [`../generated/API_INDEX.md`](../generated/API_INDEX.md).

For a concrete endpoint, verify current runtime OpenAPI/controller metadata. Do not add a manually maintained route list here.

## Authentication/session semantics

- Access tokens are JWTs and may be supplied through supported cookie/bearer flows.
- Refresh tokens are backed by server-side session state and rotate.
- Logout revokes the current session; logout-all revokes all sessions for the current user.
- Password-reset request/confirm is implemented; delivery-provider availability is a separate live/config concern.

Historical descriptions of stateless-only logout or an intentional password-reset `503` do not override current auth code.

## Tenant and authorization semantics

- Authenticated requests operate within current organization context.
- Role policies are owned by `apps/api/src/modules/auth/roles.ts`; object-level guards/access policies provide additional enforcement.
- The current role set is owned by Prisma/shared role definitions, not this document.
- Human RBAC semantics: [`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md).
- Generated current policy view: [`../generated/RBAC.md`](../generated/RBAC.md).

## Error contract

Canonical API errors use the shared runtime response/error layer. Current stable code/types are authoritative for fields and codes.

Representative shape:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  },
  "path": "/api/v1/example",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Do not document additional fields as guaranteed unless the current shared/runtime contract contains them.

## List-query evolution

Pagination/filter/sort behavior is endpoint-specific until code proves a shared runtime response contract. Existing response shapes must not change silently.

When changing a list endpoint:

- use runtime validation;
- keep queries organization-scoped;
- allowlist sortable/filterable fields;
- update backend tests, runtime OpenAPI and affected frontend client in the same PR;
- update this document only for human semantics/invariants.

Adding an optional query filter (e.g. a `search` term) to an existing paginated list
endpoint's own allowlisted fields is not itself a human-semantics/invariant change and
does not require an edit here, as long as authorization/tenant-scoping is unchanged.
Runtime OpenAPI and [`../generated/API_INDEX.md`](../generated/API_INDEX.md) remain the
route-shape authority.

## Organization structure import and history

An organization-structure CSV preview never mutates domain data. A successful preview stores
the exact normalized validated payload server-side and returns a random opaque token whose
SHA-256 digest, tenant, actor, kind, mode, 30-minute expiry, and consumption state are persisted.
Commit applies only that snapshot in a Serializable transaction, revalidates it against current
state, and atomically claims the token. Tokens are single-use and cannot cross actors or tenants.
Neither raw CSV nor the token is written to organization-structure events. A Department import row
naming an archived department as its parent is rejected at preview time; a Membership import row
importing a new PRIMARY membership closes the user's existing current primary membership (in any
department) and records that closure as its own `department_membership.closed` event, distinct
from the `department_membership.created` event for the new row.

`GET /org-structure/counts` returns the section counts for the organization-structure tabs:
`{ departments, positions, positionCourses, groups, historyEvents }`. Each is a `count()` over the
caller's own tenant only; departments, positions and PositionCourses count `status = active`, groups
count `status = active` and not deleted, and `historyEvents` counts every `OrgStructureEvent` of the
tenant. No rows are loaded.

Archiving a Department is non-destructive and is rejected while it has active children, current
memberships, current local managers, or active Department assignments. Archiving a Position is
rejected while a current membership or active PositionCourse uses it. Restore does not reactivate
relations or learning targets.

## Organization external references (HRIS/SCIM readiness)

`OrgExternalReference` maps a tenant's internal `DEPARTMENT`/`DEPARTMENT_TYPE`/`POSITION` to an
identifier in an external system (`sourceSystem`). The internal UUID stays the sole canonical
primary key everywhere else; no domain table has a foreign key to this one, and no domain lookup
resolves through an external id implicitly -- a caller must call `GET
/org-external-references/resolve` explicitly. `sourceSystem` is normalized to a lowercase slug
(1-64 chars); `externalId` is case-exact (1-255 chars) and never normalized. `POST
/org-external-references` is create-only: a duplicate (organization, sourceSystem, entityType,
externalId) is always a 409, even when it targets the same entity, so a mapping is never remapped
silently -- remapping requires an explicit `DELETE` first. One internal entity may hold mappings
from multiple source systems at once. Archiving the mapped entity never deletes the mapping, and
resolving a mapping never reactivates an archived entity; `resolve` reports the target's current
status for the caller to act on. This PR ships the domain model and resolution service only --
no SCIM endpoint, HRIS polling, webhook sync, or background reconciliation exists.

## Checklist workplace-training settings

`GET/PATCH /checklists/workplace-settings` is tenant-scoped configuration for the planned Checklist
"workplace training session" mode (`docs/product/future/CHECKLIST_WORKPLACE_TRAINING_IMPLEMENTATION_PLAN.md`,
`docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`). `organizationId` always comes from the
authenticated caller, never a request parameter or body field. A tenant that has never written a
settings row reads back documented safe defaults instead of a 404: `moduleEnabled=false`,
`highPerformanceThreshold=90`, `criticalThreshold`/`lowThreshold` both `null`
(`docs/status/OPEN_DECISIONS.md` DEC-CHKS-001 -- an unresolved owner decision, not an omission),
`defaultGeolocationPolicy=off`, `feedbackVisibility=after_completion`. `PATCH` is a partial update:
only the fields present in the request body change, and `criticalThreshold`/`lowThreshold` accept an
explicit `null` to clear a previously-set value. A request setting both `criticalThreshold` and
`lowThreshold` is rejected (422) if `criticalThreshold < lowThreshold`. `defaultGeolocationPolicy` is
a tenant-wide default that `POST /checklist-sessions` can override per session
(`locationCapturePolicy` in the request body); `highPerformanceThreshold`/`criticalThreshold`/`lowThreshold`
are not yet consumed by any scoring endpoint (deferred to a future reporting PR).

## Checklist sessions (workplace-training lifecycle)

`ChecklistSession` (PR 288/289) is a 1:1 overlay over an existing `ChecklistInstance`
(`docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`), not a new top-level entity -- it never
duplicates score or snapshot fields already owned by the instance. Observer is the existing
`instructor` role in the original overlay design; PR 351 makes selection configurable as described below.

Endpoints: `POST /checklist-sessions` (create), `GET /checklist-sessions` (list, paginated, filters
by `status`/`observerId`/`overdueOnly`; `sort=recent` orders newest-started first and `excludeSessionId` leaves one
session out -- the observer's "past sessions" block (PR 332) uses `status=completed&learnerId&checklistId&sort=recent`
inside the usual `sessionScope()`), `GET /checklist-sessions/:id`, `GET
/checklist-sessions/:id/events` (append-only lifecycle audit trail), `PATCH /checklist-sessions/:id`
(reschedule), and one POST-action route per transition: `:id/start`, `:id/pause`, `:id/resume`,
`:id/complete`, `:id/cancel`.

State machine: `scheduled -> in_progress -> paused -> in_progress -> completed`, plus
`scheduled -> cancelled`. `complete` is reachable only from `in_progress`, never directly from
`paused`. Every transition and `create`/`reschedule` appends a `ChecklistSessionEvent` row in the
same database transaction as the mutation -- never a best-effort side write.

`PATCH` (reschedule) and observer reassignment are only accepted while `status === 'scheduled'`;
once a session starts, its participants are fixed for the rest of its lifecycle. Creating a session
validates the observer against the current tenant eligibility setting and that the target instance does not already
have one (`instanceId` is unique -- a second `POST` for the same instance is a 409).

Every mutating call (`PATCH` and every transition route) requires the caller's current `version` in
the request body. A `version` that no longer matches the row is a 409 (someone else already
transitioned or rescheduled it -- reload and retry); a structurally invalid transition for the
session's *current* status (e.g. `complete` on a `scheduled` session) is a 400, a distinct failure
class from the stale-write 409. Terminal transitions run inside a Postgres `Serializable`
transaction with bounded retry on serialization failure
(`runSerializableWithRetry`, `apps/api/src/modules/departments/org-structure-event.ts`, reused
rather than duplicated), so two concurrent requests racing on the same session can never both win.

Read access uses `ChecklistReviewAccessService.sessionScope()`: admin sees its tenant; manager sees
its team plus own observer assignments; instructor/mentor see own observer assignments; learner
sees own employee sessions plus own observer assignments. Feedback masking still applies to the
employee view, while an assigned observer sees the information needed to conduct their session.
`checklistSessionsRead` includes all system roles. Scheduling/export use the independent
`sessionManagementScope()` (admin tenant, manager effective team); `checklistSessionsManage`
remains admin/manager. `checklistSessionsRunOwn` includes all five roles but always requires
`observerId == currentUser.id` for conduct, including admin.

`GET /checklist-sessions/to-conduct` returns the usual paginated projection, pinned to the
caller as observer; query filters are intersected with this scope. `GET
/checklist-sessions/:id/conduct` returns the usual detail projection with the same own-only
scope (foreign/non-observed/nonexistent IDs all return 404). Both return live observer feedback.
The existing instance detail, item answer/skip/photo routes admit the assigned observer; every
session-linked instance write independently verifies its observer in the service. Standalone
instance and reviewer rules remain unchanged. Observer UUIDs are normalized at the HTTP boundary;
service identity checks also ignore UUID letter case. A bulk request containing its observer as
an employee is rejected before any assignments are written. Employee = observer is rejected on single/bulk/repeat
creation and reassignment, without changing existing rows or lifecycle audit events.

The existing `/instructor/checklists/sessions` list/detail routes admit authenticated observers
of every system role and use their role's existing shell. Learners reach the shared queue from
«Чек-листы», managers from «Моя команда», mentors from their existing checklist page; no menu
items or other instructor routes are granted. The block disappears when there are no assignments.

Conduct actions (start/pause/resume/complete, feedback, context and location submission) additionally
use `observerActionScope()`: all roles, including admin, must be the assigned observer (PR 352).
The manager+instructor read union never authorizes conducting another observer's session (404).
Cancellation retains the scheduler's team scope. A transition's idempotent replay checks current
object access before returning its cached response, even when the original version is stale; a key
already used for a different session transition returns 409. A denied replay performs no mutation.

`overdue` is a derived, not stored, boolean: true only while `status === 'scheduled'` and
`scheduledAt` has passed. It is not persisted and carries no separate lifecycle status of its own.

## Checklist criteria, skip, scoring v1, and geolocation capture (PR 290)

Extends the existing `ChecklistItem`/`ChecklistItemResult`/`ChecklistInstance` pipeline
(`docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md` scoring v1) -- no new result table, no
second scoring algorithm. Applies to every checklist (session-backed or plain), but is a no-op for
any checklist that never uses the new per-item fields: `weight` defaults to `1` and `allowSkip`/
`autoSkipUnanswered` default to `false`, so a checklist created before PR 290 scores exactly as it
did before.

`ChecklistItem` gains three optional creation/update fields: `weight` (1-100, default 1, multiplies
into both a criterion's earned and max score), `allowSkip` (default false, whether this criterion
may be explicitly skipped), and `autoSkipUnanswered` (default false, whether an unanswered instance
of this criterion silently resolves as skipped instead of blocking completion). Setting
`autoSkipUnanswered=true` requires `allowSkip=true` in the same effective state -- rejected as 422 on
create, and re-validated server-side on `PATCH` against the item's current stored state (a partial
update setting only one of the two fields is checked against what the other already is in the DB).

`POST /checklist-instances/:instanceId/items/:itemId/skip` (same `checklistItemResultsWrite` role
policy and instance-ownership/reviewer-access checks as the existing submit-result endpoint) records
`ChecklistItemResult.answerState = 'skipped'` for a criterion whose item has `allowSkip=true` (400
otherwise); clears any previously checked/scale-level answer and deletes a previously attached photo
object. Answering a skipped item afterward (`PATCH .../items/:itemId`) un-skips it (`answerState`
reverts to `'answered'`).

Scoring formula: `earned = sum(item.weight * result.points)` and `max = sum(item.weight * itemMax)`,
both computed **only over items whose `answerState !== 'skipped'`** -- a skip is excluded from both
the numerator and the denominator, never counted as a zero. `ChecklistInstance.percentage` /
`totalScore` / `maxScore` are recomputed on every mutation exactly as before, now skip-aware.
`ChecklistInstance.scored` (new field) is `false` when the resulting max is zero (every item got
skipped, or a checklist has zero point-earning items) -- in that case `percentage` stays `0` but
callers must read `scored` to distinguish "nothing was actually gradable" from "failed everything";
`passed` is always `false` when `scored=false`, regardless of `percentage`. An `autoSkipUnanswered`
item that's still unanswered is auto-resolved to `answerState='skipped'` (a real, queryable
`ChecklistItemResult` row, not just a computed value) the moment any other mutation on the same
instance triggers a recompute -- it never blocks `allRequirementsSatisfied`, `isRequired` or not.

Photo evidence is unchanged from the existing pipeline: still
`ChecklistItemResult.photoUrl/photoObjectKey/photoFileName/photoMimeType/photoSizeBytes`, still the
same upload/presigned-download endpoints and access checks (`getItemPhotoDownload` scopes by
`instance.userId === requester || isPrivileged`, presigned URLs expire in 300s) -- no
`ChecklistEvidence` table, no more than one photo per criterion, and no malware-quarantine claim
this PR doesn't actually implement.

Geolocation capture: `POST /checklist-sessions/:id/location/:point` (`point` is `start` or `end`;
`checklistSessionsRunOwn` role policy plus `observerActionScope()`) and
`GET /checklist-sessions/:id/location` (read-oriented `sessionScope()`). At most one capture per `(session, point)`
-- enforced by the PR 288 unique constraint, so a duplicate submission is a 409, never a silent
overwrite ("start/end only, no continuous tracking" -- the client calls `getCurrentPosition` once
per point, never `watchPosition`; this endpoint pair is the server-observable half of that
constraint). A session whose `locationCapturePolicy` is `off` rejects any capture attempt (400);
`optional`/`required` both accept `captured`/`denied`/`unavailable` status reports (coordinates are
required in the request body if and only if `status === 'captured'`). A non-observer capture is rejected with 404 even for admin and even with
`overrideReason` (PR 352); previous override records are preserved. `GET .../location` applies a privacy-safe
projection: only the assigned observer and admin see `latitude`/`longitude`/`accuracyMeters`; every
other caller with read access to the session (e.g. a manager) sees only that a capture happened
(`capturePoint`/`status`/`capturedAt`/`capturedBy`), never where.

## Checklist session reminders (PR 291)

No new HTTP endpoints -- this is background automation over the `ChecklistSession` lifecycle, not a
request/response contract. `ChecklistSessionReminderWorker`
(`apps/api/src/modules/checklists/checklist-session-reminder.worker.ts`) is a recurring job
registered through the same `BackgroundJobsService.registerHandler`/`registerRecurring` pattern as
`ChecklistDeadlineWorker`, on its own job name (`checklists.session-reminders-due`) and scheduler id
-- the two coexist as independent recurring jobs; this one never touches `ChecklistInstance.dueAt`.

Two reminder types, tracked as `ChecklistSessionReminder` rows (unique per `(session, type)`, PR
288): `pre_start` (scheduled for 24h before `ChecklistSession.scheduledAt`, created when a schedule
is first set on `POST /checklist-sessions`, moved when rescheduled via `PATCH`, suppressed if the
schedule is cleared) and `incomplete_after_start` (scheduled for 24h after `startedAt`, created
exactly once by the `start` transition, never re-created by `resume`). Both are suppressed
(`status='suppressed'`, never sent) the moment a session reaches `completed` or `cancelled` -- the
lifecycle service does this synchronously in the same transaction as the transition, and the worker
independently re-checks session status before sending as a defensive second layer.

When a reminder becomes due, the worker claims it with a conditional `updateMany(... WHERE
status='pending')`: a count other than 1 means a concurrent run already claimed it, so retries
(whether from the job queue's own backoff or an overlapping worker tick) can never double-send --
this is a database-level idempotency guarantee, independent of and in addition to the queue's
`idempotencyKey` dedupe. Claiming, appending a `ChecklistSessionEvent` (`reminder_sent`), creating
an in-app `Notification` for the assigned observer, and writing an `OutboxEvent`
(`checklists.session-reminder-notify`) all happen in one transaction (`OutboxService.runInTransaction`)
-- this is the first production consumer of the `Notification`+`OutboxEvent` pairing in the
codebase. Email delivery is a separate, best-effort async step triggered by that outbox event:
`ChecklistSessionReminderDelivery` (mirroring `PasswordResetDelivery`,
`apps/api/src/modules/auth/password-reset.ts`) POSTs to a configured provider-neutral webhook
(`CHECKLIST_SESSION_REMINDER_DELIVERY_URL`/`_TOKEN`); an unconfigured endpoint is a documented,
valid no-op -- the in-app `Notification` is already durable regardless of whether email delivery is
configured or succeeds. PR 337: when `RESEND_API_KEY` and `MAIL_FROM` are set, both this delivery and
`PasswordResetDelivery` send the email directly through Resend (`common/mail/resend.ts`, recipient
looked up inside the organization) and the webhook is not used; a missing address is skipped, a
provider failure is counted in the delivery-error metric and never blocks the workflow. PR 342: when
Resend is not configured but `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are, the same two deliveries
send through SMTP instead (`common/mail/smtp.ts`; `MAIL_FROM` defaults to `SMTP_USER`); Resend wins
if both are set, and a server rejection (auth, sender, recipient) counts as `http_error`.

## Checklist session admin API (PR 292)

Rounds out the admin surface for `ChecklistSession` (list/detail/create already existed from PR
289) with bulk create, repeat, participant/checklist lookups for the "new session" wizard, and a
richer list/detail projection. PR 331 adds own-session creation rights for instructors (see
[`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md), "Role policy vs object scope").

`POST /checklist-sessions/bulk` accepts one `checklistId` + up to 100 `learnerId`s + one shared
`observerId`/`scheduledAt`/`locationCapturePolicy`/`timezone`, and creates independent
instance+session pairs per learner. Own-only scope validation is request-wide before writes
(PR 331, below); otherwise this is **not** an all-or-nothing batch. Each recipient is processed
individually through the existing `ChecklistsService.assignChecklist` (so per-learner
active-assignment conflicts surface the same way a single `POST /checklist-instances` would) and
the response reports per-recipient outcome: `{learnerId, status: 'created'|'skipped'|'failed',
sessionId?, reason?}`, plus `created`/`skipped`/`failed` counts. A learner who already has an
active assignment for the checklist is `skipped` (400 from `assignChecklist`, not fatal to the
batch); an unknown/invalid learner is `failed` (404); anything else propagates as a real error and
aborts the remaining batch. One `checklist_session.bulk_created` audit-log entry is written per
call, summarizing total/created counts.

PR 329 adds optional `durationMinutes` (integer 1–1440, or `null`/omitted when unknown) to
single create, bulk create, versioned PATCH, and session responses. Existing rows remain `null`;
duration is planning information and does not change the lifecycle timer or scoring.
Bulk requests may additionally provide `schedules: [{learnerId, scheduledAt, durationMinutes?,
timezone?}]`. When present, the array must contain exactly one entry for every selected
`learnerId`, with no duplicates or extra recipients; malformed schedules fail validation before
any assignment is created. Entries are matched by ID, not position. Each entry requires an
absolute UTC `scheduledAt`; it overrides the shared instant. Duration and timezone inherit the
shared values unless overridden; an explicit per-recipient `durationMinutes: null` clears the
shared duration. The original bulk format remains valid without any new fields.

Each recipient's assignment/session pair now runs through `runSerializableWithRetry`; an
active assignment discovered on a concurrent retry remains a per-recipient `skipped` outcome.
Scope failures and the remaining recipients' partial success are unchanged. Single-create and
lifecycle idempotency keys continue to replay their original responses, including duration.
Every created session's pending `pre_start` reminder is based on that session's own instant,
exactly 24 elapsed hours earlier. Rescheduling moves only its pending reminder; changing duration
alone does not move it. This arithmetic remains UTC-based across DST boundaries.

`POST /checklist-sessions/:id/repeat` creates a **fresh** `ChecklistInstance` + `ChecklistSession`
pair for the same learner/checklist, copying `observerId`/`locationCapturePolicy`/`timezone`/`durationMinutes` from
the original -- it never reopens or mutates the original session/instance (both are terminal by
then). Only callable when the original session's own status is `completed` or `cancelled` (400
otherwise, e.g. a session still `in_progress`); because `ChecklistSession` is a 1:1 overlay,
repeating also depends on the underlying `ChecklistInstance` no longer being active -- completing
the *session* does not complete the *instance* (they are independently-lifecycled per
`ADR_CHECKLIST_SESSION_OVERLAY.md`), so a repeat attempt made before the learner actually submits
the checklist still fails with the same "already has an active assignment" 400 that a fresh manual
assignment would. Writes a `checklist_session.repeated` audit-log entry.

`DELETE /checklist-sessions/:id` (`checklistSessionsManage`, scoped by `sessionScope()`) soft-deletes a
session that has not started (`deletedAt`); a started, completed or cancelled session answers 400 and is
untouched, an unknown/out-of-scope/already-deleted one 404. In one transaction it suppresses the pending
reminders, soft-deletes the paired `ChecklistInstance` when it is still `assigned`, and appends a `deleted`
event; a `checklist_session.deleted` audit entry follows. Deleted sessions are hidden from every read
(`GET`, list, events, transitions, analytics); the event history stays append-only.

`POST /checklist-sessions/:id/message` (`checklistSessionsManage`, same scope) with `{ message }` (1..500
characters after trimming) writes the participant an in-app `Notification` (`checklist_session_message`,
data: `sessionId`, `checklistTitle`, `message` -- never feedback, scores or location) and an outbox event
`checklists.session-message-notify` for best-effort email through the same provider-neutral endpoint as
reminders (`kind: participant_message`; an unconfigured endpoint is a no-op). It appends a `message_sent` event
and a `checklist_session.message_sent` audit entry. A completed/cancelled session answers 400; more than 3
messages per session in 10 minutes answer 429. Editing time and observer stays `PATCH /checklist-sessions/:id`;
the admin UI now sends both in one request.

`GET /checklist-sessions/participants?role=learner|observer` backs both wizard entry points.
Admin/manager may select any active, undeleted user allowed by the tenant observer-eligibility setting (PR 351). PR 331 adds
`checklistSessionsCreateOwn` for instructor: a caller without management rights sees only
themselves in observer lookup and may create only with `observerId === currentUser.id` (404
otherwise). Learner lookup and single/bulk creation all use `participantLearnerScope()`: active,
undeleted users in the caller's tenant; manager callers (including manager+instructor) remain
limited to their effective Group ∪ Department DIRECT ∪ ReportingLine DIRECT scope. Search and
scope filters are intersected, never overwritten. Search supports name/email substring and
pagination.

Own-only bulk creation preflights the checklist and every learner UUID. An inaccessible checklist
or learner returns 404 before writes; existing active assignments still yield per-recipient
`skipped` outcomes. Admin/manager partial-success behavior is unchanged. Single creation verifies
the assignment's learner scope before any idempotency replay. Reusing a creation key with another
assignment or observer returns 409 rather than exposing a different session's response. If identical
keyed creations race on the unique assignment constraint, the losing request rechecks the committed
key and returns its matching response; a mismatched key/observer stays 409. A fresh single creation records `checklist_session.created`; replay does not duplicate that audit entry.
The transactional `created` session event and existing bulk audit retain the authenticated actor.
Creation rights do not grant instructor access to PATCH/cancel/repeat or another observer's
sessions.

`GET /checklists?status=published` (existing route, now accepts an optional `status` query param)
backs the wizard's checklist picker -- filters out `draft`/`archived` checklists client-side would
otherwise have to do manually. Omitting `status` preserves the prior unfiltered behavior.

PR 393: each row of `GET /checklists` also carries `creator: {id, firstName, lastName} | null` (null when the
author account was deleted) next to `createdAt`; the admin list shows both as "Created by" / "Created".

PR 394: `POST /checklists/bulk` (`checklistsCreate` roles) takes `{ action: archive | draft | publish | delete, ids[] }`
(1-100 UUIDs, duplicates ignored, own organization only) and answers `{ action, done, skipped, results[] }` with one entry
per id: `{ id, result: "done" }` or `{ id, result: "skipped", reason, message? }`. Reasons: `not_found` (also another
organization's sheet), `forbidden` (the single-sheet edit rule: author, admin, or `allowEditByAll`), `already_in_status`,
`cannot_publish` (same checks as publishing one sheet; `message` carries the cause) and `moved_to_draft` (a delete refused
because of active assignments turns the sheet into a draft instead). One audit record per changed sheet plus one
`checklist.bulk` summary record. A skipped sheet never fails the request.

PR 395: checklist folders (organization-wide tree, up to 5 levels, the root folder is level 1; `checklistsRead` roles read,
`checklistsCreate` roles write, and a learner never has access). `GET /checklist-folders` returns
`{ folders[], checklistCount }`; each folder is `{ id, parentId, name, visibleToStaff, createdBy, createdAt, canManage,
checklistCount, totalChecklistCount }` (direct sheets and sheets of the whole subtree; `checklistCount` of the response is the
number of sheets the caller can see). `POST /checklist-folders` `{ name, parentId?, visibleToStaff? }` and `PATCH
/checklist-folders/:id` `{ name?, parentId?, visibleToStaff? }` (rename, move, open to staff) answer 400 for a depth over 5 or a
move into itself or a descendant, 409 for a name already used by a sibling (compared case-insensitively), 404 for a missing,
other-organization or invisible folder and 403 when the folder is visible but not the caller's to change. Only the administrator and the
creator change a folder. A folder is visible to the administrator, to its creator and, when `visibleToStaff` is on, to every
role except the learner; a subfolder is visible only when its whole chain of parents is. `GET
/checklist-folders/:id/delete-impact` and `DELETE /checklist-folders/:id` answer `{ folders, checklists, movedToDraft[{id, title}] }`:
the deletion soft-deletes the folder, every subfolder and every sheet inside; a sheet with an active assignment is kept, turned
into a draft and moved to the root (`movedToDraft`). One audit record per operation. `GET /checklists` leaves out sheets of folders the
caller cannot see and carries `folderId` on every sheet; `PATCH /checklists/:id` accepts `folderId` (uuid, or `null` for the root) and
`POST /checklists/bulk` accepts the action `move` with `folderId` (required key, `null` = root; skip reason `already_in_folder`). The
target folder must be visible to the caller; moving a sheet needs the right to edit that sheet. A copy stays in the folder of the original.

`GET /checklist-sessions` and `GET /checklist-sessions/:id` now return a joined projection instead
of the bare `ChecklistSession` row: `checklist: {id, title}`, `learner: {id, firstName, lastName,
email}`, `observer: {id, firstName, lastName, email}`, and `result: {instanceStatus, percentage,
passed, scored}` sourced from the underlying `ChecklistInstance` -- this is a read-only join, not a
new persisted field, and requires no `ChecklistSession` schema change. `list()` also gained
`checklistId`, `learnerId`, `scheduledFrom`/`scheduledTo`, and `search` (matches learner name or
checklist title, case-insensitive) query filters, alongside the existing `status`/`observerId`/
`overdueOnly`/pagination filters from PR 289.

## Employee-list session import (PR 364)

`POST /checklist-sessions/import/preview` accepts multipart `file` (CSV/XLSX) and performs no
session/assignment writes. `POST /checklist-sessions/import` accepts the same file plus multipart
`settings`, a JSON string with `operationId` (UUID), `checklistId`, `observerId`, optional shared
`scheduledAt` (ISO date-time or null), `durationMinutes`, `timezone` and `locationCapturePolicy`.
There are no client-supplied learner UUIDs and no per-row scheduling fields. The checklist must be
published and the observer eligible under current workplace settings.

Owner format decision (2026-10-29, DEC-CHKS-006): exactly one column headed `email`. CSV is UTF-8
(BOM/quoted fields/CRLF accepted), XLSX has one worksheet. The limits are 1 MiB and 100 data
records including invalid/duplicate records. Header matching is case-insensitive. Email values
are trimmed and case-normalized, with the first valid occurrence retained. Invalid values,
formula-like CSV values, and non-literal Excel cells (including formula/hyperlink objects) are
skipped, never evaluated or used as identities. Invalid format, encoding, header, workbook or
limits reject the file before any session is created. XLSX ZIP inflation, XML cell/row counts and
row addresses are bounded before ExcelJS loads the workbook; rejected long text is truncated in
the response. File-error messages use stable `session_import.*` codes.

Both endpoints require `checklistSessionsImport` (admin/manager/instructor/mentor; learner 403).
Every email lookup uses active, non-deleted users in the tenant intersected with
`participantLearnerScope()`. An unknown, inactive, foreign-tenant or out-of-team email returns the
same `outside_scope` reason, with no employee ID/name. Preview is advisory: import re-parses the
file and rechecks the scope, then checks the user again inside each mutation transaction. An
instructor can import employees across the organization but must be the observer, under the
existing `assertSessionCreationObserver()` rule. Self-observation is skipped per row.

Preview returns `{ready, skipped, rows}`. Each row carries its one-based record number (header is
record 1), normalized email, `status: ready|skipped`, optional reason and an employee label only
when accessible. Import returns `{created, skipped, failed: 0, rows, results}`; created rows add
`sessionId`, and `results` contains the created session identifiers for the existing wizard.
Reasons: `invalid_email`, `duplicate`, `outside_scope`, `self_observer`, `active_assignment`,
`scope_changed`. The displayed report uses these exact server results and localized reasons.

Each accepted row reuses normal assignment/session creation, snapshot capture, reminders and
notifications in a single Serializable transaction. An active assignment skips that recipient;
an unexpected failure aborts the current row without an orphan pair, while previously committed
rows remain. Retrying the same file/settings with the same actor-scoped `operationId` replays
already-created row IDs even if those sessions have since completed. Changed file/settings with
that operation ID return 409. Skipped/inaccessible rows are revalidated on retry; no cached result
bypasses the current scope. Idempotency uses the existing `ChecklistIdempotencyKey` store, not a
new import entity. Files are not retained. Each completed import request audits
`checklist_session.imported` with actor, checklist, operation ID and created/skipped/total counts;
no raw file, emails or employee names are recorded in audit metadata.

## Session summary export (PR 373)

`GET /checklist-sessions/export/summary?ids=<comma-separated UUIDs>&format=xlsx|csv`
returns JSON `{ filename, csv, rows, rowCount, sessionIds, layout }`. `format` defaults to `xlsx`;
`ids` must contain 1–50 distinct session UUIDs from one checklist. The complete selection must be
completed, non-deleted sessions with non-deleted instances and visible results. The controller
uses `checklistSessionsRead`, the report's `sessionScope()` and `feedbackVisibility`; no new
policy or tenant parameter is introduced. A foreign, missing, deleted or outside-scope ID rejects
the entire request with 404 before any reports are returned. A hidden learner result gives 403;
incomplete sessions or mixed checklists give 400. Existing list/analytics exports keep their
existing independent policies.

The server reuses `getReport` and the shared report score module. An individual observation keeps
its authoritative report percentage; the overall column sums earned/maximum points and derives
its percentage on the server. Unscored observations and skipped criteria do not invent zero
percentages. Different employees, calculation formulas or sheet structures have separate blocks,
so changed criterion text is not silently compared as the same question. Observation columns are
ordered by actual start (fallback: completion, planned start), then session UUID. Per-observation
dates use the session timezone; aggregate header periods are explicitly UTC.

Rows follow the reference: blank row 1, title A2, sheet/periods/employee/observer at rows 3–7,
"Overall score" at row 9 (B9:C9 merged), observation information, all ordered context fields
(including the configured location field), results, numbered groups and criteria, then enabled
feedback. A session has one learner: that person is the group-members row. Departments and
context come from the report; exact geolocation and signed photo URLs are never fetched or exported; emails are not included
in the exported table. Criteria include their scale label and comment in the observation cell. At most
`MAX_EXPORT_ROWS` (5000) input criterion/group/context rows and 5000 output rows are allowed;
limits reject instead of truncating.

`layout` supplies presentation metadata, not executable formulas. The browser renders
`Worksheet 1` with A=45, remaining columns=16, rows 1–9 frozen, wrap, merged headings and grey
`E0E0E0` bold headers. Criterion rows have no score-colour fill. The browser calculates no scores.
XLSX values are typed text/numbers, never formulas/hyperlinks. CSV is generated on the server with
UTF-8 BOM, RFC-4180 quoting and formula neutralization, including leading whitespace/control
characters. RU/EN/KK/ZH headings use the authenticated user's locale.

The selection's scope/deletion is checked again after building the table. A successful response
requires a durable `checklist_session.summary_exported` audit write containing the actor,
ordered session IDs, format, locale and row count; no feedback, context values or scores are put
in audit metadata. A failed audit returns no export. The report page offers Excel/CSV only for
completed sessions, disables both actions while exporting and shows localized retry/access/limit
errors. Selecting several sessions in the interface belongs to PR 375; this endpoint already
supports the bounded explicit selection.

## Checklist evaluation scales (PR 293)

PR 343/344 additions: `POST /checklist-scales/:id/copy` (optional `{ name }`, default `<name> (copy)`) creates
an independent, active, non-default scale with the same levels -- the way to change a scale that is in use or
the default one. Responses carry `inUse` (see the "used" rule below) and `isDefault`. Every organization has at
most one protected default "Yes/No" scale (two levels, 0 and 100 points, text in the language of the user who
first opened the library): `GET /checklist-scales` creates it idempotently, lists it first, and `PATCH`,
`archive` and `DELETE` on it answer 400. PR 358 makes the criterion's resolved scale the scoring
source: the selected level's `score` is earned points, and the greatest level score is the maximum.
It takes precedence over the checklist's `scoringMode`/`scaleLevels`. Without a criterion scale,
the existing checklist-level scale, `sum_points` and `all_required` behavior is unchanged.

Tenant-scoped, reusable evaluation scale library (`GET/POST /checklist-scales`, `GET/PATCH/DELETE
/checklist-scales/:id`, `POST /checklist-scales/:id/archive`) -- coexists with, and never touches,
the pre-existing per-checklist `scoringMode='scale'` + `Checklist.scaleLevels` JSON mechanism.
A `ChecklistScale` has ordered `ChecklistScaleLevel` rows (`value`/`label`/`score`); a
`ChecklistItem` optionally references one via `scaleId` (per-criterion, not per-checklist -- this
is deliberately independent of `scoringMode`, which stays checklist-level). Create/update always
replace the full level set (never a partial per-level patch -- levels have no identity a caller
can address individually); a scale needs at least 2 levels, and level `value`s must be unique
within the scale.

Lifecycle is create/edit/archive, plus `DELETE /checklist-scales/:id` (204) only while no
`ChecklistItem` in any checklist references the scale; otherwise 409 and the caller must archive
instead (`ChecklistItem.scaleId` is a `RESTRICT` foreign key as a second line of defence; sessions
and instances keep their own immutable snapshot). `PATCH
/checklist-scales/:id` is rejected (400) once the scale is already archived, or once it is "used"
-- defined as: at least one `ChecklistInstance` exists for a checklist that has an item referencing
this scale. This is a deliberately conservative proxy for "already captured in an assignment-time
snapshot" (see below): it also blocks edits for a scale whose referencing item was later removed
from a checklist that still has old instances, which is the safe direction to err in. The only
lifecycle transition permitted on a used scale is `POST .../archive`, which is non-destructive
(levels are untouched) and always allowed regardless of usage; archiving an already-archived scale
is a no-op, not an error. The fix for an in-use scale that needs different levels is to archive it
and create a fresh one, never to mutate levels a real instance already snapshotted.

Snapshot integration: at assignment time (`ChecklistsService.assignChecklist`/
`bulkAssignChecklist`, and the legacy pre-snapshot fallback path), every item's `scaleId` is
resolved against the live `ChecklistScale` table exactly once and embedded into the instance's
`templateSnapshot` as `scale: {id, name, levels}`. This is the *only* place a live scale lookup
happens -- every reader (scoring, review, display) reads the already-resolved `scale` back out of
the snapshot, never re-queries `ChecklistScale`, so a later edit or archival of the scale can never
retroactively change an already-assigned instance. `POST /checklists/:checklistId/instances`
(publish-time validation, via `updateChecklist`/`ensurePublishable`) rejects publishing a checklist
whose items reference an archived scale (400) -- this only blocks a *new* publish attempt; a
checklist that was already published while its scale was still active keeps working exactly as
before, since its instances already snapshotted the scale as it looked at assignment time.

PR 358 scoring/completion details:
- `scaleLevel` must match a value in this criterion's frozen `scale.levels`; a value belonging
  only to another criterion or the live scale is rejected with 400 before the result is written.
- A selected zero-score level (including "No") is a valid answer and satisfies the answer
  requirement; photo evidence is still required when configured. It is reviewed normally and
  must not be auto-skipped. Missing or invalid levels do not satisfy the criterion.
- Each non-skipped criterion contributes its own earned/max multiplied by its weight. Rejected
  answers earn zero; explicit/automatic skips exclude both earned and max. Recalculation reads
  level scores from the immutable snapshot, not a submitted point value or today's scale library.
  The `criteria` formula continues to count each valid selection, including zero-score levels,
  once without weights. Assignment and bulk assignment seed the same per-criterion maximum.
- `POST /checklists/:checklistId/items` with omitted `scaleId` idempotently obtains the tenant's
  protected Yes/No scale and stores its ID. First creation follows the caller's locale. Explicit
  `scaleId: null` opts into the legacy checklist scoring; existing criteria, template/group copies
  and snapshots are not backfilled. `PATCH` omission retains the current reference.
- Comment/photo metadata-only result saves retain the answer, points and skip/review state; a
  comment before an answer does not invent a selected level. Answer changes still reset review.
- No migration, background job or read-time recomputation rewrites completed scores or reports.
  The existing explicit, audited administrator recalculation remains available and uses the
  frozen criterion definitions, even for a snapshot created before this correction. Changing or
  archiving a live scale never replaces those definitions. No existing snapshot is rewritten.

No new role policies -- `checklist-scales` routes reuse `checklistsRead` (list/get) and
`checklistsCreate` (create/update/archive), the same policies that already gate checklist/item
CRUD, since managing the scale library is the same class of action as managing checklists
themselves.

## Checklist observation-sheet builder (PR 296)

Backend for the admin "Observation Sheet Builder" screen -- criterion grouping, an observer-filled
"general info" step, and two checklist-level defaults that feed the session wizard/employee
pre-session view. No new role policies: every new/extended route below reuses `checklistsRead`
(list) and `checklistsCreate` (create/update/copy), the same policies that already gate
checklist/item CRUD.

**Checklist-level settings** (`POST/PATCH /checklists`, `POST/PATCH /checklists/:id`, extended,
not new routes): `contextFields` (`{id, label, type: 'text'|'textarea'|'date', required, order}[]`,
max 20 -- observer-filled fields shown before a session's criteria; a `select` field type is a
deliberately deferred gap, see the implementation plan), `defaultLocationCapturePolicy` (nullable
`off`/`optional`/`required` -- a per-checklist override of the org-wide
`ChecklistWorkplaceSettings.defaultGeolocationPolicy`; not yet consumed by the session-create
wizard's own default, storage only in this PR), `preSessionVisibility` (`full`/`structure_only`/
`none`, defaults to `structure_only` -- a new axis distinct from `ChecklistFeedbackVisibility`,
which governs when *feedback* becomes visible after a session; this one governs the sheet's
*structure* beforehand. Not yet consumed by any employee-facing screen -- storage only in this
PR, consumption is PR 298's scope).

**Access mode (PR 353)** (same checklist create/update routes, copied by `POST /checklists/:id/copy`):
`accessMode` is `assigned` (default; the checklist reaches people only through assignments and
observation sessions, exactly as before) or `free` (a published checklist that any signed-in user of
the organization starts for themselves). It affects only catalog visibility and self-start and is not
frozen into `templateSnapshot`. `GET /checklists/free` (policy `checklistsStartFree`, every role)
returns the caller's organization's published, non-deleted `free` checklists as
`{ id, title, description, itemCount, activeInstanceId, activeInstanceStatus }` -- never the criteria
themselves; `activeInstanceId` is the caller's own unfinished instance (`assigned`, `in_progress` or
`submitted`) or `null`. `POST /checklists/:id/start` (same policy, no body) creates a
`ChecklistInstance` whose `userId` and `assignedBy` are always the caller, with no due date, reviewer
or session; if the caller already has an unfinished instance of that checklist it is returned
instead (idempotent, serialised by a per-(checklist, user) advisory lock so parallel requests create
exactly one). A checklist that is not `free`, not published, deleted or in another organization
answers 404. Switching a checklist from `free` back to `assigned` removes it from the catalog but
keeps instances already started; a completed instance does not block starting a new one. Audit
action `checklist_instance.started_free` is written only when an instance is created.

PR 354 adds `pinned` (boolean, default `false`) to the checklist and to each catalog entry; the
catalog orders pinned checklists first, then by title. `PATCH /checklists/:id` accepts `pinned`: a
new pin needs a published `free` checklist (otherwise 400) and at most 8 pinned checklists per
organization (`MAX_PINNED_CHECKLISTS`; the 9th answers 409, serialised by a per-organization
advisory lock so parallel requests cannot exceed it); unpinning is always allowed. A checklist that
stops being `free` or published is unpinned in the same update, and a copy is never pinned.

PR 355 adds an optional cover image. `POST /checklists/:id/cover` (`checklistsCreate`, multipart
field `file`) accepts JPEG, PNG, GIF or WEBP up to `MAX_BUFFERED_UPLOAD_SIZE_BYTES` (the same limits
as item photos); the content signature is checked, so a renamed or mislabelled file is 400. A new
cover replaces the previous one (the old object is deleted best-effort); `DELETE
/checklists/:id/cover` removes it. `GET /checklists/:id/cover` (any authenticated role) returns
`{ url, expiresIn }`, a signed URL valid for 300 seconds: staff get the cover of any checklist of
their organization, a learner only that of a published `free` checklist or of one assigned to them;
anything else, another tenant or a checklist without a cover is 404. The storage key and MIME type
are never in an API payload: checklists and catalog entries carry only `coverUpdatedAt` (ISO
timestamp or `null`), which is also the client's cache key. A copy of a checklist gets its own cover object (the storage
object is copied, never shared; if storage fails the copy is created without a cover). The
"By assignment" / "Free access" / "On the panel" label is computed by clients from `accessMode`
and `pinned`; it is not stored. Audit actions `checklist.cover_updated` and `checklist.cover_removed`.

**Who may edit a checklist (PR 362в)** (same create/update routes): `allowEditByAll` (boolean; `false` by
default for a new checklist, `true` for every checklist that existed before). When it is `false`, only the
creator and an `admin` may `PATCH`/`DELETE` the checklist, upload or remove its cover, and create, change or
delete its criteria and groups; anyone else with `checklistsCreate` gets 403. Reading, assigning and
copying (the copy belongs to the copier and keeps the flag) stay open. Only the creator or an admin may
send `allowEditByAll` in an update.

**Strictness settings (PR 330)** (same checklist create/update routes): `allowFinishIncomplete`
(boolean, default `false`) -- when the instance's snapshot has it, `POST /checklist-sessions/:id/transition`
with `complete` first records every criterion that still has no answer as `answerState='skipped'`
(the same persisted row auto-skip writes, so scoring v1 leaves it out of numerator and denominator)
and recomputes the instance; the server never rejects a completion for unanswered criteria on any
checklist -- the strict behaviour is the client keeping Complete disabled. `forbidGalleryPhotos`
(boolean, default `false`) is a **client-side policy only**: the photo input uses the camera
(`capture`) and the server neither verifies nor enforces where a photo came from. Both are frozen
into `templateSnapshot` at assignment (an older snapshot reads as `false`, and the API response
takes them from the snapshot, never the live checklist), so editing a checklist affects only
sessions assigned afterwards.

**Item groups** (`GET/POST /checklists/:checklistId/groups`, `PATCH /checklist-item-groups/:id`,
`POST /checklist-item-groups/:id/copy`): named, ordered `ChecklistItemGroup` rows a `ChecklistItem`
can optionally belong to via `groupId` (also added to `POST /checklists/:checklistId/items` and
`PATCH /checklist-items/:id`). Deliberately no delete endpoint -- the DoD only calls for
add/rename/reorder/copy; assigning an item to a group belonging to a *different* checklist is
rejected (404). Copy duplicates the group and every one of its (non-deleted) items in one
transaction, appended at the end of the same checklist's ordering -- the copy is fully independent
of the original from that point on. `groupId` is a `SetNull` foreign key (not `Cascade`/
`Restrict`): a future group-delete endpoint, if one is ever added, should ungroup surviving items
rather than silently delete them.

**Templates** (`GET /checklist-templates?locale=`, `POST /checklists/from-template` with
`{ templateKey, locale }`; both `checklistsCreate`): a small set of built-in starter sheets kept in
code. `locale` is `ru`, `en`, `kk` or `zh`; anything else gets English. Creation is one transaction
that yields an independent draft (settings, groups, criteria; context fields get fresh ids) and
audit event `checklist.created_from_template`; an unknown `templateKey` is 404.

**Organization templates and deleted results (PR 367).** `checklist_templates` rows are frozen copies
of a checklist (settings, groups, criteria in `payload`) saved by an administrator:
`POST /checklist-org-templates { sourceChecklistId, title?, description? }` (admin, at most 100 per
organization), `PATCH /checklist-org-templates/:id { title?, description? }` (admin),
`DELETE /checklist-org-templates/:id` (admin, soft), `GET /checklist-org-templates` and
`POST /checklists/from-org-template { templateId }` (`checklistsCreate`; the draft is built in one
transaction, a scale deleted since is dropped from the criterion). Audit: `checklist_template.created`,
`.updated`, `.deleted`, `checklist.created_from_org_template`. Another tenant's id is 404.
`DELETE /checklist-instances/:id/result { reason }` (admin; reason 3-500 characters) soft-deletes a
`completed` instance and its session with the same `deletedAt`, stores `resultDeleteReason` and
`resultDeletedBy`, and audits `checklist_result.deleted`; every read, report, export and analytics
query already filters `deletedAt: null`. A non-completed result is 409, an unknown or foreign id 404.
`GET /checklist-instances/deleted-results` lists them (reason, `restorableUntil`);
`POST /checklist-instances/:id/result/restore` (admin) restores within 30 days (409 after) and audits
`checklist_result.restored`. A session cancelled the ordinary way has no `resultDeleteReason` and is
never restorable here.

Snapshot integration: `contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` are
resolved into `ChecklistInstance.templateSnapshot` at assignment time exactly like `scaleLevels`
(PR 293's pattern) -- a later edit to the live checklist can never retroactively change what an
already-assigned instance's snapshot says. `CHECKLIST_SNAPSHOT_VERSION` is **not** bumped: these
are added as strictly optional fields on the runtime type, so a pre-PR-296 snapshot (which never
had them) still parses as valid. PR 347 additionally freezes `itemGroups: [{id, checklistId,
title, order}]` and each item's `groupId` for the conduct overview. Both single and bulk
assignment capture this metadata; session creation/repeat use the same assignment path. Renaming,
reordering or deleting live groups does not change an existing assignment's group labels/order
or membership. These fields are optional additions to snapshot version 1, without a migration or
rewrite of stored snapshots. A stored snapshot without group metadata returns `itemGroups: []`
and renders its criteria under “Other criteria”; the reader never fills historical groups from
today's live checklist. A null pre-snapshot assignment retains its existing live-template fallback.
Grouping does not change scoring or completion validation.

## Local observation-sheet preview (PR 374)

The builder's existing Preview action opens a full-screen native modal from the current local
sheet settings. It renders sample employee/department labels, ordered general-information inputs,
numbered groups and criteria, named scale radios (points alongside the label), photo controls and
optional structured feedback. General-information fields, criterion headings and feedback inputs
are shared with the observer conduct screen; this does not create a session or a new route.

Opening, answering, attaching a photo, resetting and closing the preview issue **no API requests**.
Photo validation runs locally with the existing MIME/size limits; the selected file stays in the
browser and is never uploaded. Reset and close discard every simulated answer, file selection,
context value and feedback field. Escape closes the preview, Tab stays within it, and focus returns
to the Preview action. A sheet without criteria cannot be previewed.

The weighted `computePreviewResult` calculation retains its existing default semantics. The page
opts into answered-only percentages: an explicit No is an answered zero, permitted skips are
excluded, and remaining unanswered criteria keep the result incomplete. Required photo evidence,
required context and enabled required feedback also keep the preview incomplete until supplied.
The preview is a simulation; persisted session scoring, lifecycle, scope and RBAC are unchanged.

## Observer conduct screen and structured feedback (PR 297)

Frontend: mobile-first "Observer conducts a session" screen, reached from a new "Conduct" tab
inside the existing `InstructorChecklistReviewsPage` (`/instructor/checklists`) -- no new page,
route, or role, matching PR 296's precedent of extending an existing screen rather than adding a
new one. `ChecklistSessionsToConduct` lists the observer's own sessions (`GET
/checklist-sessions`, unfiltered -- `sessionScope()` already restricts a plain instructor to
`{ observerId: user.id }`, so no extra query param is needed to get "my sessions"). Selecting one
opens `ChecklistSessionConduct`, which drives the session lifecycle
(`start`/`pause`/`resume`/`complete`) and every criterion's result/skip/photo through the existing
PR 289/290 endpoints; completion is client-blocked (Complete disabled) until every required
criterion is answered, mirroring `getRequiredChecklistProgress`'s existing learner-side logic. A
409 on any mutating call (stale `version`) surfaces as a dedicated "reload and retry" state, never
a silent overwrite or a generic error toast. Geolocation is captured client-side once per session
(`navigator.geolocation.getCurrentPosition`, never `watchPosition`) at `start` and at `complete`,
best-effort (a 409 from an already-existing capture point, or a browser permission denial, is
swallowed/recorded respectively -- it never blocks the lifecycle transition it rides along with).

**Structured feedback** (`PATCH /checklist-sessions/:id/feedback`, `checklistSessionsRunOwn` role
policy, same `sessionScope()` access check as every other session sub-resource): three new nullable
`ChecklistSession` columns -- `strengths`, `developmentAreas`, `nextSteps` -- session-level (not
per-criterion) free text the observer records during or after the session, matching the prototype's
"structured feedback" step. Every field is optional and independently settable (a `PATCH` with only
one field leaves the others untouched) so the UI can save partial progress without a separate
autosave/draft mechanism. Allowed for `in_progress`, `paused`, and `completed` (feedback commonly
gets finished right after the session ends); rejected only for `scheduled` (nothing to give
feedback on yet) and `cancelled` (400). Same
optimistic-concurrency contract as every other session mutation: the caller's current `version` is
required and a mismatch is a 409. Every successful save appends a `feedback_updated`
`ChecklistSessionEvent` (new event type) -- the *content* of the feedback is not duplicated into the
event's metadata (it lives only on the session row), matching how `rescheduled`/`location_override`
already carry only the parts of a change that aren't already on the row.

**Session context** (`PATCH /checklist-sessions/:id/context`, `checklistSessionsRunOwn`) accepts
`{ values: { [fieldId]: string }, version }` while a session is `in_progress` or `paused`. The
server rejects unknown field ids, values longer than 4000 characters, and non-ISO (`YYYY-MM-DD`)
values for `date` fields; stale versions return 409 under the same optimistic-concurrency contract
as feedback. Starting the session copies the assignment snapshot's ordered field definitions to
`ChecklistSession.contextFieldsSnapshot`, while answers are stored separately in
`ChecklistSession.contextValues`. Reports therefore retain the original labels/types even after a
checklist is edited. `complete` returns 400 if any snapshotted required field is blank. Context
values follow the same learner visibility rule as score/feedback: `after_completion` masks them
until completion, while `live` exposes them immediately.

## Employee training-session view and feedbackVisibility enforcement (PR 298)

Frontend: "Мои обучающие сессии" (My training sessions), a new additive section appended inside
the existing `/learn/checklists` (`LearnerChecklistsPage`) -- no new route/nav-item. Reuses `GET
/checklist-sessions` unfiltered (`sessionScope()` already restricts a plain learner to `{ instance:
{ userId: user.id } }`) with three client-side tabs (scheduled / in_progress+paused / completed+
cancelled) and a detail view that additionally fetches the instance via the existing `GET
/checklist-instances/:id` for a read-only per-criterion comment list.

**`feedbackVisibility` server-side enforcement**: PR 286 introduced `ChecklistWorkplaceSettings.
feedbackVisibility` (`after_completion` default / `live`) but nothing ever consumed it -- this is
the first read path that actually needs to decide what a learner sees before their result exists.
`GET /checklist-sessions` and `GET /checklist-sessions/:id` now mask their `result` (`percentage`/
`passed`/`scored` nulled, a new `visible: false` flag added) and the PR 297 structured-feedback
fields (`strengths`/`developmentAreas`/`nextSteps`, nulled) whenever the caller is a plain learner,
the tenant's policy is `after_completion`, and the underlying `ChecklistInstance.status` isn't yet
`completed`. Admin/manager/instructor callers are never masked, and `live` never masks anything --
this is specifically about hiding a result from the person being evaluated until it's meant to be
shown, not a general-purpose field restriction. Numbers are nulled outright, not merely flagged, so
an unauthorized value never reaches the response body in the first place. No new role policy --
enforcement is caller-identity-based inside the existing `checklistSessionsRead` handlers.

## Manager checklist analytics (PR 299)

`GET /checklists/manager-analytics` (`checklistManagerAnalyticsRead`: `admin`/`manager`) powers the
new `/manager/checklists` dashboard -- the workstream's single new nav item. Required `from`/`to`
(ISO datetimes), optional `checklistId`/`departmentId`. Scope is
`ChecklistReviewAccessService.participantLearnerScope()` (the same unified
`OrganizationAccessScopeService.user()` filter used by the review queue and session scoping
elsewhere in this module, not a bare Group-only filter) -- `{}` for admin, tenant-wide.

PR 334 extends the response without widening the scope: `departmentOptions[]` (the departments of the
employees already in scope -- a manager never gets the org-structure list, so no admin-level access
is implied), `departments[]` (per-department roll-up of the whole zone, independent of the
`departmentId` filter) and `employees[].departmentId`/`email`. `departmentId` filters rows in memory over
the scoped employees, so a department outside the zone returns an honest empty result. Soft-deleted
sessions (`deletedAt`) are excluded. Search, sort and the «no completed sessions» toggle are
client-side over the scoped employee rows (URL params `q`, `sort`/`dir`, `noCompletion`).

PR 380: results an employee finished on their own (free access, or assigned without an observation
session: `ChecklistInstance` with `status = completed`, no session, not soft-deleted, `completedAt` in the
period) are counted next to sessions in the distribution, trend, per-employee, per-department and
per-manager averages and in `completedCount`. They do not raise `sessionsCount` or `summary.totalSessions`;
`summary.selfCompletedCount` reports how many there are. Scope, filters and permissions are unchanged
(`checklist-manager-analytics.database.spec.ts`).

PR 356 adds `managers[]` (`managerId`, `name`, `employeesCount`, `completedCount`,
`averagePercentage`) and `managerOptions[]` (`id`, `name`). Owner clarification 2026-10-28
(DEC-CHKS-005): use both the primary DIRECT and primary FUNCTIONAL manager of the employee's
current primary department. Both `DepartmentMembership` and `DepartmentManager` must have
`isPrimary=true` and `effectiveTo IS NULL`; ended records, secondary memberships, other groups,
reporting lines and inherited managers do not supply reporting associations. Deleted manager
users are excluded. The employee is counted once per distinct manager user; the same user holding
both types creates one association. An employee with two different managers appears in both rows,
while overall employee/KPI totals remain unique. Replacing the current primary membership or
manager record reassigns the selected period's sessions to the new current associations.

The manager table respects `departmentId` and `managerId` (UUID or `unassigned`). A manager filter
selects employees linked to that manager and only that manager's row. With no current primary
manager of either type, the employee belongs to the null-ID/null-name bucket, localized as
«Без руководителя» in the UI/export. No scored completed results produce a null average (dash in
UI, empty export cell); it never invents a zero. `completedCount` counts actual completed sessions,
including unscored or pending-review ones; the average includes only completed sessions whose
instance is completed and scored. Deleted sessions/instances and sessions outside the selected
scheduled period/checklist are excluded. All associations/options are derived only from employees
already allowed by `participantLearnerScope()`, even when a named manager is outside that zone.
A foreign/out-of-scope manager filter returns empty data without looking up their name.
Department options stay zone-scoped; department roll-ups retain their existing independence from
the department filter and also respect the manager filter. Employee-only search/performance/view
filters do not change the manager table.

The dashboard's manager filter is stored in the URL. Administrators open the same report at
`/admin/checklists/analytics` from the sessions page; managers use `/manager/checklists`, under
their existing authorization and layout. `GET /checklists/manager-analytics/export?table=managers`
returns the exact manager table for its domain filters in the existing `{filename,csv,rows,rowCount}`
contract; `table=employees` (default) preserves the existing employee export. Both CSV and Excel
buttons use the scoped server rows, localized headers and the same 5000-row cap. Export audit
kind is `manager_managers`, with filters/format/row count, never raw rows.

PR 336 adds two CSV exports, both JSON `{ filename, csv, rows, rowCount }` (the same rows as CSV and as typed cells for the
browser-built .xlsx; optional `format=csv|xlsx` only labels the audit entry) so the existing
authenticated client downloads them without a second transport: `GET /checklists/manager-analytics/export`
(`checklistManagerAnalyticsRead`; the analytics filters plus the table view `q`, `noCompletion`,
`performance=low|high`, `sort`, `dir`) and `GET /checklist-sessions/export` (`checklistSessionsManage`: `admin`/`manager`;
the `GET /checklist-sessions` filters without paging). Both reuse the caller's own scope
(`participantLearnerScope()` / `sessionScope()`), so the file equals what the screen shows. Columns
are only those of the tables (no e-mail, feedback text or geolocation), headers follow the user's
locale (ru/en/kk/zh, English fallback). Cells that start with `=`, `+`, `-`, `@`, TAB or CR get a
leading apostrophe (CSV/formula injection). More than 5000 rows is rejected with 400 instead of a
silent truncation. Every export writes `AuditLog` `checklist_report.exported` with the kind, filters
and row count (never the rows).

Aggregation is employee-first over `ChecklistSession` (the workplace-training overlay), not every
async `ChecklistInstance`: every employee in scope appears in `employees[]` even with zero sessions
in the period, so a manager can see who has completed nothing (`summary.noCompletionCount`). Low/mid/
high buckets (`distribution[]`, `summary.lowCount`/`highCount`) use the tenant's
`ChecklistWorkplaceSettings.highPerformanceThreshold`/`lowThreshold` -- `lowThreshold` is nullable by
design (DEC-CHKS-001 defers a concrete value), so when unset the low/mid split falls back to the
instance's own `passed` flag instead of inventing a percentage cutoff. `trend[]` is a deterministic
day-bucketed average-percentage time series from the current period's completed+scored sessions.
PR 350: each employee row also carries `performance` (`low`/`mid`/`high`/`null`), the band of the
rounded average against the same thresholds (`>= highPerformanceThreshold` is high, `< lowThreshold` is
low, `null` without a completed scored session; with `lowThreshold` unset nobody is `low`). The dashboard
filter and the export `performance` parameter use this one value, so the file equals the screen.
Each employee row's own `trend` (`up`/`down`/`flat`/`null`) compares their average in the requested
period against an equal-length immediately-preceding period. Only `completed` + `scored` sessions
feed percentage-based stats; `sessionsCount`/`totalSessions` count every session in the period
regardless of status.

## Admin session report and auditable score recalculation (PR 300)

Frontend: `/admin/checklists/sessions/:id` (`AdminChecklistSessionReportPage`) -- a nested drill-down
from the existing `/admin/checklists/sessions` list (a new "Report" link per row), not a new nav item.
Tabs: Summary/Participants/Criteria/Files/History, reusing `GET /checklist-sessions/:id` (Summary/
Participants), `GET /checklist-instances/:id` (Criteria, plus photo evidence via the existing
`ChecklistReviewPhotoEvidence`), `GET /checklist-sessions/:id/location` (Files), and `GET
/checklist-sessions/:id/events` (History). A browser "Print" button (`window.print()`) is the extent
of the "print-friendly report" requirement -- no server-side PDF/export exists or was requested.

**Recalculate** (`POST /checklist-sessions/:id/recalculate`, `checklistScoreRecalculate`: admin-only,
required non-empty `reason`): `ChecklistsService.computeInstanceScore()` re-derives the score purely
from persisted `ChecklistItemResult` rows plus the instance's immutable `templateSnapshot` -- it never
re-runs status transitions or auto-skip persistence (unlike the existing `recomputeInstance()` used by
the submit/review/skip mutation paths), so a recalculation can only correct the score, never silently
change what "completed" means for that session. `ChecklistSessionService.recalculateScore()` wraps the
read (via `computeInstanceScore`'s transaction-client parameter) and the write in one
`runSerializableWithRetry` transaction, so a concurrent item-result submission can't race the
recalculation into a stale write. Every recalculation writes a `ChecklistScoreRevision` row
(previous/new percentage and passed, reason, actor) -- even when the recomputed score matches the
stored one, since "an admin explicitly re-checked this score" is itself worth auditing -- plus a
`score_recalculated` `ChecklistSessionEvent` and an `AuditLogService` entry. `GET
/checklist-sessions/:id/score-revisions` (`checklistSessionsRead`, same object scope as every other
session read) lists the full revision history for the session's underlying instance.

PR 335 adds optional `formula: 'snapshot' | 'criteria'` to the same endpoint; omission keeps
`snapshot` for backwards compatibility. `snapshot` uses the assignment-time scoring mode,
points, weights and pass threshold. `criteria` computes `round(marked / total * 100)` with unit
weight for each frozen criterion: `checked=true` for checkbox modes or any selected scale level
(including a zero-point level) for scale mode. Rejected answers never count as marked. Explicitly
skipped criteria are excluded from numerator and denominator; missing answers remain in the
denominator. An empty/all-skipped denominator yields `scored=false`, never a misleading 0% grade.
The stored `totalScore`/`maxScore` use counts in criteria mode and points in snapshot mode.
Both formulas retain the existing completed-only pass rule and immutable snapshot threshold.
This is a formula for this explicit revision, not a change to normal submit/review/skip scoring.

`ChecklistScoreRevision.formula` records the actual formula as an enum; existing rows receive
`snapshot` through an additive migration, because that was the only prior behavior. Revisions
remain append-only, including their persisted `newScored` fact; later recalculations update only
the instance's current score and append another revision. The session event and AuditLog metadata
also record the formula. A repeated idempotency key returns its original formula and outcome,
even after another recalculation or if a retry supplies a different formula. A new calculation
needs a new key. Historical idempotency JSON without formula/scored recovers those facts from
its own revision, never from today's mutable instance score.

The admin dialog defaults to checklist settings, offers the two formulas and requires a reason.
It stays open after success to display the server's before/after and actual formula; both history
views show the formula per revision and distinguish an unscored result. An unchanged request
retried after a transport/API error reuses its key; a changed reason/formula or a newly opened
dialog starts a new operation. Browser tests exercise mobile layout, axe and the lost-response
retry; report fixtures also have controlled visual baselines.
## Checklist session concurrency and idempotency (PR 301)

Every ChecklistSession mutation the ADR already required version/status optimistic concurrency for
(`update`, `start`/`pause`/`resume`/`complete`/`cancel`, `submitFeedback`) was already conditional on
`(status, version)` and already ran inside `runSerializableWithRetry` (Serializable isolation, bounded
retry on Postgres serialization failure P2034, `MAX_SERIALIZATION_RETRIES = 5`) -- that part of the
plan's PR 301 scope predates this PR (PR 289/291/297/300). What this PR adds is the remaining,
genuinely missing half: **idempotency for `create`/`complete`/`recalculate`**, so a network retry of
the exact same request never produces a duplicate mutation, distinct from (and complementary to) the
version-based conflict detection that already protects against a *different* concurrent request.

- **New `ChecklistIdempotencyKey` table** (`checklist_idempotency_keys`): `(organizationId, scope, key)`
  unique, `responseBody` JSONB. `scope` namespaces the key per endpoint (`session.create`,
  `session.transition:<action>`, `session.recalculate`) so the same client-chosen key string can never
  collide across unrelated operations.
- **`idempotencyKey`** is an optional field (`z.string().trim().min(1).max(200).optional()`) on the
  request bodies of `POST /checklist-sessions`, `POST /checklist-sessions/:id/{start,pause,resume,
  complete,cancel}`, and `POST /checklist-sessions/:id/recalculate`. Never required -- omitting it just
  means no replay protection beyond the DB-level guards that already existed (the instance-scoped
  unique constraint on `ChecklistSession.instanceId`, and the version/status conditional update).
- **Ordering is the actual mechanism**: inside the same Serializable transaction as the mutation, the
  idempotency-key table is checked *before* any version/status logic runs. A hit replays the stored
  response immediately -- this is what lets a genuine retry of "my own complete request" (same key,
  same now-stale `expectedVersion`) succeed with the original response instead of a 409, while a truly
  conflicting concurrent request (different key, or none) still gets the existing
  `STALE_WRITE_MESSAGE` 409. A miss falls through to the existing mutation logic and stores the
  response under that key before the transaction commits.
- **`recalculate` has no version/status guard at all** (deliberately, per PR 300: every explicit
  re-check is recorded, no-op or not), so without an idempotency key a bare network retry would write
  a second, spurious `ChecklistScoreRevision`. On a cache hit, `recalculateScore()` skips both the
  revision write and the `AuditLogService` call -- a replayed retry didn't mutate anything the first
  call hadn't already audited.
- **Concurrent double-send, not just sequential retry**: because the check-then-write happens inside
  `runSerializableWithRetry`, two truly concurrent calls carrying the same key resolve to exactly one
  mutation -- the loser hits a Postgres serialization conflict (P2034), retries with a fresh read, and
  on that retry finds the winner's already-stored response. Verified against real Postgres in
  `checklist-session-idempotency.database.spec.ts`, including a `Promise.all` double-`create()` race.
- Reminders (`ChecklistSessionReminderWorker`) already had DB-level idempotency from PR 291 (a
  conditional `updateMany(... WHERE status = 'pending')` claim, independent of the job queue's own
  retry/backoff) -- no changes were needed there for this PR.

**Post-merge fixes** (Codex automated review on PR 307/797, addressed in follow-up PRs #797 and
#798 since #797 had already merged before the last of these landed):

- **Recalculate response was missing `scored`**: `POST .../recalculate`'s response (a bare
  `ChecklistScoreRevision`) has no `scored` field, so a client recalculating an all-skipped
  (not-scored) session couldn't tell `newPercentage: 0` (the real, computed placeholder for "not
  scored") apart from a genuine 0% score -- `AdminChecklistSessionReportPage` hardcoded `scored:
  true` on every recalculation, silently flipping a "Not scored (all skipped)" session to a
  misleading `0% ✗`. Fixed by returning the already-computed `scored` alongside the revision.
- **Idempotency-cache replay read the wrong `scored`, twice**: the first fix stashed `scored` in
  the `ChecklistIdempotencyKey.responseBody` JSON, with a fallback to `ChecklistInstance.scored`
  for replaying a cache row written before that field existed. That fallback was itself wrong --
  `ChecklistInstance.scored` is mutable (a later `submitItemResult()` changes it), so replaying an
  old cached response after the instance changed would report *today's* unrelated scored state,
  not what that specific recalculation actually produced. Fixed by adding a real column,
  `ChecklistScoreRevision.newScored` (immutable once written, unlike the instance's own `scored`),
  backfilled per-row from each revision's instance at migration time (not a blanket default, which
  would have wrongly marked every historical not-scored revision as scored) -- the idempotency
  fallback now re-reads this column by the cached revision's own `id` instead of the instance's
  current (mutable) `scored`, so a replay written *after* this migration is exact. A replay of a
  legacy cache row whose `newScored` came from the migration's backfill is only as accurate as that
  backfill: if the instance's `scored` had already changed between the original recalculation and
  the migration running, the backfilled value reflects the instance's state at migration time, not
  the original recalculation's outcome -- see `MIGRATION_BACKUP_POLICY.md`'s "Checklist
  score-revision scored-flag migration" for why that backfill is a best-effort historical
  approximation, not a guaranteed-exact reconstruction.

## Observer unavailable / reassignment (PR 302)

`ChecklistSession.observerUnavailableReason`/`observerUnavailableAt` is an orthogonal business
flag, not a lifecycle status -- it never gates `start`/`pause`/`resume`/`complete`/`cancel`, only
surfaces a "Заменить наблюдателя" (reassign observer) CTA. Reassignment itself is not a new
endpoint: it's the existing `PATCH /checklist-sessions/:id` with a new `observerId`
(`checklistSessionsManage`: admin/manager, already object-scoped via `sessionScope()`), which now
also clears the flag on the observer it changes away from.

- **`POST /checklist-sessions/:id/observer-unavailable`** (`checklistSessionsRunOwn`: all system roles,
  assigned observer only), body
  `{ reason: string (1-500 chars), version: number }`. Restricted to a still-`scheduled` session,
  same optimistic-concurrency contract (409 on stale `version`) as every other session mutation --
  reassignment is only meaningful pre-start (ADR: participants are frozen once a session starts),
  so there's nothing useful to flag once it has.
- Records a `ChecklistSessionEvent` (`observer_marked_unavailable`, metadata carries the reason)
  and creates an in-app `Notification` for every org admin (`type:
  "checklist_session_observer_unavailable"`, links to the admin session report). Managers are not
  individually targeted: computing "which managers have this learner in their effective team"
  would require a reverse walk over `ManagerGroup`/`DepartmentManager` that
  `OrganizationAccessScopeService` doesn't expose today for that direction -- an honest, scoped
  choice (admin can always reassign, regardless of team scope) rather than an unreliable one.
- Reassigning the observer (`PATCH .../checklist-sessions/:id` with `observerId`) clears
  `observerUnavailableReason`/`observerUnavailableAt` in the same conditional update that also
  writes the pre-existing `observer_reassigned` event -- a fresh observer is presumed available,
  and the CTA disappears the moment it's acted on. The full assignment history (unavailable flag,
  then reassignment) is preserved as an append-only `ChecklistSessionEvent` trail, not a silent
  overwrite.
- Frontend: the instructor's "Проведение" list (`ChecklistSessionsToConduct`) gets a "Can't
  conduct this" button on a still-`scheduled` session (replaced by a static note once reported);
  the admin sessions list (`AdminChecklistSessionsPage`) shows an "Unavailable" badge on the
  Observer column and a "Reassign observer" action that opens `ReassignObserverDialog` -- a
  single-step reuse of `WizardDialog` (no third modal implementation, per
  `ADR_CHECKLIST_SESSION_OVERLAY.md`'s UI-foundation rule) with the same debounced observer-search
  picklist as `ChecklistSessionWizard`'s participants step.

**Post-merge review fixes** (Codex automated review on PR 302, addressed in a follow-up PR since
302 had already merged):

- **Action-specific scope**: `POST .../observer-unavailable` now calls a new
  `ChecklistReviewAccessService.observerActionScope()` instead of the read-oriented
  `sessionScope()`. For a user holding both `manager` and `instructor` roles, `sessionScope()`
  legitimately returns a union (their team's sessions OR sessions they personally observe) --
  correct for visibility, but passing that same union into a *write* action let such a user report
  unavailability on a teammate's session they merely manage but never personally observe,
  triggering a false admin alert for the wrong person. `observerActionScope()` is always
  `{ observerId: user.id }` for non-admin callers, regardless of what other roles they hold.
- **No-op reassignment rejected**: `ChecklistSessionService.update()` now throws
  `BadRequestException` when `observerId` equals the session's current observer, instead of
  silently clearing a valid `observerUnavailableReason` and writing a no-op `observer_reassigned`
  event. `ReassignObserverDialog`'s picklist additionally excludes the current observer from its
  candidates (`excludeCurrentObserver()`) -- the actual UX fix; the backend check is defense in
  depth for direct API calls.
- **Dialog state reset on close**: `ChecklistSessionsToConduct`'s mark-unavailable dialog stays
  mounted between opens (only its `session` prop toggles null/a row), so its `reason`/`error`
  state is now reset via a `useEffect` keyed on `session?.id` -- without it, a stale reason from a
  cancelled report could resurface, already submittable, when the CTA was clicked for a different
  session next.
- **Admin notifications now actually visible**: `AdminPageLayout` rendered a static, non-interactive
  `🔔` span -- the real `NotificationBell` component (fetching unread count, listing notifications,
  mark-as-read) was mounted only in `LearnerPageLayout` under `/learn`, so admins (the primary
  recipients of `checklist_session_observer_unavailable`) never saw an in-app alert. `AdminPageLayout`
  now renders the same `NotificationBell` (imported from `learnerLayout.tsx`, not duplicated).
  Separately, `checklist_session_observer_unavailable` and its PR 291 siblings
  (`checklist_session_pre_start_reminder`, `checklist_session_incomplete_after_start_reminder`) had
  no `notifications.types.*` i18n entries at all in any locale, so `describeNotification()` fell
  back to the raw type string with an empty message -- all three now have title/message strings in
  every supported locale (`ru`/`en`/`kk`/`zh`).

## Timezone contract (PR 303)

`ChecklistSession` already stored a UTC instant (`scheduledAt`, `timestamptz`) plus an IANA
timezone (`timezone`, defaulting to `Asia/Almaty`), and reminder scheduling (`checklist-session-
reminders.ts`) already computed `scheduledFor` as pure millisecond-offset arithmetic against
`scheduledAt.getTime()` -- never a local-calendar calculation -- since PR 289/291. Neither needed
to change. What this PR fixes is a real, previously-unnoticed client bug: every screen that
rendered a session's `scheduledAt` (`AdminChecklistSessionsPage`, `AdminChecklistSessionReportPage`,
`ManagerChecklistsPage`, `LearnerChecklistSessions`, `ChecklistSessionsToConduct`) formatted it via
`Intl.DateTimeFormat`/`toLocaleString()` **without** an explicit `timeZone`, which silently defaults
to the *viewer's own browser timezone* -- two people in different timezones looking at the exact
same session would see two different wall-clock times, neither of which is necessarily what the
session's own declared `timezone` means.

- **Fix**: every such call site now passes `timeZone: session.timezone` to `formatDate()`
  (`Intl.DateTimeFormatOptions` already supports `timeZone`, no new helper needed). Audit-trail
  timestamps (`ChecklistSessionEvent.createdAt`, `ChecklistScoreRevision.createdAt`,
  `ChecklistLocationCapture.capturedAt`) are deliberately left rendering in the viewer's own
  timezone -- those answer "when did I see this happen," not "when is the session," so the
  viewer's local time is the correct frame for them.
- **Wizard**: the "Timezone: …" confirmation line (`ChecklistSessionWizard`, schedule step) now
  only renders when `scheduleMode === 'later'` -- "Start now" has no future instant for a timezone
  to disambiguate, so showing it there was noise, not information.
- **DST-safety, made explicit rather than assumed**: new unit tests
  (`checklist-session-reminders.spec.ts`) pin down that `upsertPreStartReminder`/
  `createIncompleteAfterStartReminder` subtract/add a fixed millisecond offset, never a
  timezone-aware calendar delta, across the 2026-03-08 US spring-forward transition (both a fresh
  schedule and a cross-DST reschedule). A new integration test in
  `checklist-session-reminders.database.spec.ts` confirms the same against real Postgres and the
  real worker: a session scheduled just after that transition still gets its reminder fired
  exactly 24 real hours earlier, not 24 (now-nonexistent) local wall-clock hours earlier.
- `formatDate.spec.ts` gained direct coverage of `timeZone`-aware formatting: the same UTC instant
  rendering as `10:00 AM` in `America/New_York` (EDT) and `7:00 PM` in `Asia/Almaty` for the same
  moment, and the correct EST/EDT abbreviation resolving on each side of the same DST transition.

## Privacy, retention, audit (PR 304)

Checklist-session workplace-training data already carried privacy-safe projections and a session-
scoped event timeline (PR 290/300). This PR adds the missing tenant-wide, admin-reviewable
**audit trail** for the two categories of sensitive data those projections gate, and formally
defers retention/deletion to an owner decision instead of inventing one.

- **Two new `AuditLogAction` values** (`audit-log.service.ts`): `checklist_location.accessed` and
  `checklist_evidence.accessed`. Both are best-effort (never fail the mutation/read they describe,
  same as every existing `AuditLogAction`) and are written **after** any enclosing transaction
  commits, never inside it -- the same rule PR 300 established for `AuditLogService` writes, to
  avoid duplicate entries on a Serializable-retry.
- **`checklist_location.accessed`** audits administrator reads of another observer's exact
  coordinates (`listLocationCaptures`). Assigned-observer reads are routine and are not logged
  as exceptions. PR 352 removes administrator submission on another observer's behalf; historical
  `location_override` session events and privacy audit entries remain available.
- **`checklist_evidence.accessed`** covers a privileged viewer (`isPrivileged`, i.e. not
  learner-only) opening photo evidence (`getItemPhotoDownload`) for an instance **outside their own
  normal review assignment** -- neither the learner who owns the instance nor its assigned
  reviewer (`checklistInstance.reviewerId`). Routine access within the normal workflow (the
  learner viewing their own evidence, the assigned reviewer reviewing it) is deliberately **not**
  audited here: the pre-existing `checklist_item_result.reviewed` audit action already captures
  that flow, and a per-view entry for every routine review would be noise without added security
  value. When `reviewerId` is unset, any privileged viewer with read access is "outside the normal
  workflow" and is audited, consistent with `assertReviewerCanAccess`'s own unset-reviewer
  semantics.
- **No new retention/deletion code.** The plan explicitly marks retention as undecided ("retention
  не выдумана: до решения помечена как release blocker") and `OPEN_DECISIONS.md`'s house rule
  forbids turning an unresolved decision into an implementation requirement. See
  [`DEC-CHKS-002`](../status/OPEN_DECISIONS.md#dec-chks-002--workplace-training-session-data-retention-policy)
  for the open retention-period/deletion-mechanism decision this PR registers instead of
  implementing.
- **"Exact coordinates only to policy-scoped roles/objects" and "generic notifications without
  coordinates"** were already satisfied by pre-existing PR 290 code (`listLocationCaptures`'s
  masking, and reminder/notification payloads never carrying `lat`/`lng`) -- this PR adds no new
  masking, only the audit trail around the existing exception paths, plus regression coverage
  (`checklist-scoring-v1.database.spec.ts`) proving the audit trail is written for the override
  cases and stays silent for the routine ones.

## Progressive disclosure and routing contract audit (PR 305)

An audit of the checklist-session module's routing/navigation against the contract table in the
plan doc's "0.1. Прототип и то, как с ним работать" confirmed PR 295-304 already held the line:
exactly one checklist-labelled nav entry per role (`/admin/checklists`, `/instructor/checklists`,
`/learn/checklists`, `/manager/checklists`), no rogue top-level routes, evaluation scales reachable
only via `ScaleManagerDialog` from the builder, score revisions only inside the admin session
report's History tab, "observer unavailable" surfaced as a badge + reassignment CTA (never a
separate page), reminders surfaced as ordinary notifications with no diagnostics UI exposed to
non-admins, and zero occurrences of backend jargon (`ManagerTeamScope`, `OrganizationAccessScopeService`,
`snapshotVersion`, `idempotencyKey`, `P2034`, `denominator`, `worker`) anywhere in `apps/web/src`.

The one real gap: `ChecklistWorkplaceSettings` (PR 286) had a backend service/controller
(`GET`/`PATCH /checklists/workplace-settings`) but **no frontend at all** -- no dialog, no API
client wrapper. Closed in this PR:

- `ChecklistWorkplaceSettingsDialog` (`apps/web/src/features/admin-checklist-sessions/`) -- a
  contextual `Dialog` (same shell as `ScaleManagerDialog`), opened via a "Settings" button in
  `/admin/checklists/sessions`'s header, next to "New session". Not a new nav item or route,
  matching the prototype's `#openAdminSettings` -> `#settingsDrawer` pattern (the prototype uses a
  drawer; this reuses the app's one shared modal primitive instead of introducing a second shell).
- Editable fields: `moduleEnabled`, `highPerformanceThreshold`, `lowThreshold` (PR 350, empty = not
  set, default `null`), `defaultGeolocationPolicy`, `feedbackVisibility`. **`criticalThreshold` is
  deliberately not exposed** (the next sentences about critical/low predate PR 350) --
  `DEC-CHKS-001` (`docs/status/OPEN_DECISIONS.md`) explicitly defers what counts as a "critical"
  session result to an unresolved owner decision, and states the settings UI must not show a
  critical/low band until that decision is made. Building the fields anyway would have turned an
  open decision into a shipped implementation detail.
- `getChecklistWorkplaceSettings`/`updateChecklistWorkplaceSettings` (`shared/api/checklists.ts`)
  are the first frontend callers of this endpoint; `ChecklistWorkplaceSettingsView` (`shared/api/
  types.ts`) mirrors the backend view type minus the two deferred threshold fields.

## Anomaly matrix audit (PR 306)

An audit of the checklist-session module against the plan doc's 17 mandatory anomalies (PR 306
spec) found that most were already correctly handled by PR 285-305, not gaps -- notably anomaly
"403 manager scope" is implemented as 404 (`checklist-session.service.spec.ts`: "throws 404 when
the session is outside the caller scope"), an intentional anti-enumeration pattern already in
place since PR 287/292, and "incomplete mandatory criteria" blocking session completion is not a
gap at all: session and instance completion are deliberately decoupled per
[`ADR_CHECKLIST_SESSION_OVERLAY.md`](../architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md), and the
client already disables Complete until all required criteria are answered.

Two real bugs and one missing admin surface were fixed in this PR:

- `captureLocationBestEffort()` (`apps/web/src/app/ChecklistSessionConduct.tsx`) collapsed
  `GeolocationPositionError.PERMISSION_DENIED` and `POSITION_UNAVAILABLE` into a single "denied"
  outcome. It now branches on `error.code` and returns a distinct `LocationCaptureOutcome`
  (`'denied' | 'unavailable'`), surfaced via a new pure `describeGeoNotice()` helper as a
  distinguishable inline notice on session start/complete.
- The backend admin location-override endpoint (`POST /checklist-sessions/:id/location`, admin
  override path, audited via `checklist_location.accessed` since PR 304) had no frontend caller.
  Added `LocationOverrideForm` to the admin session report's Files tab (plain `<form>`, matching
  the `RecalculateForm` convention rather than a `Dialog`), gated to missing `start`/`end` capture
  points, requiring an override reason.
- The existing `notFound` variant of `AsyncDataState` (`apps/web/src/shared/asyncData.ts`, already
  present before this PR) was wired into `ChecklistSessionConduct` and
  `AdminChecklistSessionReportPage`'s `useAsyncData` calls so a deleted/inaccessible session shows
  a clear message instead of a generic error.

Explicitly **not** closed in this PR (documented gaps, not silent omissions):

- Checklist archived mid-wizard, photo-rejected, and storage-failure anomalies are covered only by
  generic error handling, not checklist-endpoint-specific tests/messages.
- All-criteria-skipped vs. not-yet-scored: the backend already distinguishes these
  (`ChecklistInstance.scored`, PR 290), but the frontend does not surface the distinction to the
  user.
- `ChecklistSessionReminderWorker` has test coverage for cancelled/completed/orphaned suppression
  (PR 291) but no test for retry-on-delivery-failure.
- Manager analytics no-data and partial-chart-data anomalies lack a true DB-integration test and a
  frontend test respectively.
- The frontend never sends `idempotencyKey` on session create/transition calls, even though the
  backend has fully supported it since PR 301 -- confirmed via grep (`apps/web/src` has zero
  matches for `idempotencyKey`). This is a genuine, unaddressed duplicate-request gap.

## Anomaly matrix follow-up (PR 306-followup)

Closes all 8 gaps left open by the PR 306 audit above. Each was verified with a test against real
data (Postgres or a full frontend render), not just a logic fix:

- **#17 (duplicate create/complete)**: `idempotencyKey` (backend since PR 301) is now actually sent
  by the frontend. `transitionChecklistSession()`/`recalculateChecklistSessionScore()`
  (`apps/web/src/shared/api/checklistSessions.ts`) take an optional `idempotencyKey`; every
  mutating call site (`ChecklistSessionConduct`'s start/pause/resume/complete, the admin sessions
  list's cancel, the wizard's auto-start-on-create, `RecalculateForm`) generates a fresh
  `crypto.randomUUID()` per action.
- **#11 (all-skipped vs. not-yet-scored)**: a new pure `describeChecklistSessionResult()`
  (`apps/web/src/shared/checklistStatus.ts`) disambiguates `pending` / `notScored` / `scored` using
  `instanceStatus`, wired into all four screens that render a session's result (admin sessions
  list, admin session report, manager dashboard, employee list + detail), with a new `notScored`
  string instead of the same blank `—` a still-in-progress session shows.
- **#4 (checklist archived during wizard)**: a new database-integration test
  (`checklist-session-admin-api.database.spec.ts`) against real Postgres proves that archiving a
  checklist in the window between the wizard loading it and the bulk-create request landing aborts
  the whole batch with zero partial `ChecklistSession`/`ChecklistInstance` rows -- the business
  logic was already correct, it just had no test against a real, unmocked `assignChecklist()`.
- **#6/#7 (photo rejected / storage failure)**: `uploadItemPhoto` had zero dedicated tests before
  this PR. New `checklists.photo-upload.spec.ts` covers: rejecting a disallowed MIME type before
  the upload service is ever called, propagating a storage-layer failure instead of swallowing it,
  and deleting the orphaned just-uploaded object when the subsequent `attachItemPhoto` call fails
  (and still surfacing the original attach error even if that cleanup itself also fails).
- **#13 (reminder retry)**: `checklist-session-reminder.worker.spec.ts` now proves a
  `ChecklistSessionReminderDelivery.send()` failure propagates out of the notify job handler
  (rather than being caught and dropped), giving `BackgroundJobsService`'s own queue-level
  attempts/backoff an actual chance to retry, and that a retried attempt succeeds cleanly (the
  handler holds no state of its own to duplicate).
- **#15 (analytics no-data)**: a new database-integration test
  (`checklist-manager-analytics.database.spec.ts`) against real Postgres proves a managed employee
  with zero sessions in the period still surfaces as an honest zero-row (`noCompletionCount`,
  `averagePercentage: null`, empty `distribution`/`trend`), plus a new frontend test asserting the
  dashboard shows an explicit "no employees in scope" message rather than a blank table.
- **#16 (partial chart data)**: a new frontend test renders the manager employee table with a mix
  of a fully-scored row and a zero-sessions row in the same table, asserting neither `null` nor
  `undefined` leaks into the DOM and the no-data row falls back to an explicit `—`.

## E2E, security, accessibility, visual regression (PR 307)

New `apps/e2e/tests/checklist-session-lifecycle.spec.ts` covers 14 of the 15 mandatory E2E
scenarios from the plan doc's PR 307 section against the real browser and frontend, with a real
login/RBAC round-trip -- the checklist-session API itself is route-mocked per test (matching
`checklist-review-workflow.spec.ts`'s established pattern in this repo), so this is frontend
integration coverage, not backend E2E coverage; a controller/RBAC/transaction/scoring/persistence
regression in the checklist-session domain would not fail these tests. That coverage lives
separately, in `checklist-session-recalculate.database.spec.ts`,
`checklist-session-idempotency.database.spec.ts`, `checklist-session.service.spec.ts`, and
`cross-tenant-idor.audit.spec.ts`: the full admin-creates -> observer-conducts-on-mobile
(`context.setGeolocation()`, a real required photo upload via `setInputFiles`) ->
employee-sees-result -> admin-report -> recalculate-creates-revision lifecycle; manager scoped
analytics and drill-down; a checklist edited after scheduling still renders the session's frozen
`templateSnapshot`, not the live edit; a stale-version 409 on a concurrent complete routes to the
existing reload prompt instead of a silent overwrite; an all-skipped session shows PR 306's
`notScored` state instead of a blank result. Anomaly #13 (cancelled session -> no reminder) is
deliberately not an E2E case -- it has no observable UI signal, and is already covered by
`checklist-session-reminder.worker.spec.ts`'s suppression test.

Building this surfaced two real, pre-existing production bugs that no unit test had caught,
because both only manifest across a real mutate-then-rerender cycle a mocked-component test
doesn't exercise:

- **`AdminChecklistSessionsPage`**: `ChecklistSessionWizard`'s `onCreated` immediately called the
  parent's `load()`, which flips `useAsyncData`'s `AsyncDataState` back to `'loading'`. The page's
  own `if (status === 'loading') return <PageState .../>` early-return then unmounts the whole
  page -- including the just-opened wizard's "Сессии созданы" success screen -- for the instant the
  background refetch is in flight, so the user watches their own successful submission get yanked
  away and replaced by a freshly reset, empty wizard. Fixed by deferring the reload until the
  wizard is actually closed (`wizardReloadPending` state), not on creation.
- **`ChecklistSessionConduct`** (worse): every criterion action -- checking an item, attaching a
  photo, saving a comment, skipping, any lifecycle transition -- called `onReload()` after its
  mutation, hitting the identical `'loading'`-unmounts-the-page pattern. Since this component owns
  `stepIndex` (which criterion is currently shown), every single answer silently snapped the
  observer's mobile view back to criterion 1, making a checklist with more than one item
  practically unusable. `AdminChecklistSessionReportPage` had the same bug on score recalculation
  (resetting the selected tab). All three are fixed the same way: `useAsyncData` already exposes a
  `mutate()` escape hatch (merge new data into state without the `'loading'` flip) that none of
  these three call sites used; each mutation already returns the updated object in its response, so
  `mutate()` merges it directly instead of triggering a redundant, state-destroying network reload.
  `useAsyncData` itself is untouched -- it is shared infrastructure used across dozens of unrelated
  screens, well outside this PR's blast radius.

`cross-tenant-idor.audit.spec.ts` (the project's org-scoping matrix, distinct from
`checklist-session.service.spec.ts`'s own equivalent coverage) previously had zero checklist-session
entries; two are added for `ChecklistSessionService.get()`/`listEvents()`, matching the file's
existing mocked-`findFirst`-scoped-by-`organizationId` pattern for every other module.

Accessibility (`@axe-core/playwright`, WCAG AA): admin sessions list + wizard, the mobile observer
"Проведение" tab (375px, matching its actual design viewport), `learn/checklists`, and
`manager/checklists` all report zero violations. Visual regression: zero diffs on the two screens
this PR's fixes actually touch (`admin-checklist-session-report`, `instructor-checklist-session-conduct`);
unrelated screens (`admin-checklist-builder`, `admin-checklist-sessions-wizard`,
`manager-checklist-analytics`) showed small pixel diffs in local verification, consistent with the
Chromium-build-version drift `visual-tests/responsive-matrix.spec.ts` already documents (a fixed
pixel count, not a layout regression) -- confirmed against the pinned CI browser by this PR's own
CI run rather than the local sandbox's mismatched Chromium revision.

## Product scope vs implementation

Implementation existence does not determine MVP disposition. Product boundaries live in [`../product/MVP_SCOPE_LOCK.md`](../product/MVP_SCOPE_LOCK.md); unresolved owner/business decisions live in [`../status/OPEN_DECISIONS.md`](../status/OPEN_DECISIONS.md).

Do not use retired mixed trackers as a current source for implementation or scope.

## Live/deployment statements

Production provider/deployment/protection state is live evidence, not API contract. Dated evidence explains what was observed at a specific time/SHA/environment and must not be promoted to permanent current truth.

## Contract change rules

- Public path/request/response changes require runtime OpenAPI/tests/client/docs review in the same logical PR.
- New request bodies use the repository's current runtime validation approach.
- Database-backed contract changes follow Prisma/migration compatibility rules.
- Authorization changes update policy/guard tests and human RBAC semantics.
- Never manually copy the complete runtime route surface into this file.

## Related docs

- [`../README.md`](../README.md)
- [`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md)
- [`AUTH_SESSION_STORE_DESIGN.md`](./AUTH_SESSION_STORE_DESIGN.md)
- [`../product/MVP_SCOPE_LOCK.md`](../product/MVP_SCOPE_LOCK.md)
- [`../runbooks/RELEASE_GATE.md`](../runbooks/RELEASE_GATE.md)

## Checklist session change notifications (PR 345)

Authorized single creation, bulk creation and repeat create `checklist_session_scheduled` for
both the assigned employee and observer. A bulk call creates at most one notice per recipient:
the shared observer's notice references the first successfully committed session and opens their
session list. Skipped/failed entries produce no notices. Partial-success transactions remain
independent; the batch deduplication set advances only after commit.

A versioned PATCH that changes the start instant, duration, timezone or observer creates
`checklist_session_rescheduled` for the employee and current observer; reassignment also notifies
the previous observer. A schedule no-op or geolocation-policy-only edit produces no change notice.
Deleting a scheduled session creates `checklist_session_deleted` for both participants. Completion
creates `checklist_session_completed` for the employee only. Overlapping roles/participant IDs are
deduplicated. Recipients are resolved from the session/assignment and must be active, undeleted
users in the same organization; the request cannot supply notification recipients.

Each notice and its `checklists.session-change-notify` outbox event are inserted in the domain
mutation's Serializable transaction. Rollback removes all three writes. Existing keyed create and
lifecycle replay returns the cached response without new notices; competing versioned edits have
one winner. Bulk retains its active-assignment conflict behavior, with no new idempotency-key API.
The notification data contains only `sessionId`; the outbox contains only `organizationId` and
`notificationId`. Titles, names, feedback, scores, location and other people's addresses are never
copied into these change notices or their mail bodies.

Learner links open `/learn/checklists?sessionId=...` through the scoped detail API, including
sessions beyond the first list page. Existing result/feedback masking remains authoritative.
Observers open their existing detail screen; former observers and deleted-session notices open
the appropriate own list because detail access has ended. Unavailable learner detail returns a
localized error with a back action. Generic portal and email copy supports RU/EN/KK/ZH.

Mail uses the existing `ChecklistSessionReminderDelivery` and common Resend/SMTP capability
(or the existing delivery hook with `kind: session_change`). Without either configured capability,
delivery is a no-op and the portal notice remains durable. Failures propagate for queue retry and
do not roll back the domain operation; SMTP delivery is best effort, not exactly once. Before
sending, the adapter rechecks the notification, recipient organization/status and session deletion.
Deleted sessions suppress queued creation/change/completion mail, reminders and participant
messages. The deletion notice itself is permitted and links to the list. A deletion that occurs
while a provider request is already in flight cannot retract that request.

## Observer deactivation notices (PR 346)

`PATCH /users/{id}/status` returns `observerSessions` (the user's unfinished sessions as observer:
`scheduled`, `in_progress` or `paused`, not deleted) next to `orphanedCourses`. `GET /users/{id}/status-impact`
returns `{ observerSessions }` for the same user before the change is confirmed; it uses the same
role policy and team scope as the status change, and an out-of-scope or foreign-tenant user is a 404.

When an `active` user becomes `suspended` and has at least one unfinished session, one
`checklist_session_observer_deactivated` notice and one `checklists.observer-deactivated-notify`
outbox event are written per active admin of the organization, in the same transaction as the status
change. The deactivated user is never a recipient. Repeating the same status, activation and
deactivation without unfinished sessions write no notices. The notice data holds only `observerId`
and `sessionCount`; the link is `/admin/checklists/sessions?observerId=...`. Reassignment stays the
existing "change time or observer" session action; no new reassignment action exists.

Mail reuses `ChecklistSessionReminderDelivery` (Resend/SMTP, or the delivery hook with
`kind: observer_deactivated`). Before sending, the adapter rechecks that the recipient is an active
admin of the same organization and that the link is the server-authored admin sessions link. Without
a configured capability delivery is a no-op and the portal notice remains. The audit entry
`user.status_changed` carries `observerSessions` in its metadata.


## Configurable observer selection (PR 351)

`GET/PATCH /checklists/workplace-settings` adds `observerEligibility` (`any_user`, `selected_roles`,
`selected_users`), `observerRoles` (system-role array) and `observerUserIds` (UUID array, maximum 500).
Missing settings rows and migrated rows both default to `selected_roles` with instructor/manager/admin,
not instructor alone. Empty selections deliberately allow no new observer. PATCH remains admin-only.
Duplicate role/user entries and unknown roles are rejected by the schema. Newly added user IDs must
belong to active, undeleted users of the authenticated organization; previously configured inactive
IDs may remain when changing unrelated settings, but cannot appear as eligible candidates.

Observer participant lookup uses the same eligibility filter as single/bulk/repeat creation and
observer reassignment. It always excludes blocked/deleted/foreign users, supports search and stable
pagination, and retains instructor own-only lookup/creation restrictions. An invalid observer is
rejected before session writes. Eligibility is rechecked inside the session write transaction.
Time-only rescheduling and reads/conduct of an existing assignment do not revalidate eligibility;
changing the selection never rewrites session participants or snapshots.

For the admin editor only, GET includes `selectedObserverUsers` with tenant-scoped names/email/status
for configured undeleted people. Other settings readers do not receive this roster projection.
The editor uses the existing admin user search, preserves choices across searches/pages, and can
remove unavailable entries. The settings audit includes previous and updated values; the preceding
state and update are read/written in a Serializable transaction.

PR 351 changes selection; PR 352 separately grants own-session conduct for all roles. Observer action scope
remain enforced. The own-session read/run grants and entry points for non-instructor roles are PR 352.
An assigned instructor removed from the eligible selection retains their existing session access.

## Longread lessons: model, draft API and organization flag (PR 381)

A longread is a `Lesson` with `type = 'longread'` whose content lives in three tables:
`LongreadDocument` (one per lesson: `draftRevision`, `schemaVersion`, reader `settings`), `LongreadChapter`
(`order`, `title`, stable `anchor`, `hidden`) and `LongreadBlock` (`order`, `type`, `schemaVersion`, JSON `content`).
Lesson rows stay light; nothing is stored in `lessons` itself.

**Flag.** `Organization.longreadEnabled` (default `false`) is read and changed through
`GET/PATCH /organizations/:id/features` (`{ "longreadEnabled": boolean }`; read: every role of the organization,
write: admin only, audit `organization.features_updated` when the value changes). While the flag is off,
creating a lesson with `type: "longread"` and every `/lessons/:id/longread*` call answer 404, `GET /lessons/:id`
for a longread answers 404, and longread lessons are left out of lesson lists; all other lesson types behave as before.
Existing longread data is kept when the flag is switched off.

**Lessons.** `POST /courses/:courseId/lessons` with `type: "longread"` creates the lesson, its document and one empty
chapter in one transaction. The type cannot be changed to or from `longread` (`PATCH /lessons/:id` answers 400).

**Draft API** (roles and course scope are those of lesson editing: `lessonsCreate`, `@CourseScope('param','id','lesson')`;
a learner gets 403, a foreign organization or foreign course 404):

| Call | Purpose |
|---|---|
| `GET /lessons/:id/longread` | Whole draft: `revision`, `schemaVersion`, `settings`, chapters with blocks (`known: false` marks a block type this server does not know). |
| `PUT /lessons/:id/longread` | Atomic save of the whole draft (autosave): `{ revision, settings?, chapters: [{ id?, title, hidden, blocks: [{ id?, type, schemaVersion, content }] }] }`. Chapters and blocks without `id` are created, omitted ones are deleted, order is the array order. Returns the saved draft with `revision + 1`. |
| `POST /lessons/:id/longread/chapters/:chapterId/duplicate` | `{ revision }`; deep copy of the chapter right after the original, with new block ids, new ids inside the content and a new anchor. Returns the draft. |

**Optimistic revision.** `revision` must equal the stored `draftRevision`. The check is a single atomic
`UPDATE ... WHERE draft_revision = :revision`, so of two concurrent saves of the same revision exactly one wins; the other
answers `409` with `{ message, currentRevision }` and changes nothing. A `chapter.id` or `block.id` that does not belong to
this longread is `400`.

**Blocks.** The server registry validates known types (`paragraph`, `heading` 1-3, `list` up to 3 levels without level jumps,
`quote`, `note`, `divider`, `code`) with strict zod schemas: unknown keys are rejected, a link must be `http(s)://`, `mailto:`
or an in-document `#anchor` (no `javascript:`/`data:`), a block is at most 100 KB, a chapter at most 1000 blocks, a document at
most 200 chapters and 5000 blocks. A block of an unknown type is stored and returned unchanged (only "JSON object up to 100 KB"
is checked), so an older server never destroys content written by a newer one. Composite types and image/attachment schemas are specified in the PR 384/386 sections below;
audio/video and question types remain PR 387-389.

**Audit.** `longread.updated` (target: the lesson) is written at most once per lesson per 5 minutes per API process, because
autosave is frequent; `organization.features_updated` for the flag.

### Longread chapter/text editor (PR 383)

The existing draft API additionally returns block `title` (nullable author label, at most 200 characters) and `hidden`
(boolean, default false). Both are optional on `PUT`: omission preserves an existing block's metadata; new blocks default
to no label and visible. Chapter duplication copies both fields. PR 382 snapshots and restore also retain them;
restoring a legacy snapshot without those fields defaults to unnamed/visible blocks, leaving the historical snapshot untouched.
A document whose visible chapters contain only hidden blocks is not publishable. Retained blocks are moved before deleted chapters are
removed, so moving a block out of a chapter and deleting its source in one save does not cascade-delete it.

Authors open the lazily loaded TipTap editor from lessons or course forms at `/admin/lessons/:id/longread` or
`/instructor/lessons/:id/longread`. Existing course editing scope and the organization flag apply; no new menu or role.
In the admin UI, `/admin/lessons` retains its localized Activity label (RU: «Задание»). Administrators can change the
same organization-wide longread flag on that page, the Courses list, or inside a course. The setting reports loading,
save failures and retry; it is not offered to non-admins. Course titles link to the course builder; once the flag is
enabled, «Добавить лонгрид» opens the existing lesson dialog with the longread type selected, then navigates to its
draft editor. Existing longread lessons retain their editor link. Changing the setting refreshes the course's lesson
list without discarding unsaved course fields. Localized or short lesson titles receive an ASCII fallback identifier
when they cannot form a valid readable slug; the user-facing title is preserved.
Chapter and block creation, labels, ordering (buttons or Alt+Up/Down), visibility, duplication, confirmed deletion and
undo/redo are local draft operations until the atomic save. At least one named chapter is kept. Copying creates new
server identifiers; renaming/reordering retained chapters keeps their anchors. Restoring deleted content with undo
creates new identifiers if deletion has already been saved.

The editor uses the seven existing block schemas: formatted text, H1–H3, quote/attribution, note/style, divider, code/language
and lists up to three levels. Rich clipboard input is converted to plain text, with active HTML elements removed; URLs
use the same allowlist as the server. Only typed text runs are serialized, never editor HTML. Code and literal markup
are inert text. Unsupported block types/versions are retained as opaque data and are not rendered as HTML or edited.
Reader and preview semantics follow the PR 385 contract below; publication/version semantics follow PR 382.

Autosave is debounced by 900 ms and serial: a request uses its sent revision and identifiers, while typing in flight is
kept for the next request. A 409 stops saving without replacing local content; the author can explicitly reload or copy
their structured draft from a recovery dialog (manual selection also works without clipboard permission). Network errors
require an explicit retry, since the server may already have committed the request. Saved/changed/saving/error/conflict
states are announced; invalid chapter names/size prevent autosave. Unsaved edits are held in browser memory only; closing the tab or following a link
warns the author. Closing despite the warning discards unsaved edits. The editor does not write progress or publish lessons.

## Longread publishing and immutable versions (PR 382)

Every publish cuts a `LongreadRevision`: a never-updated copy of the settings, chapters (title, anchor, hidden) and blocks
(type, schemaVersion, content, optional title/hidden metadata) of the draft, with a number that only grows (`LongreadDocument.lastRevisionNumber` is
incremented under a row lock, so two publishes never share a number), the author and the time. Learners read only versions;
editing or restoring the draft never changes one. Everything is behind the `longreadEnabled` flag (404 when off).

| Call | Roles | Purpose |
|---|---|---|
| `GET /lessons/:id/longread/publish-check` | `lessonsCreate` | `{ ok, reasons }`; the same check publish runs. |
| `POST /lessons/:id/longread/publish` `{ revision }` | `lessonsCreate` | Publish or republish. `revision` is the draft revision the author saw: a different current one is `409 { currentRevision }`. Result `{ version, publishedAt }`. |
| `POST /lessons/:id/longread/unpublish` | `lessonsCreate` | New openings stop (404); versions, pinned versions and learners' progress stay. |
| `GET /lessons/:id/longread/versions` | `lessonsCreate` | `{ draftRevision, versions: [{ number, createdAt, author, published }] }`, newest first. |
| `POST /lessons/:id/longread/versions/:number/restore` `{ revision }` | `lessonsCreate` | Replaces the draft with a copy of that version (new block and chapter ids, same anchors, settings restored; `draftRevision + 1`, stale revision is 409). The version itself and all others are untouched. Returns the draft. |
| `GET /lessons/:id/longread/published` | `lessonsRead` (all roles) | The only longread read for learners, see below. |

**Refusal reasons.** Publish answers `422 { message, reasons: [{ code, message, chapter?, blockIndex? }] }` and creates nothing
when the draft has: no visible chapter with content (`empty_document`), a block type this server does not know
(`unknown_block`), a block that fails its schema (`invalid_block`), an internal `#anchor` link to a missing chapter
(`broken_link`), or more required chapters than visible ones (`required_chapters_exceed_visible`). Media and question blocks
(PR 386) add `file_unavailable`; audio/video and question types (PR 387-389) extend the same refusal list.

**Publish rules.** The first publish after changes creates the next number and makes it current, sets the lesson `published`;
publishing again after more changes is a republish (a new number). If the draft has not changed since the latest version,
publishing a published longread is `409` and publishing an unpublished one just switches that version on again (no duplicate).
Two concurrent publishes are serialised by the row lock: one wins, the other gets 409 (same draft revision) or the next number.
A longread lesson becomes `published` only through this action: `POST .../lessons` with `status: "published"` and
`PATCH /lessons/:id/status` to `published` before the first publish are `400`.

**Learner read and pinning.** `GET /lessons/:id/longread/published` returns `{ lessonId, version, publishedAt, schemaVersion,
settings, chapters: [{ title, anchor, blocks }], navigation, preview: false }` without hidden chapters or blocks (reader projection added in PR 385). The first open creates the learner's `Progress`
row (`in_progress`) with `longreadRevisionId` set to the current version; later opens return that pinned version even after
newer ones are published, while new learners get the latest. Answers are never carried over between versions. The draft is
never returned by this call; an unpublished or non-`published` lesson, a missing longread, another organization and the
flag being off are the same `404`.

**Audit.** `longread.published` (`version`, `republished`), `longread.unpublished`, `longread.version_restored`.

## Longread composite blocks (PR 384)

Four known block types join the registry; they are validated on every save (`PUT /lessons/:id/longread`) and again before publishing.

| Type | Content |
|---|---|
| `table` | `{ columns (1-12), widths? (one 1-100 weight per column), headerRow, rows: [{ cells: [{ runs, colSpan, rowSpan, covered }] }] }`, 1-50 rows. |
| `columns` | `{ count: 2 \| 3, columns: [{ id, blocks }] }`; `count` must equal the number of columns. |
| `tabs` / `accordion` | `{ items: [{ id, title (1-100), open?, blocks }] }`, 1-12 items. The two share one shape, so converting tabs to an accordion and back changes only the block `type`; order, titles, ids and nested blocks are kept (`open` exists only for the accordion). |

**Table merge rules.** Every row has exactly `columns` cells. A merged cell is its top-left origin cell with `colSpan`/`rowSpan`; every other cell it covers is `covered: true`, has no text and span 1. The server rejects a span outside the grid, overlapping merges, a covered cell with text (merging must not drop text; the editor moves the covered text into the origin cell) and a covered cell that no merge owns. Table cells hold text runs, edited as plain text in the current editor.

**Nesting.** Tab items, accordion items and columns hold nested blocks `{ id, type, schemaVersion, title?, hidden?, content }`. Nested types are the seven text types, `table`, and the containers themselves, up to 3 container levels (`400` beyond that), at most 50 blocks per slot and 200 per composite block. An unknown type cannot be nested (unlike at the top level, where it is kept as is).

**No cycles, no shared ids.** Every `id` in a composite block (nested blocks, tab/accordion items, columns) is unique, and a block whose own id appears inside its content is rejected (`a block cannot contain itself`). The whole draft is checked as one set: the same id in two blocks is `400 Duplicate block id`. Chapter and block copy (`duplicate`) give every nested id a new value consistently.

Deleting a tab, section or nested block leaves no dangling reference because composites reference nothing outside their own content; internal links still point only at chapter anchors.

## Longread learner reader and author preview (PR 385)

`LearnerLessonDetailPage` opens the published reader for a longread. Before pinning or returning content, the API
checks the organization flag, non-deleted lesson/course and, for learner-only users, a published course and fresh
entitlement through the existing learning-target resolver (direct/group/department/position assignments or enabled
self-enrollment). Revoking access therefore also blocks a previously pinned reader with 404. Existing instructor
course scope and role policies still apply. No new roles or navigation entries are introduced.

- `GET /lessons/:id/longread/published?chapter=<anchor>` restores the saved cursor, or opens a visible, already
  accessible chapter. `navigation` contains `chapter`, nullable `headingIndex`, `allowedAnchors`, `previousAnchor`,
  `nextAnchor`. Chapter anchors survive renaming. Hidden/foreign/unknown chapters answer 404. Sequential mode
  omits the bodies of unvisited chapters; direct GET of an unvisited chapter is 404.
- `PUT /lessons/:id/longread/position` accepts only `{ version, chapter, headingIndex?, mode? }`; mode is `navigate`
  (default) or `bookmark`. The user/organization come from the session. A row lock serializes position updates and
  keeps the visited frontier monotonic. Sequential navigation allows at most the next chapter; the client cannot
  submit its own frontier. A heading index addresses a visible heading in that pinned chapter. A stale version or
  bookmark arriving for a previous chapter is 409; an invalid heading is 400. The response is the same reader view.
- `GET /lessons/:id/longread/preview?chapterId=<uuid>` is author-only (`lessonsCreate` + existing course scope).
  It reads the saved draft, filters hidden chapters/blocks and returns `preview: true`, `version: null`,
  `draftRevision` and navigation through all visible draft chapters. Unknown/hidden/foreign chapter IDs are 404.
  It never calls the published-reader pinning path and creates no progress, attempts or certificates. The editor
  enables preview after saving a visible chapter; width presets are desktop, tablet (768 px) and phone (375 px).

Reader preferences use the existing draft `settings`: `readingOrder` free/sequential, `requiredChapters` (0–200,
validated against visible chapters on publish), `tableOfContents` expanded/collapsed/off, `direction` ltr/rtl,
`allowCopy`. Heading content additionally accepts optional boolean `excludeFromToc`: the heading stays in the text.
H2/H3 form nested contents; collapsed/off contents leave no reserved column. Rendering is read-only React text and
an allowlist of typed blocks/links, never HTML. Unknown/future blocks show a safe placeholder. The reader is lazy
loaded without TipTap. URLs and chapter counts use bidi isolation; code remains LTR. With `allowCopy: false`, copy
buttons are omitted, while text selection, keyboard copying and assistive technology remain available. This is a
UI preference, not content protection.

The existing `Progress` stores `longreadReadingState` (pinned version, chapter anchor, heading index and greatest
visited chapter index). Chapter/heading links and browser history restore reading position. Navigation is **not**
chapter completion: neither status, score nor completion time is changed by position writes, and the reader offers
no generic complete-lesson action. Required chapters are configured/displayed here; assessment/time conditions and
server chapter-completion rules belong to PR 390. Preview uses local navigation and never calls the position API.


## Longread images, covers and attachments (PR 386)

Files reuse `CourseMaterial`, the existing quarantine/scanner and `MaterialMultipartUploadService`. A nullable
`longreadDocumentId` marks version-owned files; ordinary material lists omit them and every generic material ID
route rejects them (404), including download, replacement and deletion. New file APIs use the lesson's editing
scope (`lessonsCreate`, admin/assigned instructor) and the organization flag.

- `POST /lessons/:id/longread/files` accepts strict `{ files: [{ fileName, mimeType, sizeBytes }] }`, 1–20 files,
  atomically creates metadata and returns descriptors (`id`, name/type/size, scan status/reason). There is no file
  count limit across the document; existing structured-document size limits still apply. Each file is at most
  50 MiB. Images: JPEG/PNG/GIF/WebP; attachments: PDF/DOC/DOCX/PPT/PPTX/XLS/XLSX. Extension and MIME must agree.
- `GET .../files/:fileId` returns author-visible metadata/scan status, never storage keys or a quarantine URL.
- `POST .../files/:fileId/content` uploads multipart field `file` through the existing 8 MiB buffered path.
  `POST .../files/:fileId/multipart` starts the existing 8 MiB-part direct upload from registered metadata;
  `POST .../multipart/:uploadId/complete` accepts ordered `{ parts: [{ partNumber, etag }] }` (at most seven),
  and `DELETE .../multipart/:uploadId` aborts and marks an unattached reservation rejected. The existing size verification and expired-upload cleanup apply.
  A file ID can be uploaded once: a reservation prevents concurrent sessions/replacement. Replacing an image or
  attachment creates a new ID, preserving published bytes. Failed uploads can be removed/replaced in the editor.
- `GET .../files/:fileId/preview` is author-only and requires an available, scanned file of this document.
  `GET .../files/:fileId/download?version=N` uses `lessonsRead` plus existing course scope and the learner reader's
  fresh entitlement check. The requested version must match the learner's pinned version; the file must occur in
  its accessible projection (including covers). Hidden/locked chapter bodies/covers confer no download access.
  Deleted parents, another organization/document, revoked access, unpublished lessons, unavailable scans or the
  disabled flag are 404. Author file preview never pins a version or creates progress/attempts/certificates.

Both URL endpoints return `{ url, expiresIn, fileName, mimeType, sizeBytes }` (existing `S3_PRESIGNED_TTL_SECONDS`, default/max 300 seconds). Images receive inline signed GETs;
attachments force attachment disposition/octet-stream. The browser obtains a fresh URL for each download and
refreshes image URLs before expiry. Signed links remain bearer links until their maximum five-minute expiry.
They are not stored in document JSON or snapshots.

Content is verified before a clean scan verdict can promote a longread file: magic bytes, OOXML central-directory
members and archive safety limits, or the expected OLE document stream for legacy Office. Inspection uses bounded
S3 ranges (at most 1 MiB each), including for multipart files; invalid content is rejected and quarantine removed.
Scanner errors, timeout, infection and missing configuration remain fail-closed. The shared upload registry now
also recognizes legacy Office and PPTX; longread policy additionally checks the filename extension.

`image` content is `{ fileId: uuid|null, alt, caption, width: 10..100, align: start|center|end }`; null is a draft
placeholder. `attachments` contains `files: [{ fileId, label? }]`. Document cover is optional nullable `settings.cover`
with the image shape; chapter cover is optional nullable `cover`. Omission preserves an existing chapter cover;
explicit null removes it. Save validates owned file references and touches their retention timestamp under the draft
transaction. Publish-check/publish refuse missing, wrong-type, pending or rejected files with `file_unavailable`.
Copies remap block identifiers while retaining file IDs. Publication and restore retain cover/file references in
immutable settings/chapter snapshots, so removing/replacing a draft file does not affect a published/pinned version.
The existing editor supplies alt/caption/size/alignment, covers and batches of attachments; text is safely rendered
and decorative images may use empty alt text. RU/EN/KK/ZH and existing role shells are retained.

## Assessment question types and server grading (PR 388)

The existing `Assessment` question, quiz, preview, attempt, result, report and certificate endpoints
remain the only assessment system. No new route or role is introduced. Author access still uses
the existing organization/assigned-course guards; learners cannot read author question/option endpoints.

`single_choice`, `multiple_choice` and legacy `true_false` retain their existing option UUID protocol:
`{questionId, selectedOptionId}` or `{questionId, selectedOptionIds}`. An option ID identifies the
choice independently of randomized display order, rather than indexing into an answer key.
Multiple-choice IDs must be a nonempty duplicate-free set belonging to that question. `isCorrect`
means exact set equality in every scoring mode; legacy integer scores and rounding remain unchanged.

New definitions are stored in nullable `AssessmentQuestion.definition`. Author create/PATCH accepts
the following strict JSON shapes; the nested `type` must match the question's outer `type`.
PATCH validates the resulting type/definition together and writes both atomically. Switching from
a defined type to a legacy option type requires explicitly clearing `definition: null`.

| Type | Author-only `definition` | Submitted `response` (alongside `questionId`) |
| --- | --- | --- |
| `true_false` (typed form) | `{type:"true_false",correctAnswer:false}` | `{type:"true_false",value:false}` |
| `matching` | `{type:"matching",left:[{id,text}],right:[{id,text}],correctPairs:[{leftId,rightId}]}` | `{type:"matching",pairs:[{leftId,rightId}]}` |
| `ordering` | `{type:"ordering",items:[{id,text}],correctOrder:[id]}` | `{type:"ordering",itemIds:[id]}` |
| `fill_blank` | `{type:"fill_blank",blanks:[{id,acceptedAnswers:[string]}],caseSensitive,whitespace}` | `{type:"fill_blank",blanks:[{blankId,value}]}` |
| `short_answer` | `{type:"short_answer",acceptedAnswers:[string],caseSensitive,whitespace}` | `{type:"short_answer",text:string}` |

Matching and ordering require 2–50 items, unique IDs (1–64 ASCII letters, digits, `_`, `-`),
and a full bijection/permutation using only the definition's IDs. Matching left/right counts must
agree. Fill-blank requires 1–50 unique blank IDs and an entry for every blank; empty submitted text
is a valid wrong answer. Short answer and each blank allow 1–50 distinct, nonempty normalized answer
variants; each variant/submitted text has at most 4000 UTF-16 code units. Display item text is at most
2000 characters. Text must be well-formed Unicode without NUL (the PostgreSQL JSONB constraint).
Type/ID substitution, duplicate items, missing/foreign items, unknown fields and
multiple answer formats are rejected before any attempt/result/certificate is written. The client
cannot submit `score`, `isCorrect` or an answer key. Defined questions do not use option CRUD.

Boolean values are actual JSON booleans (including `false`), never strings or numeric coercions.
Legacy true/false questions without a definition still require their existing selected-option UUID;
the API does not guess boolean meaning from localized option text or position.

Text comparison always normalizes Unicode to NFC. `caseSensitive:false` then uses locale-independent
Unicode lowercase; punctuation/diacritics are preserved, with no fuzzy matching. `whitespace` is
required and is one of `exact` (preserve spaces), `trim` (trim ends only), `collapse` (trim ends and
replace runs of JavaScript Unicode whitespace with one ASCII space). An author must choose both
policies explicitly. Variants which become identical or empty under that policy are rejected.

For a defined composite question let `N` be the number of pairs/positions/blanks and `C` the number
correct. Every response must still be structurally complete; partial credit never legitimizes a
malformed response. Ordering compares the item at each position, not edit distance or adjacent pairs.

| Scoring mode | Defined matching/ordering/fill-blank score for `P` points |
| --- | --- |
| `all_or_nothing` | `P` if `C=N`, otherwise `0` |
| `proportional` | `round(P*C/N)` |
| `proportional_with_penalty` | `round(P*max(0,C-(N-C))/N)` |
| `per_option` | `round(P*C/N)` — each complete pair/position/blank is one judgment |

Atomic boolean and short-answer questions use all-or-nothing in all four modes, consistent with
legacy single/boolean grading. Scores are bounded to `0..P`, stored as integers; percentage/pass,
reports and certificate issuance continue through the existing attempt service. Rounded partial
credit may equal `P` for small weights while `isCorrect` remains false. No historical score is
recomputed when this migration runs or new question types are added.

`GET /assessments/:assessmentId/quiz` explicitly projects public definitions: matching left/right
items, ordering items, blank IDs and text policy. It never emits `correctPairs`, `correctOrder`,
`acceptedAnswers`, `correctAnswer` or `isCorrect`. Item presentation is shuffled deterministically
per learner even when question randomization is off; the ordering key is independent of display order.
Author preview runs the same grader and writes no attempt/progress/certificate. Completed result
detail includes the learner's typed `response`; `correctDefinition` is exposed only when the attempt
is completed **and** `showCorrectAnswers` is enabled. In-progress results never expose answer keys.

PR 388 supplies API and grading. The existing option-only taking/editor/preview forms display an
explicit unsupported-question state rather than interpreting a new type as a radio question or
starting a timed attempt. Their existing three option-based types continue unchanged. The seven-type
longread editor/reader integration and immutable question snapshots belong to PR 389; PR 388 grades
against the server's current persisted question, as existing standalone assessments do.

## Longread audio, video and approved embeds (PR 387)

The same file endpoints/pipeline now accept MP3 (`audio/mpeg`), WAV (`audio/wav`), MP4 (`video/mp4`) and WebM
(`video/webm`). The 50 MiB limit, 8 MiB buffered path, immutable file IDs, malware quarantine, ownership guards,
publication references and fresh entitlement checks are unchanged. Audio/video receive inline signed GETs with
their declared MIME, including range playback; attachments remain forced downloads. A media file cannot be used
as an image/poster/attachment or another media kind, including with an uppercase UUID. Video posters are owned
image references and are retained by snapshots/restore/cleanup like other files.

Known schema-version-1 blocks:

- `audio`: `{ fileId: uuid|null, caption: string }`.
- `video`, file source: `{ source: "file", fileId: uuid|null, poster: { fileId: uuid|null }|null, caption, width }`.
- `video`, direct source: `{ source: "url", url, poster, caption, width }`. URL must be HTTPS, without credentials,
  a non-default port, whitespace or markup, with an MP4/WebM path on a public-form DNS hostname; literal IPs and
  local/internal/test hostnames are rejected. Fragments are removed. This is a browser media URL, never an iframe.
  The server does not fetch the URL or resolve its DNS; this validation does not promise network reachability,
  redirect destinations, codec support or availability of a third-party resource.
- `embed`: `{ source: { provider: "youtube"|"vimeo", videoId }|null, caption, width }`. Width is an integer 10–100,
  caption at most 2000 characters. Null references/sources are draft placeholders and block publication.

`POST /lessons/:id/longread/embed/resolve` accepts strict `{ input: string }` (1–8192 characters), with
`lessonsCreate` and method-level lesson course scope, the existing document and organization flag. It accepts an
HTTPS YouTube/Vimeo link or one iframe with quoted attributes. The tokenizer rejects event handlers, `srcdoc`,
style/unknown/duplicate attributes, nested/multiple tags and executable/non-approved URLs. Requested iframe
permissions and URL parameters are discarded. The response is only `{ provider, videoId }`; neither raw HTML nor
an arbitrary iframe URL is saved. YouTube IDs are 11 URL-safe characters, Vimeo IDs 1–12 decimal digits. Source
hosts are matched exactly; lookalike suffixes, credentials and non-default ports are rejected.

The reader derives only `https://www.youtube-nocookie.com/embed/:id` or `https://player.vimeo.com/video/:id`.
External frames load after an explicit click, with `sandbox="allow-scripts allow-same-origin allow-presentation"`,
an explicit fullscreen/PiP/encrypted-media allowlist and a cross-origin referrer limited to the site origin. No
top navigation, forms, camera or microphone permissions are requested. A provider watch link remains available,
including when its frame fails; a loading timeout offers retry. External services may return error pages that the
application cannot inspect across origins. Uploaded/private assets continue to use the existing authorized URL
API; direct external URLs are public author-supplied references, outside private-storage access enforcement.

Audio offers play/pause, mute, volume, keyboard-operable seek, ±15 seconds and 0.75–2× speed shared by the audio
players of one open longread, including chapter changes. Shared speed is a local reading preference, not progress.
Video uses native controls, an optional owned poster, caption and width; unsupported/failed playback offers retry.
Signed URLs are renewed before starting playback when expired, or after an expiry-related media error, preserving
position and audio settings. There is no periodic source replacement during playback. Preview/resolution/control
actions do not create progress, attempts or certificates. Media does not count as chapter completion.

Post-scan inspection is bounded: MPEG Layer III frame headers after bounded ID3 skipping; RIFF/WAVE format and
data chunks (PCM/IEEE float); MP4 box bounds, video track handler, mdat and moov (at most 1 MiB); WebM doctype.
These checks reject signature-only probes and wrong containers and apply to buffered/multipart equally. They do
not decode/transcode files or certify every codec; browser playback errors remain visible. All existing scanner
failure cases stay fail-closed. No migration, new storage provider, upload size increase or permission role is added.

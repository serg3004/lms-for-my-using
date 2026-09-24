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
`instructor` role, never `manager`.

Endpoints: `POST /checklist-sessions` (create), `GET /checklist-sessions` (list, paginated, filters
by `status`/`observerId`/`overdueOnly`), `GET /checklist-sessions/:id`, `GET
/checklist-sessions/:id/events` (append-only lifecycle audit trail), `PATCH /checklist-sessions/:id`
(reschedule), and one POST-action route per transition: `:id/start`, `:id/pause`, `:id/resume`,
`:id/complete`, `:id/cancel`.

State machine: `scheduled -> in_progress -> paused -> in_progress -> completed`, plus
`scheduled -> cancelled`. `complete` is reachable only from `in_progress`, never directly from
`paused`. Every transition and `create`/`reschedule` appends a `ChecklistSessionEvent` row in the
same database transaction as the mutation -- never a best-effort side write.

`PATCH` (reschedule) and observer reassignment are only accepted while `status === 'scheduled'`;
once a session starts, its participants are fixed for the rest of its lifecycle. Creating a session
validates the observer holds the `instructor` role and that the target instance does not already
have one (`instanceId` is unique -- a second `POST` for the same instance is a 409).

Every mutating call (`PATCH` and every transition route) requires the caller's current `version` in
the request body. A `version` that no longer matches the row is a 409 (someone else already
transitioned or rescheduled it -- reload and retry); a structurally invalid transition for the
session's *current* status (e.g. `complete` on a `scheduled` session) is a 400, a distinct failure
class from the stale-write 409. Terminal transitions run inside a Postgres `Serializable`
transaction with bounded retry on serialization failure
(`runSerializableWithRetry`, `apps/api/src/modules/departments/org-structure-event.ts`, reused
rather than duplicated), so two concurrent requests racing on the same session can never both win.

Access is scoped through `ChecklistReviewAccessService.sessionScope()`: tenant-wide for admin, the
manager's effective team for manager, the assigned session only for instructor (the observer), and
the learner's own instance only for learner; a manager who also holds `instructor` gets the union of
both. `RBAC`: `checklistSessionsRead` (admin/manager/instructor/learner) covers every read route;
`checklistSessionsManage` (admin/manager) covers create/reschedule/cancel; `checklistSessionsRun`
(admin/instructor) covers start/pause/resume/complete.

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
`checklistSessionsRun` role policy, same `sessionScope()` access check as every other session
sub-resource) and `GET /checklist-sessions/:id/location`. At most one capture per `(session, point)`
-- enforced by the PR 288 unique constraint, so a duplicate submission is a 409, never a silent
overwrite ("start/end only, no continuous tracking" -- the client calls `getCurrentPosition` once
per point, never `watchPosition`; this endpoint pair is the server-observable half of that
constraint). A session whose `locationCapturePolicy` is `off` rejects any capture attempt (400);
`optional`/`required` both accept `captured`/`denied`/`unavailable` status reports (coordinates are
required in the request body if and only if `status === 'captured'`). When the caller submitting a
capture is not the session's assigned observer -- reachable only by an admin, since RBAC plus
`sessionScope()` block everyone else from a session they don't own -- the request requires a non-empty
`overrideReason` and is separately audited via a `ChecklistSessionEvent` of type
`location_override` carrying the reason in its metadata. `GET .../location` applies a privacy-safe
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
configured or succeeds.

## Checklist session admin API (PR 292)

Rounds out the admin surface for `ChecklistSession` (list/detail/create already existed from PR
289) with bulk create, repeat, participant/checklist lookups for the "new session" wizard, and a
richer list/detail projection -- no new tables, no new role policies (see
[`API_RBAC_MATRIX.md`](./API_RBAC_MATRIX.md), "Role policy vs object scope").

`POST /checklist-sessions/bulk` accepts one `checklistId` + up to 100 `learnerId`s + one shared
`observerId`/`scheduledAt`/`locationCapturePolicy`/`timezone`, and creates independent
instance+session pairs per learner -- **not** an all-or-nothing batch. Each recipient is processed
individually through the existing `ChecklistsService.assignChecklist` (so per-learner
active-assignment conflicts surface the same way a single `POST /checklist-instances` would) and
the response reports per-recipient outcome: `{learnerId, status: 'created'|'skipped'|'failed',
sessionId?, reason?}`, plus `created`/`skipped`/`failed` counts. A learner who already has an
active assignment for the checklist is `skipped` (400 from `assignChecklist`, not fatal to the
batch); an unknown/invalid learner is `failed` (404); anything else propagates as a real error and
aborts the remaining batch. One `checklist_session.bulk_created` audit-log entry is written per
call, summarizing total/created counts.

`POST /checklist-sessions/:id/repeat` creates a **fresh** `ChecklistInstance` + `ChecklistSession`
pair for the same learner/checklist, copying `observerId`/`locationCapturePolicy`/`timezone` from
the original -- it never reopens or mutates the original session/instance (both are terminal by
then). Only callable when the original session's own status is `completed` or `cancelled` (400
otherwise, e.g. a session still `in_progress`); because `ChecklistSession` is a 1:1 overlay,
repeating also depends on the underlying `ChecklistInstance` no longer being active -- completing
the *session* does not complete the *instance* (they are independently-lifecycled per
`ADR_CHECKLIST_SESSION_OVERLAY.md`), so a repeat attempt made before the learner actually submits
the checklist still fails with the same "already has an active assignment" 400 that a fresh manual
assignment would. Writes a `checklist_session.repeated` audit-log entry.

`GET /checklist-sessions/participants?role=learner|observer` backs the wizard's people-pickers.
`role=observer` returns tenant-wide users holding the `instructor` role membership (observers are
not team-scoped -- any instructor can be assigned to any session, same as today's manual
`observerId` selection). `role=learner` is scoped by the caller: admin sees the whole tenant, a
manager sees only their effective team (`ChecklistReviewAccessService.participantLearnerScope`,
reusing `OrganizationAccessScopeService.user()` -- the same Group ∪ Department ∪ ReportingLine
union `sessionScope()` already uses), any other caller role gets tenant-wide (mirrors how
`sessionScope()` treats a non-manager, non-learner caller elsewhere in this module). Supports
`search` (name substring) and pagination.

`GET /checklists?status=published` (existing route, now accepts an optional `status` query param)
backs the wizard's checklist picker -- filters out `draft`/`archived` checklists client-side would
otherwise have to do manually. Omitting `status` preserves the prior unfiltered behavior.

`GET /checklist-sessions` and `GET /checklist-sessions/:id` now return a joined projection instead
of the bare `ChecklistSession` row: `checklist: {id, title}`, `learner: {id, firstName, lastName,
email}`, `observer: {id, firstName, lastName, email}`, and `result: {instanceStatus, percentage,
passed, scored}` sourced from the underlying `ChecklistInstance` -- this is a read-only join, not a
new persisted field, and requires no `ChecklistSession` schema change. `list()` also gained
`checklistId`, `learnerId`, `scheduledFrom`/`scheduledTo`, and `search` (matches learner name or
checklist title, case-insensitive) query filters, alongside the existing `status`/`observerId`/
`overdueOnly`/pagination filters from PR 289.

## Checklist evaluation scales (PR 293)

Tenant-scoped, reusable evaluation scale library (`GET/POST /checklist-scales`, `GET/PATCH
/checklist-scales/:id`, `POST /checklist-scales/:id/archive`) -- coexists with, and never touches,
the pre-existing per-checklist `scoringMode='scale'` + `Checklist.scaleLevels` JSON mechanism.
A `ChecklistScale` has ordered `ChecklistScaleLevel` rows (`value`/`label`/`score`); a
`ChecklistItem` optionally references one via `scaleId` (per-criterion, not per-checklist -- this
is deliberately independent of `scoringMode`, which stays checklist-level). Create/update always
replace the full level set (never a partial per-level patch -- levels have no identity a caller
can address individually); a scale needs at least 2 levels, and level `value`s must be unique
within the scale.

Lifecycle is create/edit/archive only -- there is no delete endpoint, and `ChecklistItem.scaleId`
is a `RESTRICT` foreign key that can never actually block a deletion because none exists. `PATCH
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

Snapshot integration: `contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` are
resolved into `ChecklistInstance.templateSnapshot` at assignment time exactly like `scaleLevels`
(PR 293's pattern) -- a later edit to the live checklist can never retroactively change what an
already-assigned instance's snapshot says. `CHECKLIST_SNAPSHOT_VERSION` is **not** bumped: these
are added as strictly optional fields on the runtime type, so a pre-PR-296 snapshot (which never
had them) still parses as valid. Item `groupId` itself is *not* embedded in the snapshot -- it is
purely an authoring-time (builder) concept in this PR; PR 297 (observer session-taking), which
does not depend on PR 296 per the implementation plan, may add it to the snapshot later if the
mobile session screen ends up needing to render group headers.

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

**Structured feedback** (`PATCH /checklist-sessions/:id/feedback`, `checklistSessionsRun` role
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

Aggregation is employee-first over `ChecklistSession` (the workplace-training overlay), not every
async `ChecklistInstance`: every employee in scope appears in `employees[]` even with zero sessions
in the period, so a manager can see who has completed nothing (`summary.noCompletionCount`). Low/mid/
high buckets (`distribution[]`, `summary.lowCount`/`highCount`) use the tenant's
`ChecklistWorkplaceSettings.highPerformanceThreshold`/`lowThreshold` -- `lowThreshold` is nullable by
design (DEC-CHKS-001 defers a concrete value), so when unset the low/mid split falls back to the
instance's own `passed` flag instead of inventing a percentage cutoff. `trend[]` is a deterministic
day-bucketed average-percentage time series from the current period's completed+scored sessions.
Each employee row's own `trend` (`up`/`down`/`flat`/`null`) compares their average in the requested
period against an equal-length immediately-preceding period. Only `completed` + `scored` sessions
feed percentage-based stats; `sessionsCount`/`totalSessions` count every session in the period
regardless of status.

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

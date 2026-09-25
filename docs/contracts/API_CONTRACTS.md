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

Not implemented in this PR (honest gap, doesn't block the rest of the workstream): the accessibility
test suite doesn't cover this specific screen with a real login, because the demo environment has no
seeded `ChecklistSession` and creating one through the multi-step wizard from an a11y test was judged
not worth the added flakiness risk without a live run to verify selectors -- unit tests (loading/
summary/participants/criteria/history/recalculate branches), a real-Postgres integration test, and a
mocked visual-regression test cover the screen instead.

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

## Observer unavailable / reassignment (PR 302)

`ChecklistSession.observerUnavailableReason`/`observerUnavailableAt` is an orthogonal business
flag, not a lifecycle status -- it never gates `start`/`pause`/`resume`/`complete`/`cancel`, only
surfaces a "Заменить наблюдателя" (reassign observer) CTA. Reassignment itself is not a new
endpoint: it's the existing `PATCH /checklist-sessions/:id` with a new `observerId`
(`checklistSessionsManage`: admin/manager, already object-scoped via `sessionScope()`), which now
also clears the flag on the observer it changes away from.

- **`POST /checklist-sessions/:id/observer-unavailable`** (`checklistSessionsRun`: admin/instructor
  -- the assigned observer reporting it themselves, or admin on their behalf), body
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
- **`checklist_location.accessed`** covers both directions of the pre-existing "only the assigned
  observer and admin see exact GPS coordinates" exception (PR 290's privacy-safe projection in
  `listLocationCaptures`): an admin **submitting** a location capture on behalf of the observer
  (`captureLocation`, the pre-existing `overrideReason`-gated path) and an admin **reading**
  another observer's exact coordinates (`listLocationCaptures`). Not logged for the observer
  acting on/reading their own captures -- that is the routine, expected case, not a privacy
  exception. The pre-existing `location_override` `ChecklistSessionEvent` (session's own timeline)
  is unchanged and continues to exist alongside this tenant-wide entry; they serve different
  audiences (a session's own participants vs. an org-wide audit reviewer).
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
- Editable fields: `moduleEnabled`, `highPerformanceThreshold`, `defaultGeolocationPolicy`,
  `feedbackVisibility`. **`criticalThreshold`/`lowThreshold` are deliberately not exposed** --
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

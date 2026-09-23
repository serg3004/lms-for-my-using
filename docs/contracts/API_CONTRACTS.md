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

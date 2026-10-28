# API RBAC semantics

> **Status:** `CURRENT` human semantics / invariants.
>
> **Security authority:** role policies, guards/access decorators and scoped service policies in current code. This document does not maintain a hand-written role/policy/controller inventory.

## Current inventory

The readable current role/policy inventory is generated from owners in [`../generated/RBAC.md`](../generated/RBAC.md). Role existence is owned by Prisma/shared role definitions; permissions are owned by `apps/api/src/modules/auth/roles.ts` plus guards/access decorators.

Generated inventory is derived evidence, not a replacement authority.

## Access classification

Every HTTP handler must have an explicit access classification:

- public;
- authenticated;
- role-policy protected.

`RolesGuard` is fail-closed for role-protected handlers when required policy metadata is missing. Authentication-only endpoints enforce authenticated access without inventing a role permission.

## Role policy vs object scope

A role policy answers whether a role may call a class of operation. It does **not** automatically authorize every object instance.

Course-scoped authorization is enforced separately by `CourseAccessGuard` and its metadata/policies under `apps/api/src/modules/course-access/`. Instructor access to course-bound resources therefore depends on current ownership/scope data, not merely on possessing the instructor role.

Manager team/object scope is enforced by its dedicated query/policy layer. Frontend navigation visibility is never a security control.

Group mutations use separate role and object-scope checks. Administrators may create and update groups and change their manager set tenant-wide. Managers may only add or remove members of an active group that they already managed before the mutation starts; they cannot change any group's manager set. Every group, membership, manager relation, and target-user lookup remains constrained to the authenticated tenant. A denied mutation occurs before any write and therefore cannot expand the manager's downstream user, assignment, progress, or report scope.

Department and department-type mutations (tree CRUD, move/reparent, archive/restore) are admin-only role policies with no manager object scope yet; a manager-scope layer for departments, if introduced, will be a future documented change here. Reparenting a department is additionally guarded at the data layer: the move runs in a Serializable transaction with bounded retry on serialization failure, and rejects a move that would create a cycle or exceed the maximum tree depth before any write, so two concurrent conflicting moves can never both commit.

Organization-structure CSV preview/commit, durable history reads and section counts (`GET /org-structure/counts`) use the same admin-only Department role policies. Preview tokens are also bound to the authenticated actor and tenant; role authorization alone cannot commit another actor’s preview.

Department membership (create/close/transfer/bulk-transfer, and reading a department's current users or a user's full membership history) is likewise admin-only for now. Two data-layer invariants back the role check regardless of caller: a partial unique index allows at most one current (`effectiveTo IS NULL`) primary membership per user, and another allows at most one current membership per user/department pair, so a race between two concurrent transfers for the same user can never leave more than one current primary — the losing request gets a conflict, not a corrupted state. A transfer or bulk transfer additionally rejects assigning an inactive user or an archived department before any write.

Department manager (create/close a DIRECT or FUNCTIONAL manager assignment, switch a department's manager inheritance mode, and reading a department's effective manager set) is admin-only. A manager relation never grants the `manager` RBAC role by itself and does not require the user to hold a Department membership. Two data-layer invariants mirror the membership ones: a partial unique index allows at most one current manager per (department, user, type), and another allows at most one current primary manager per (department, type). Switching a department's `directManagerMode`/`functionalManagerMode` to `INHERIT` is rejected while current local managers of that type still exist, so a mode switch can never silently hide them; the caller must close them first.

Position (the tenant-scoped job-title catalog, and reading/creating/updating/archiving/restoring positions) is admin-only, mirroring the department-type role policy. `UNIQUE(organizationId, code)` rejects a duplicate code within the same tenant before any write. A Position is never hard-deleted, only archived: an archived Position remains valid on historical and existing Department memberships, but the membership create/transfer/bulk-transfer endpoints reject assigning an archived (or cross-tenant) Position to a new current relation. Legacy `User.position` is unaffected by this catalog for now.

PositionCourse (the position-to-course requirement catalog: create/update/archive/restore/read) is admin-only, mirroring the Position role policy. `UNIQUE(organizationId, positionId, courseId)` rejects a duplicate requirement row before any write, and never creates a Position or a Course as a side effect. Assignment creation (`assignmentsCreate`: admin/manager/instructor) now additionally accepts a `departmentId` target — the exact-one-of `userId`/`groupId`/`departmentId` rule is enforced both by a Zod refinement and, defense in depth, by a database CHECK constraint (`num_nonnulls(...) = 1`); no manager object-scope restriction is applied to a department target yet (deferred to PR 278's `OrganizationAccessScopeService`). Learner eligibility for recording progress on a course is decided by a single `LearningTargetResolverService`, which resolves every current source (direct assignment, group, department, position, self-enrollment) fresh on each check — removing one source never revokes access if another still grants it, and there is no separate stored "entitlement" state to fall out of sync.

`OrganizationAccessScopeService` (`apps/api/src/modules/organization-access-scope/`) is the central object-scope layer PR 278 introduces to close the department-target gap left open above: it unions the existing ManagerGroup scope with a manager's current, literal, **DIRECT**-type `DepartmentManager` rows (never `FUNCTIONAL`, which stays metadata-only and grants no data scope) plus every descendant department, deduped against the Group branch. `DepartmentManager` alone never grants the `manager` RBAC role — the role check and the object-scope check are independent, and both must hold. Effective users of a department scope are current (`effectiveTo IS NULL`) **primary** memberships only; an additional (non-primary) membership never extends scope. This service is a `Prisma.WhereInput` builder consumed by `ManagerService` (team summary, overdue reminders) and `ReportsService`, not a Nest guard — it runs downstream of, and stays fully separate from, the tenant-level `OrganizationScopeGuard` and role-level `RolesGuard`. `GET /reports/summary` now accepts optional `departmentId`/`includeDescendants` query parameters: without them, scope is exactly the pre-PR-278 Group-only behavior (unchanged); with them, the requested department's population (current primary memberships in that department, or its subtree when `includeDescendants=true`) is **intersected** with the caller's `OrganizationAccessScopeService` scope, so a manager requesting a sibling or foreign-tenant department resolves to an empty population rather than an error or a leak. `GET /reports/admin-dashboard` is unaffected (admin-only, tenant-wide, no manager scope was ever applied there). ReportingLine (PR 279) is a planned third union branch, not yet implemented.

ReportingLine (personal manager relations, `DIRECT`/`FUNCTIONAL`/`PROJECT`, separate from the Department tree) mutations (`POST /reporting-lines`, `PATCH /reporting-lines/:id`, `POST /reporting-lines/:id/close`) and reads (`GET /users/:id/reporting-lines`, `GET /users/:id/effective-manager`) are admin-only, mirroring DepartmentManager. `employeeId == managerId` is rejected both by a Zod refinement and, defense in depth, by a database CHECK constraint. Only `DIRECT` edges participate in cycle detection: creating a `DIRECT` line runs inside a Serializable transaction with bounded retry that rejects any edge which would close a cycle in the manager hierarchy (verified concurrency-safe: two racing creates that would together form a cycle can never both commit); `FUNCTIONAL`/`PROJECT` edges skip this check entirely, since they never chain into that graph. `GET /users/:id/effective-manager` resolves a fixed fallback chain: a current primary `DIRECT` ReportingLine wins; otherwise the employee's current primary Department's effective primary `DIRECT` manager (same LOCAL/INHERIT/MERGE computation as `department-managers`); otherwise `null`. `OrganizationAccessScopeService` (PR 278) gains a third union branch here: direct and transitive `DIRECT` reports of the actor (a manager managing a manager managing an IC sees the whole chain), gated on the same `RBAC role = manager` requirement as the Group and Department branches, deduped against them, and never extended by a `FUNCTIONAL`/`PROJECT` relation or by a DepartmentManager/ReportingLine row that only exists in another tenant.

Checklist review object scope reuses that complete `OrganizationAccessScopeService` union. A manager can read or mutate a checklist instance through the review endpoints only when its learner belongs to the manager's effective Group ∪ Department DIRECT ∪ ReportingLine DIRECT scope; pending-review, review-queue, and checklist-analytics queries apply the same restriction in Prisma before rows are returned. Admin access remains tenant-wide. The workplace-training `ChecklistSession` parent policy follows the same rule for managers, restricts an instructor to rows where they are the assigned `observerId`, and restricts a learner to sessions whose `ChecklistInstance.userId` is their own; session events, location captures, and item evidence inherit this parent check rather than trusting a nested-resource UUID. A user holding both manager and instructor roles receives the union of their effective-manager scope and assigned-observer scope, never tenant-wide access. `ChecklistReviewAccessService.sessionScope()` implements this read/scheduling policy. Conduct actions use the narrower `observerActionScope()` described below, including for multi-role callers (PR 349); creation authorizes the target learner separately through `participantLearnerScope()` (PR 331).

OrgExternalReference (a tenant-scoped mapping from an internal Department/DepartmentType/Position to an external HRIS/SCIM system's identifier, PR 283 -- readiness only, no connector) mutations (`POST /org-external-references`, `DELETE /org-external-references/:id`) and reads (`GET /org-external-references`, `GET /org-external-references/resolve`) are admin-only, mirroring Position/DepartmentType. Creation is create-only, never an upsert: a duplicate (organization, sourceSystem, entityType, externalId) is always rejected by a database unique constraint, even when it would point at the same internal entity, so an external id can never be silently remapped to a different entity -- a caller must explicitly delete the existing mapping first. The mapped `entityId` is validated to exist in the caller's own tenant at creation time but is never a foreign key from `org_external_references` to the target table (a polymorphic reference keyed by `entityType`, the same pattern `OrgStructureEvent.entityId` already uses); archiving the target entity never deletes its mapping history, and resolving a mapping never reactivates an archived entity -- `GET /org-external-references/resolve` reports the target's current status for the caller to act on. No `USER` entity type, SCIM endpoint, HRIS polling, webhook sync, or background reconciliation exists yet.

ChecklistWorkplaceSettings (`GET/PATCH /checklists/workplace-settings`, tenant-scoped configuration for the planned Checklist "workplace training session" mode, `docs/architecture/adr/ADR_CHECKLIST_SESSION_OVERLAY.md`) splits read and write role policies: `checklistWorkplaceSettingsRead` (admin/manager/instructor/learner) mirrors `themeSettingsRead`, since every role's future session UI needs to read `moduleEnabled`/`feedbackVisibility`/`defaultGeolocationPolicy` to decide what to render; `checklistWorkplaceSettingsWrite` is admin-only, mirroring `themeSettingsWrite`. `organizationId` is always the caller's own from `currentUser`, never a request parameter or body field, so there is no tenant-scope check to bypass. A tenant that has never written a settings row reads back the documented safe defaults (`moduleEnabled=false`, `highPerformanceThreshold=90`, `criticalThreshold`/`lowThreshold` both `null` pending `docs/status/OPEN_DECISIONS.md` DEC-CHKS-001, `defaultGeolocationPolicy=off`, `feedbackVisibility=after_completion`) rather than a 404 or an empty object, and a read never creates a row as a side effect. This endpoint currently only stores and returns settings; the session lifecycle endpoints below (PR 289) are the first to actually enforce workplace-training behavior.

`ChecklistSession` lifecycle endpoints (PR 289: `POST/GET /checklist-sessions`, `GET /checklist-sessions/:id`, `GET /checklist-sessions/:id/events`, `PATCH /checklist-sessions/:id`, and `POST /checklist-sessions/:id/{start,pause,resume,complete,cancel}`) split into action-specific role policies rather than reusing the review policies above, because scheduling/running a session is a distinct action from reviewing a submitted checklist: `checklistSessionsRead` (all system roles) covers every `GET` route, gated by `sessionScope()` above; `checklistSessionsManage` (admin/manager) covers scheduling, `PATCH` (reschedule), and `cancel` -- the actions a manager scheduling training performs; `checklistSessionsRunOwn` (all five system roles since PR 352, always limited to the assigned observer) covers `start`/`pause`/`resume`/`complete` -- the actions only the assigned observer performs while running the session. Reschedule and cancel require the row-level `sessionScope()` check. Start/pause/resume/complete instead require `observerActionScope()`: since PR 352 always `{ observerId: user.id }` for every role, including admin (before PR 352 it was unrestricted within the tenant for admin). A manager+instructor may read their team's sessions but cannot conduct another observer's session (404). A cached transition response is returned only after checking current object access; reusing a key for a different session returns 409, while an authorized replay of the same session remains idempotent without duplicate events. `reschedule`/observer-reassignment is rejected (400) once a session has left `scheduled`, enforcing "no participant changes after start" independently of role.

Skip (PR 290: `POST /checklist-instances/:instanceId/items/:itemId/skip`) reuses `checklistItemResultsWrite` (admin/manager/instructor/learner) -- the same policy as the existing submit-result endpoint -- since skipping is just another way of resolving a criterion, gated by the same reviewer-access/self-instance ownership check `submitItemResult` already applies (`assertReviewerCanAccess` for non-learners, `instance.userId === requester` for a learner). No new role policy was introduced for it.

Geolocation capture (PR 290: `POST /checklist-sessions/:id/location/:point`, `GET /checklist-sessions/:id/location`) reuses the session policies above rather than adding new ones: `checklistSessionsRunOwn` (all five system roles since PR 352, always limited to the assigned observer) for submitting a capture -- mirroring who is allowed to actually run the session -- and `checklistSessionsRead` (all system roles) for listing captures. Submission uses `observerActionScope()`; listing uses the read-oriented `sessionScope()`. Row-level identity inside the handler (not a role) decides who sees raw coordinates: the assigned observer and admin get the full row, everyone else with read access gets a redacted projection (`capturePoint`/`status`/`capturedAt`/`capturedBy` only) -- a manager holding `checklistSessionsRead` can confirm a capture happened without learning where. Since PR 352 nobody who is not the assigned observer reaches this endpoint, an admin included: the request is rejected earlier by `observerActionScope()` (404), even for a caller who also holds manager team access. The `location_override` event is kept only for records written before PR 352.

Session creation and participant lookup (PR 292, extended by PR 331) accept either `checklistSessionsManage` or the new `checklistSessionsCreateOwn` policy (instructor). The latter grants single/bulk creation and lookup, without granting PATCH, cancellation, repeat or another observer's lifecycle actions. An instructor without scheduling rights must submit their own `observerId`; a different UUID, including a foreign/nonexistent one, returns 404 before writes. Observer lookup for such callers returns only themselves. Admin/manager scheduling rights remain additive when a caller holds multiple roles.

`participantLearnerScope()` is applied to both the picker and creation: active, undeleted users in the authenticated tenant for admin/instructor, or the existing effective Group ∪ Department DIRECT ∪ ReportingLine DIRECT team for a manager (including manager+instructor). Single creation checks the assignment's learner against that scope and returns 404 for inaccessible assignments. Own-only bulk creation preflights all learners and the checklist and returns 404 before creating anything if any UUID is inaccessible; admin/manager bulk retains its existing per-recipient partial-success behavior. This does not introduce a new instructor team relation. Reads and scheduling use `sessionScope()`; conduct uses `observerActionScope()`; creating one's own session does not reveal another observer's sessions. Every creation appends a `created` session event with the authenticated actor. Single creation also writes `checklist_session.created` once per new session (not on idempotent replay); bulk creation retains `checklist_session.bulk_created`.

The PR 331 cross-tenant/IDOR matrix is exercised by `checklist-session-observer-create.database.spec.ts` using the real membership guard, controller and PostgreSQL, plus `cross-tenant-idor.audit.spec.ts`:

| Attempt | Expected result |
| --- | --- |
| Instructor creates a session with themselves as observer for an active tenant learner | Created; visible through `sessionScope()` and startable through `observerActionScope()`; actor audited |
| Instructor supplies another/foreign observer | 404; no session created |
| Instructor uses a foreign/nonexistent assignment or checklist | 404; no session created |
| Own-only bulk mixes allowed and foreign/deleted learners | 404; no assignment/session created |
| Another instructor reads the new session | 404 |
| Manager+instructor uses an assignment outside their effective team | 404; picker omits the learner |
| Learner/mentor calls creation or participant lookup | 403 from membership guard |
| Instructor calls PATCH, repeat or cancel | 403 from membership guard |

PR 349 extends that real-PostgreSQL matrix with action-specific checks:

| Attempt | Expected result |
| --- | --- |
| Manager+instructor reads a managed learner's session assigned to another observer | Allowed within effective team scope |
| Same caller starts, pauses, resumes, completes, submits feedback/context or captures location for it | 404 before any session/event/location write, even with an override reason |
| Same caller replays a cached transition for it | 404; cached response cannot bypass current action scope |
| Assigned observer replays the authorized transition | Original response; no duplicate transition/event |
| Manager+instructor conducts their own session or cancels a scheduled team session | Allowed; action and scheduling scopes stay distinct |
| Admin conducts another observer's session in their own tenant | Allowed; existing admin override is preserved |

Delete and participant message (PR 333: `DELETE /checklist-sessions/:id`, `POST /checklist-sessions/:id/message`) reuse `checklistSessionsManage` (admin/manager) with the parent `sessionScope()`; no new policy and no access for instructor or learner, so an observer cannot delete or message on a session even if they created it under `checklistSessionsCreateOwn`. A session outside the caller's tenant or team, or one already deleted, answers 404. Delete is rejected (400) once a session has left `scheduled`; the message is rejected (400) for a completed or cancelled session and throttled (429) at 3 per session per 10 minutes. The recipient is always the session's own employee, taken server-side, never from the request body.

`POST /checklist-sessions/:id/repeat` continues to require `checklistSessionsManage` and the existing parent `sessionScope()`. `GET /checklists?status=published` retains `checklistsRead` for the shared wizard's sheet picker.

Evaluation scale library (PR 293: `GET/POST /checklist-scales`, `GET/PATCH /checklist-scales/:id`, `POST /checklist-scales/:id/archive`, `DELETE /checklist-scales/:id`; PR 343 adds `POST /checklist-scales/:id/copy`) reuses `checklistsRead` (list/get) and `checklistsCreate` (create/update/archive/delete) rather than adding new policies -- managing a reusable scale library is the same class of action as managing checklists/items themselves, which already use exactly these two policies. There is no row-level scoping beyond tenant (`organizationId`): a scale is a tenant-wide library resource, not owned by an individual manager's team. PR 343: `POST /checklist-scales/:id/copy` (`checklistsCreate`) creates an independent active copy (the way to change a scale already used by an assigned checklist, which `PATCH` rejects with 400); list/get responses carry `inUse`, computed with the same "used by an assigned checklist" rule as that rejection. PR 344: every organization has one protected default "Yes/No" scale (`isDefault`, created idempotently by the first `GET /checklist-scales`, text in that caller's language, partial unique index per organization); `PATCH`, `archive` and `DELETE` on it answer 400, `copy` is allowed and yields an ordinary scale. The list returns it first.

Observation-sheet builder additions (PR 296: `GET/POST /checklists/:checklistId/groups`, `PATCH /checklist-item-groups/:id`, `POST /checklist-item-groups/:id/copy`, plus `groupId`/`contextFields`/`defaultLocationCapturePolicy`/`preSessionVisibility` extending the existing checklist/item create/update routes) reuse `checklistsRead` (list groups) and `checklistsCreate` (create/update/copy groups, and every extended field) rather than adding new policies -- authoring a checklist's group structure and sheet-level settings is the same class of action as authoring its items, which already use exactly these two policies. There is no row-level scoping beyond tenant (`organizationId`) plus the existing checklist-ownership check every item route already performs (`assertValidGroup` additionally requires the group's `checklistId` to match the item's, so a group cannot be borrowed across checklists even by an otherwise-authorized caller).

Structured feedback (PR 297: `PATCH /checklist-sessions/:id/feedback`) reuses `checklistSessionsRunOwn` (all five system roles since PR 352, always limited to the assigned observer) rather than adding a new policy -- recording feedback during/after a session is the same class of action as running it, performed by the same assigned observer. Still gated by `observerActionScope()` at the row level (including manager+instructor: team read access cannot authorize feedback for another observer), and rejected (400) while the session is `scheduled` or `cancelled`, independent of role.

Session context values (PR 323: `PATCH /checklist-sessions/:id/context`) also reuse `checklistSessionsRunOwn` (all five system roles since PR 352, always limited to the assigned observer) plus `observerActionScope()`: filling the observation sheet's general information is part of conducting the assigned session, not a separate permission. Reads remain part of the normal session projection. For learner-only callers the values are masked by the tenant's existing `feedbackVisibility` rule until completion when it is `after_completion`; admin/manager/instructor readers with `checklistSessionsRead` see them whenever they can see the session.

Manager checklist analytics (PR 299: `GET /checklists/manager-analytics`) introduces a new policy, `checklistManagerAnalyticsRead` (admin/manager) — narrower than `checklistReviewWrite` (which also grants instructor/mentor), because this endpoint feeds the analytics dashboard (`/manager/checklists`, and `/admin/checklists/analytics` since PR 356), not the shared review queue; instructor/mentor have no use for tenant-wide employee analytics and were deliberately left out rather than reusing the broader policy. Row-level scope is `ChecklistReviewAccessService.participantLearnerScope()` (`{}` tenant-wide for admin, `OrganizationAccessScopeService.user()` effective-team for manager — the same helper `sessionScope()`/the participant lookup already use), applied to the employee lookup that seeds the aggregation, so a manager can only ever see analytics for users already in their effective Group ∪ Department DIRECT ∪ ReportingLine DIRECT scope.

PR 356 keeps `checklistManagerAnalyticsRead` and `participantLearnerScope()` unchanged for both
read and export (`table=managers`). Primary DIRECT/FUNCTIONAL manager associations are loaded
only through the already scoped employees and their current primary department. Names and filter
options can include a manager outside the caller's zone only when that manager has an employee
inside it; their out-of-zone employees/results are never aggregated. A manager UUID from another
tenant or outside the zone gives an empty table/export, with no name lookup. The `unassigned`
filter is the absence of either current primary manager type; it never broadens the employee scope.

Admin session report and auditable recalculate (PR 300: `POST /checklist-sessions/:id/recalculate`, `GET /checklist-sessions/:id/score-revisions`) introduces a new policy, `checklistScoreRecalculate` (admin-only), for the mutating recalculate action specifically -- it is deliberately narrower than every existing session policy (`checklistSessionsManage`/`checklistSessionsRunOwn`) because overwriting a `ChecklistInstance`'s stored score is a correction of another actor's (observer's) work product, not a scheduling or session-running action a manager or instructor should ever perform. The revision-history read (`GET .../score-revisions`) reuses `checklistSessionsRead` (all system roles) like every other session read, still gated by `sessionScope()` at the row level. The recalculate endpoint is additionally gated by `sessionScope()` (an admin recalculating a session outside their tenant gets a 404, same as every other session route) even though the role policy alone already restricts it to admin, who is unscoped by `sessionScope()`.

PR 352 replaces the role-bound conduct grant with `checklistSessionsRunOwn` for all five
system roles. `observerActionScope()` always pins `observerId` to the caller, including admin.
Start/pause/resume/complete, feedback, context, location capture and observer-unavailable writes
also check the actual assignment in the service; a broad read scope or cached transition cannot
bypass it. A non-observer receives 404 even when they can read a team/admin report. Administrator
location submission on someone else's behalf is no longer permitted; existing capture records
and audited administrator coordinate reads are unchanged.

`GET /checklist-sessions/to-conduct` and `GET /checklist-sessions/:id/conduct` use this same
own-only scope. Ordinary session reads retain admin tenant visibility and manager team visibility,
adding own observer assignments for every role; learner employee reads remain available separately.
Mentor session reads are own-observer only. Scheduling, cancellation, messaging, repeats and exports
use the independent `sessionManagementScope()` (admin tenant / manager team); assignment alone
never grants them, library access, review rights, score recalculation or analytics.

Existing instance detail and photo reads admit the assigned observer. Item answer/skip/photo writes
check the linked session's observer in the service for every role; mentor gains these operations
only on assigned observed instances. Reviewer and standalone-assignment rules remain separate.
New creation (single/bulk/repeat) and reassignment reject employee = observer; existing rows are
not rewritten. Start/completion audit event names and actors are unchanged.

Free-access checklists (PR 353: `GET /checklists/free`, `POST /checklists/:id/start`) introduce one policy, `checklistsStartFree` (admin/manager/instructor/mentor/learner -- every role), because starting a free checklist is something any user does for themselves. The grant is not a read of checklist structure: the catalog returns title, description and criteria count only, and the started instance is read afterwards through the existing instance policies with their ownership checks (`instance.userId === requester` for a learner). The subject is never supplied by the client: the service takes `userId` and `organizationId` from `currentUser`, so there is no other-user or cross-tenant start; a checklist of another tenant, a draft, a deleted one or one in `assigned` mode answers 404. Who may *create or switch* a checklist to `free` stays `checklistsCreate` (admin/instructor) until the owner's role table (`docs/product/future/CHECKLIST_ROLE_PERMISSIONS_TABLE.md`, PR 366) narrows it to admin.

PR 349 does not widen fixed role grants: instructor already has sheet authoring and scoped session/report reads; it does not gain general `reportsRead`, manager analytics, scheduling another observer or administrator recalculation. Individual permission sets were requested by the owner in DEC-CHKS-004; the separate [custom-role model plan](../product/future/CUSTOM_ROLE_PERMISSIONS_PLAN.md) does not introduce runtime roles yet. The dated [access audit](../evidence/2026-10-27-checklist-access-pr349.md) records the current implementation and missing primary prototype checkmarks; it is not a verified replacement for that product matrix.

PR 351 makes observer eligibility configurable without adding a technical role or granting action policies. Settings writes remain admin-only; defaults select instructor/manager/admin, `any_user` admits any active tenant user, and `selected_users` admits only configured active tenant UUIDs. Both lookup and assignment/reassignment use this filter. Instructor own-only creation remains restricted to self even if other candidates are eligible. Existing assignments retain their access after an eligibility change; the filter must never be applied to session reads/conduct. PR 352 supplies separate own-session execution grants; selection alone grants no actions. Selected-person names in settings responses are admin-only.

The PostgreSQL IDOR matrix additionally verifies all three selection modes against creation, foreign/blocked/deleted IDs, empty selections, search/pagination, administrative settings mutation, admin-only roster projection, guarded reassignment and preserved existing conduct/time-only edits. Settings audit records before/after values scoped to the caller's organization.

For instructor ownership semantics see [`INSTRUCTOR_COURSE_OWNERSHIP.md`](./INSTRUCTOR_COURSE_OWNERSHIP.md).

## Mentor / curator / instructor terminology

The technical `mentor` role is distinct from `instructor`; legacy `curator` wording must not be interpreted as a second current technical role without owner evidence. See [`GLOSSARY.md`](./GLOSSARY.md) and [`../architecture/adr/ADR_CURATOR_ROLE.md`](../architecture/adr/ADR_CURATOR_ROLE.md).

The exact current permissions for any role must be read from the policy owner or generated RBAC view, not inferred from prose labels.

## Enforcement

Current API tests enforce policy completeness and positive/negative decisions. Relevant owners include:

- `apps/api/src/modules/auth/roles.ts`;
- `apps/api/src/modules/auth/roles.spec.ts`;
- API policy audit tests;
- object-scope guard/policy tests.

A new handler without access classification, a changed role policy, or changed scope semantics must update the owning tests. Human documentation should describe durable semantics; volatile membership tables belong to deterministic generation.

## Change rules

When authorization changes:

1. update the canonical code owner;
2. add/adjust allowed and forbidden tests;
3. regenerate/check derived RBAC docs;
4. review human contract semantics here if behavior changed;
5. verify frontend visibility only as UX consistency, not as enforcement evidence.

### Session change notification recipients (PR 345)

No new endpoint or role policy is introduced. Notification creation follows the authorized domain
mutation and uses server-derived session/assignment identities; notification list/read access stays
restricted to the signed-in recipient. `checklist-session-notifications.database.spec.ts` covers:

| Caller / attempted access | Expected result / notification effect |
| --- | --- |
| Own-tenant admin creates, changes or deletes an accessible session | Own-tenant employee/current observer; reassignment also previous observer; completion employee only |
| Foreign-tenant admin updates a known session UUID | 404; no notice/outbox write |
| Learner attempts a management PATCH | Membership guard 403; no notice |
| Manager deletes a session outside their effective team | 404; no notice |
| Bulk request includes a foreign learner | That recipient fails; no cross-tenant notice |
| Body injects `recipientId` into create | Strict schema rejects it; no notice |
| Employee and observer are the same user | One notice, not one per role |
| Former observer or deleted-session notification is opened | Own list link; no bypass of detail scope |

Recipients must be active and undeleted within the authenticated organization. Version conflicts,
keyed replay and transaction rollback cannot leave extra participant notices. A learner's direct
notification link uses the existing scoped detail read and does not grant access to another
employee's session or unmask feedback/results.

### Observer deactivation notices (PR 346)

No new role policy: `GET /users/{id}/status-impact` and the extended `PATCH /users/{id}/status`
both use `usersCreate` with the manager team scope. `checklist-observer-deactivation.database.spec.ts`
covers:

| Caller / attempted access | Expected result / notification effect |
| --- | --- |
| Admin deactivates an active observer with unfinished sessions | One notice per active admin of the same organization |
| Admin deactivates a user with no unfinished, or only completed or deleted, sessions | No notice |
| Same status repeated, or user activated | No new notice |
| Admin of another organization | Never a recipient; status or impact request for a foreign user is 404 |
| Manager outside the user's team | 404 from the existing team scope; no notice |
| Deactivated user is also an admin | Not notified about their own deactivation |

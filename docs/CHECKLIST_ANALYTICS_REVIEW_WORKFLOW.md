# Checklist analytics and review workflow

## Reviewer routing

`ChecklistInstance.reviewerId` is the responsible reviewer; it is distinct from the actor stored on an
individual item decision. A reviewer may be supplied during a single assignment or changed with
`PATCH /checklist-instances/:id/reviewer`. Eligible reviewers have an admin, manager, instructor, or mentor
membership in the instance organization. A non-admin cannot open or decide an instance assigned to somebody
else. Manager access remains restricted to users in managed groups.

`GET /checklist-instances/review-queue` is paginated and filtered on the server. `assignment` accepts `mine`,
`unassigned`, or `all`; checklist, learner, status, pass outcome, submission range, page, and page size are
supported. The legacy pending-review endpoint remains available during client migration.

## Metrics

`GET /checklists/analytics` accepts checklist and assignment-date range filters. All metrics are calculated
after organization and manager-team scoping:

- **assignmentsTotal** counts matching instances;
- lifecycle counts are mutually exclusive current-status counts;
- **completionRate** is completed / all assignments;
- **passRate** is passed / completed;
- **expiredRate** is expired / all assignments;
- **pendingReview** is the submitted count;
- average percentage uses completed instances;
- completion time is `completedAt - createdAt`; review time is `completedAt - submittedAt`.

Rates are returned as values from 0 to 1. Empty populations return zero rather than `NaN`.

## Durable checklist history

`ChecklistInstanceEvent` is immutable, checklist-specific business history. Assignment, reviewer routing,
answers, evidence attachment, review decisions, submission, and completion are recorded with actor/item context.
`GET /checklist-instances/:id/events` returns a stable chronological timeline and applies the same tenant,
ownership, reviewer-routing, and manager-team rules as the instance.

This table is neither the LMS General Audit Log nor an outbox: it does not record page views and is not a
delivery queue. A future global audit framework may consume these facts, but must not replace or mutate them.

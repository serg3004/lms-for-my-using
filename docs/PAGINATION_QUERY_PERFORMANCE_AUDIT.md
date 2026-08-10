# Pagination and query-performance audit (PR 210)

## Scope and latency budget

The audit covers every API collection query as of 2026-08-09. Interactive list
queries have a **150 ms database p95** budget on a production-shaped dataset
(at least 100 organizations, 10,000 users per large tenant, and 1,000,000 rows
each in progress, assignments, attempts, and notifications). End-to-end latency
belongs to the load-testing baseline in PR 211.

## Findings and controls

- The six versioned list APIs (`users`, `courses`, `lessons`, `assignments`,
  `progress`, and `certificates`) already use `page`/`pageSize`, `take`, and a
  maximum page size of 200. Their current response contract remains compatible.
- Notifications now support bounded keyset pagination with `cursor=<uuid>` and
  `limit` (default 20, maximum 100). Ordering by `(created_at, id)` makes the
  cursor deterministic and avoids deep-offset scans.
- Legacy array endpoints are capped at 200 rows until their response shapes can
  be versioned. Organization listing is tenant-scoped and capped at one row.
- Nested Prisma `select` statements replace per-row loading in the audited
  paths; no request-level loop issues one query per returned list item.
- Aggregate/report queries intentionally scan their complete tenant/user scope;
  they are not list endpoints and must not be truncated. Their composite tenant
  indexes are included below.

## Index and migration verification

Migration `20260809130000_add_list_query_indexes` adds composite indexes matching
the tenant and stable ordering predicates, plus the notification keyset index.
The Prisma schema records the same indexes for schema drift checks.

After applying migrations to a disposable production-shaped PostgreSQL copy,
run the following for each large tenant (substitute a real UUID):

```sql
ANALYZE;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, created_at FROM users
WHERE organization_id = '00000000-0000-0000-0000-000000000000'
  AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC LIMIT 200;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, created_at FROM notifications
WHERE organization_id = '00000000-0000-0000-0000-000000000000'
  AND user_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC, id DESC LIMIT 20;
```

Acceptance requires an index scan using the matching composite index, no
external sort, and p95 execution time below 150 ms over 20 warm executions. Store the
JSON plans with the deployment evidence; plans are data/environment dependent
and therefore are deliberately not committed as fabricated fixtures.

## Follow-up

Offset pagination stays supported for compatibility. Consumers that require
deep traversal should migrate to cursor-enabled feeds as those endpoints are
versioned. PR 211 must measure API p50/p95/p99 and validate the 150 ms database
budget under concurrency.

# PR 223: course-level progress uniqueness migration

## Scope

Migration `20260824120000_fix_course_progress_race` enforces a single active
course-level progress row for each `(organization_id, course_id, user_id)`.
Lesson-level rows and soft-deleted rows are outside the partial index.

## Pre-deploy check

Run this read-only query before the deployment and retain the result with the
release record:

```sql
SELECT organization_id, course_id, user_id, count(*) AS active_rows
FROM progress
WHERE lesson_id IS NULL AND deleted_at IS NULL
GROUP BY organization_id, course_id, user_id
HAVING count(*) > 1;
```

The migration safely handles a non-empty result: it keeps the row with the
latest `updated_at` (then `created_at`, then `id`) active and soft-deletes every
older duplicate before creating the index. No progress rows are physically
deleted.

## Apply and verify

Back up the database according to `docs/MIGRATION_BACKUP_POLICY.md`, then run:

```bash
pnpm --filter @lms/api prisma:migrate:deploy
```

Verify the index and confirm that no active duplicates remain:

```sql
SELECT indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND indexname = 'progress_course_level_active_key';

SELECT organization_id, course_id, user_id, count(*)
FROM progress
WHERE lesson_id IS NULL AND deleted_at IS NULL
GROUP BY organization_id, course_id, user_id
HAVING count(*) > 1;
```

The second query must return zero rows.

## Rollback

Application rollback does not require a schema rollback: the partial index is
compatible with the previous write path. If an emergency requires removing the
invariant after the application has been rolled back, run:

```sql
DROP INDEX CONCURRENTLY IF EXISTS progress_course_level_active_key;
```

Soft-deleted legacy duplicates are intentionally not restored automatically.
Restoring them would recreate the ambiguity fixed by this migration; use the
pre-deploy backup only after an incident-specific data review.

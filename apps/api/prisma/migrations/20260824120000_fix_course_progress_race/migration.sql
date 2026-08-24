-- Keep the most recently updated active course-level row when legacy races
-- have produced duplicates. The older rows remain available for audit as
-- soft-deleted records.
WITH ranked_course_progress AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "organization_id", "course_id", "user_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS duplicate_rank
  FROM "progress"
  WHERE "lesson_id" IS NULL AND "deleted_at" IS NULL
)
UPDATE "progress" AS p
SET "deleted_at" = CURRENT_TIMESTAMP,
    "updated_at" = CURRENT_TIMESTAMP
FROM ranked_course_progress AS ranked
WHERE p."id" = ranked."id" AND ranked.duplicate_rank > 1;

-- PostgreSQL's regular compound unique constraint treats NULL lesson_id values
-- as distinct. This partial index enforces one active course-level row per
-- tenant/course/user while leaving lesson-level and soft-deleted rows unchanged.
CREATE UNIQUE INDEX "progress_course_level_active_key"
  ON "progress"("organization_id", "course_id", "user_id")
  WHERE "lesson_id" IS NULL AND "deleted_at" IS NULL;

-- Verification after deploy:
--   SELECT indexdef FROM pg_indexes
--   WHERE schemaname = current_schema()
--     AND indexname = 'progress_course_level_active_key';
--   SELECT "organization_id", "course_id", "user_id", count(*)
--   FROM "progress"
--   WHERE "lesson_id" IS NULL AND "deleted_at" IS NULL
--   GROUP BY "organization_id", "course_id", "user_id"
--   HAVING count(*) > 1;
-- The duplicate query must return no rows.
--
-- Application rollback is compatible with this index. If the DB invariant itself
-- must be removed after rolling the application back, use:
--   DROP INDEX CONCURRENTLY IF EXISTS "progress_course_level_active_key";
-- Soft-deleted legacy duplicates must not be restored without a data review.

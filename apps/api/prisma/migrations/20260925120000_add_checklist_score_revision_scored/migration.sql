-- AlterTable
-- Nullable first: a blanket DEFAULT true for every pre-existing row would be wrong for any
-- historical revision that was actually produced from an all-skipped (not-scored) recalculation --
-- exactly the bug this column exists to prevent, just sourced from the migration's own backfill
-- instead of from reading mutable state at request time.
ALTER TABLE "checklist_score_revisions" ADD COLUMN "new_scored" BOOLEAN;

-- Backfill existing rows from their instance's current `scored` (the best available proxy for a
-- one-time migration snapshot -- an exact historical value was never persisted before this column
-- existed, so this cannot be perfect, but it is far better than assuming every past revision was
-- scored). Rows created going forward always get the accurate, request-time value written by
-- application code, never this default.
UPDATE "checklist_score_revisions" r
SET "new_scored" = COALESCE(i."scored", true)
FROM "checklist_instances" i
WHERE i."id" = r."instance_id";

-- AlterTable
ALTER TABLE "checklist_score_revisions" ALTER COLUMN "new_scored" SET DEFAULT true;
ALTER TABLE "checklist_score_revisions" ALTER COLUMN "new_scored" SET NOT NULL;

-- PR 368: sheet-level feedback section and skip settings. Existing sheets keep their behaviour:
-- feedback stays on and optional, per-criterion skip stays the only way to skip.
ALTER TABLE "checklists" ADD COLUMN "feedback_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "checklists" ADD COLUMN "feedback_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "checklists" ADD COLUMN "allow_skip_all" BOOLEAN NOT NULL DEFAULT false;

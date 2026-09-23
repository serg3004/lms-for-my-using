-- AlterTable: optional per-criterion reference to the reusable ChecklistScale library (PR 293).
-- Independent of and coexisting with the existing checklist-level scoringMode='scale' +
-- Checklist.scaleLevels JSON mechanism -- this column is nullable and never populated by it.
ALTER TABLE "checklist_items" ADD COLUMN     "scale_id" UUID;

-- CreateIndex
CREATE INDEX "checklist_items_scale_id_idx" ON "checklist_items"("scale_id");

-- AddForeignKey: RESTRICT because a ChecklistScale is never hard-deleted, only archived (status)
-- -- this FK exists purely as a data-integrity guardrail, not an expected deletion path.
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "checklist_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

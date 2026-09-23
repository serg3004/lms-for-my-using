-- CreateEnum: explicit per-item resolution state (PR 290 skip/scoring v1).
CREATE TYPE "ChecklistAnswerState" AS ENUM ('unanswered', 'answered', 'skipped');

-- AlterEnum: audited admin override of a location capture under a `required` policy.
ALTER TYPE "ChecklistSessionEventType" ADD VALUE 'location_override';

-- AlterTable
ALTER TABLE "checklist_item_results" ADD COLUMN "answer_state" "ChecklistAnswerState" NOT NULL DEFAULT 'unanswered';

-- AlterTable: false means "not_scored" (every non-skipped item's max was zero, e.g. all-skipped).
ALTER TABLE "checklist_instances" ADD COLUMN "scored" BOOLEAN NOT NULL DEFAULT true;

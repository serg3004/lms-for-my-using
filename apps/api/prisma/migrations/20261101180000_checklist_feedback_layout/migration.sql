-- PR 405a: configurable "Feedback" section of a checklist.
-- Additive only: two nullable JSON columns and one new table. Existing checklists keep
-- feedback_layout NULL (= the built-in three fields); existing sessions get their legacy text
-- copied into feedback_answers so both representations agree from the first day.

-- AlterTable
ALTER TABLE "checklists" ADD COLUMN "feedback_layout" JSONB;

-- AlterTable
ALTER TABLE "checklist_sessions" ADD COLUMN "feedback_answers" JSONB;

-- CreateTable
CREATE TABLE "checklist_answer_sets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChecklistScaleStatus" NOT NULL DEFAULT 'active',
    "options" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_answer_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_answer_sets_organization_id_status_idx" ON "checklist_answer_sets"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "checklist_answer_sets" ADD CONSTRAINT "checklist_answer_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_answer_sets" ADD CONSTRAINT "checklist_answer_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Back-fill: the built-in fields have the fixed ids strengths / developmentAreas / nextSteps.
UPDATE "checklist_sessions"
SET "feedback_answers" = jsonb_strip_nulls(jsonb_build_object(
  'strengths', to_jsonb("strengths"),
  'developmentAreas', to_jsonb("development_areas"),
  'nextSteps', to_jsonb("next_steps")
))
WHERE "strengths" IS NOT NULL OR "development_areas" IS NOT NULL OR "next_steps" IS NOT NULL;

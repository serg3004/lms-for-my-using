CREATE TYPE "ChecklistScoreFormula" AS ENUM ('snapshot', 'criteria');

ALTER TABLE "checklist_score_revisions"
ADD COLUMN "formula" "ChecklistScoreFormula" NOT NULL DEFAULT 'snapshot';

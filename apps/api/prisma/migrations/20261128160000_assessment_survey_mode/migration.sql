-- PR 540: an assessment is either a graded test (as before) or an opinion survey. Existing rows stay graded, nothing is rewritten.
CREATE TYPE "AssessmentMode" AS ENUM ('graded', 'survey');
ALTER TABLE "assessments" ADD COLUMN "mode" "AssessmentMode" NOT NULL DEFAULT 'graded';

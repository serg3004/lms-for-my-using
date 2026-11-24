ALTER TABLE "assessments" ADD COLUMN "policy" JSONB;
ALTER TABLE "assessment_questions"
  ADD COLUMN "correct_feedback" TEXT,
  ADD COLUMN "incorrect_feedback" TEXT;
ALTER TABLE "assessment_attempts" ADD COLUMN "locked_answers" JSONB;
ALTER TABLE "certificates" ADD COLUMN "assessment_result" JSONB;

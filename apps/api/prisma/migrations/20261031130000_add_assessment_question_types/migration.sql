-- Additive only: legacy questions/answers and stored grades remain untouched.
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'matching';
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'ordering';
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'fill_blank';
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'short_answer';
ALTER TABLE "assessment_questions" ADD COLUMN "definition" JSONB;
ALTER TABLE "assessment_attempt_answers" ADD COLUMN "response" JSONB;
-- Keep the existing exclusive-selection invariant, extending it to the new typed response.
-- Prisma's schema DSL cannot express this CHECK; retain it in SQL migrations.
ALTER TABLE "assessment_attempt_answers"
  DROP CONSTRAINT "assessment_attempt_answers_selection_check",
  ADD CONSTRAINT "assessment_attempt_answers_selection_check" CHECK (
    num_nonnulls("selected_option_id", "selected_option_ids", "response") = 1
    AND ("response" IS NULL OR (
      jsonb_typeof("response") = 'object'
      AND "response" ? 'type'
      AND "response" ->> 'type' IN ('true_false', 'matching', 'ordering', 'fill_blank', 'short_answer')
    ))
  );

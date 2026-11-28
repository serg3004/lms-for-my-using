-- PR 539: two new question types. Adding enum values is additive; existing rows and definitions are untouched.
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'image_drop';
ALTER TYPE "AssessmentQuestionType" ADD VALUE 'card_sort';
-- The typed-response check lists the allowed response kinds; extend it with the two new ones, nothing else changes.
ALTER TABLE "assessment_attempt_answers"
  DROP CONSTRAINT "assessment_attempt_answers_selection_check",
  ADD CONSTRAINT "assessment_attempt_answers_selection_check" CHECK (
    num_nonnulls("selected_option_id", "selected_option_ids", "response") = 1
    AND ("response" IS NULL OR (
      jsonb_typeof("response") = 'object'
      AND "response" ? 'type'
      AND "response" ->> 'type' IN ('true_false', 'matching', 'ordering', 'fill_blank', 'short_answer', 'image_drop', 'card_sort')
    ))
  );

CREATE TYPE "AssessmentQuestionScoringMode" AS ENUM ('all_or_nothing', 'proportional', 'proportional_with_penalty', 'per_option');

ALTER TABLE "assessment_questions"
  ADD COLUMN "scoring_mode" "AssessmentQuestionScoringMode" NOT NULL DEFAULT 'all_or_nothing';

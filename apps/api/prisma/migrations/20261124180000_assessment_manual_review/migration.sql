ALTER TYPE "AssessmentAttemptStatus" ADD VALUE 'pending_review';
ALTER TABLE "assessment_attempts" ADD COLUMN "review_passing_score" INTEGER, ADD COLUMN "review_reminded_at" TIMESTAMPTZ;
ALTER TABLE "assessment_attempt_answers"
  ADD COLUMN "review_pending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "review_comment" TEXT,
  ADD COLUMN "reviewed_by" UUID;

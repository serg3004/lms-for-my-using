CREATE TYPE "AssessmentAttemptStatus" AS ENUM ('completed');

CREATE TABLE "assessment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "AssessmentAttemptStatus" NOT NULL DEFAULT 'completed',
    "score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_attempts_score_check" CHECK ("score" >= 0),
    CONSTRAINT "assessment_attempts_max_score_check" CHECK ("max_score" >= 0),
    CONSTRAINT "assessment_attempts_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100)
);

CREATE TABLE "assessment_attempt_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "selected_option_ids" JSONB,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assessment_attempt_answers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_attempt_answers_score_check" CHECK ("score" >= 0),
    CONSTRAINT "assessment_attempt_answers_selection_check" CHECK (
        ("selected_option_id" IS NOT NULL AND "selected_option_ids" IS NULL)
        OR ("selected_option_id" IS NULL AND "selected_option_ids" IS NOT NULL)
    )
);

CREATE INDEX "assessment_attempts_organization_id_status_idx" ON "assessment_attempts"("organization_id", "status");
CREATE INDEX "assessment_attempts_assessment_id_status_idx" ON "assessment_attempts"("assessment_id", "status");
CREATE INDEX "assessment_attempts_user_id_idx" ON "assessment_attempts"("user_id");
CREATE INDEX "assessment_attempts_completed_at_idx" ON "assessment_attempts"("completed_at");

CREATE INDEX "assessment_attempt_answers_organization_id_idx" ON "assessment_attempt_answers"("organization_id");
CREATE INDEX "assessment_attempt_answers_attempt_id_idx" ON "assessment_attempt_answers"("attempt_id");
CREATE INDEX "assessment_attempt_answers_question_id_idx" ON "assessment_attempt_answers"("question_id");
CREATE INDEX "assessment_attempt_answers_selected_option_id_idx" ON "assessment_attempt_answers"("selected_option_id");

ALTER TABLE "assessment_attempts"
ADD CONSTRAINT "assessment_attempts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempts"
ADD CONSTRAINT "assessment_attempts_assessment_id_fkey"
FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempts"
ADD CONSTRAINT "assessment_attempts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_attempt_answers"
ADD CONSTRAINT "assessment_attempt_answers_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempt_answers"
ADD CONSTRAINT "assessment_attempt_answers_attempt_id_fkey"
FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_attempt_answers"
ADD CONSTRAINT "assessment_attempt_answers_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_attempt_answers"
ADD CONSTRAINT "assessment_attempt_answers_selected_option_id_fkey"
FOREIGN KEY ("selected_option_id") REFERENCES "assessment_answer_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

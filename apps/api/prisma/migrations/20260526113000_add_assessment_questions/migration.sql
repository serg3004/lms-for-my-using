CREATE TYPE "AssessmentQuestionType" AS ENUM ('single_choice', 'multiple_choice', 'true_false');

CREATE TABLE "assessment_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "type" "AssessmentQuestionType" NOT NULL DEFAULT 'single_choice',
    "title" TEXT NOT NULL,
    "text" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_questions_points_check" CHECK ("points" >= 1),
    CONSTRAINT "assessment_questions_order_check" CHECK ("order" >= 0)
);

CREATE TABLE "assessment_answer_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assessment_answer_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_answer_options_order_check" CHECK ("order" >= 0)
);

CREATE INDEX "assessment_questions_organization_id_type_idx" ON "assessment_questions"("organization_id", "type");
CREATE INDEX "assessment_questions_assessment_id_order_idx" ON "assessment_questions"("assessment_id", "order");
CREATE INDEX "assessment_answer_options_organization_id_idx" ON "assessment_answer_options"("organization_id");
CREATE INDEX "assessment_answer_options_question_id_order_idx" ON "assessment_answer_options"("question_id", "order");

ALTER TABLE "assessment_questions"
ADD CONSTRAINT "assessment_questions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_questions"
ADD CONSTRAINT "assessment_questions_assessment_id_fkey"
FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_answer_options"
ADD CONSTRAINT "assessment_answer_options_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessment_answer_options"
ADD CONSTRAINT "assessment_answer_options_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "assessment_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

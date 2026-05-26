CREATE TYPE "AssessmentStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'draft',
    "passing_score" INTEGER NOT NULL DEFAULT 70,
    "max_attempts" INTEGER,
    "available_after_course_completion" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessments_passing_score_check" CHECK ("passing_score" >= 0 AND "passing_score" <= 100),
    CONSTRAINT "assessments_max_attempts_check" CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1)
);

CREATE UNIQUE INDEX "assessments_course_id_slug_key" ON "assessments"("course_id", "slug");
CREATE INDEX "assessments_organization_id_status_idx" ON "assessments"("organization_id", "status");
CREATE INDEX "assessments_course_id_status_idx" ON "assessments"("course_id", "status");
CREATE INDEX "assessments_lesson_id_idx" ON "assessments"("lesson_id");

ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assessments"
ADD CONSTRAINT "assessments_lesson_id_fkey"
FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "ProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed');

CREATE TABLE "progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "user_id" UUID NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'in_progress',
    "score" INTEGER,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "progress_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);

CREATE INDEX "progress_organization_id_status_idx" ON "progress"("organization_id", "status");
CREATE INDEX "progress_course_id_status_idx" ON "progress"("course_id", "status");
CREATE INDEX "progress_lesson_id_idx" ON "progress"("lesson_id");
CREATE INDEX "progress_user_id_idx" ON "progress"("user_id");
CREATE INDEX "progress_completed_at_idx" ON "progress"("completed_at");

ALTER TABLE "progress"
ADD CONSTRAINT "progress_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "progress"
ADD CONSTRAINT "progress_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "progress"
ADD CONSTRAINT "progress_lesson_id_fkey"
FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "progress"
ADD CONSTRAINT "progress_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

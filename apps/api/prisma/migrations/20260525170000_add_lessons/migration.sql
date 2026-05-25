CREATE TYPE "LessonStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "LessonStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lessons_course_id_slug_key" ON "lessons"("course_id", "slug");
CREATE INDEX "lessons_organization_id_course_id_status_idx" ON "lessons"("organization_id", "course_id", "status");

ALTER TABLE "lessons"
ADD CONSTRAINT "lessons_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

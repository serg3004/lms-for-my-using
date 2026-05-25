CREATE TYPE "CourseMaterialStatus" AS ENUM ('active', 'archived');
CREATE TYPE "CourseMaterialKind" AS ENUM ('file', 'link');

CREATE TABLE "course_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lesson_id" UUID,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CourseMaterialKind" NOT NULL DEFAULT 'file',
    "file_name" TEXT,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "status" "CourseMaterialStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_materials_course_id_slug_key" ON "course_materials"("course_id", "slug");
CREATE INDEX "course_materials_organization_id_course_id_status_idx" ON "course_materials"("organization_id", "course_id", "status");
CREATE INDEX "course_materials_lesson_id_idx" ON "course_materials"("lesson_id");

ALTER TABLE "course_materials"
ADD CONSTRAINT "course_materials_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "course_materials"
ADD CONSTRAINT "course_materials_lesson_id_fkey"
FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

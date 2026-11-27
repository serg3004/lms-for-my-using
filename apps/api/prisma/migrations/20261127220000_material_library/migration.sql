-- PR 582: a material can exist without a course, lie in a library folder and be connected to courses and lessons.
ALTER TABLE "course_materials" ALTER COLUMN "course_id" DROP NOT NULL;
ALTER TABLE "course_materials" ADD COLUMN "folder_id" UUID;

ALTER TABLE "course_materials"
  ADD CONSTRAINT "course_materials_organization_id_folder_id_fkey"
  FOREIGN KEY ("organization_id", "folder_id") REFERENCES "library_folders"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "course_materials_organization_id_folder_id_idx" ON "course_materials"("organization_id", "folder_id");

ALTER TABLE "library_folders" DROP CONSTRAINT IF EXISTS "library_folders_scope_check";
ALTER TABLE "library_folders" ADD CONSTRAINT "library_folders_scope_check" CHECK ("scope" IN ('course', 'assignment', 'material'));

CREATE TABLE "course_material_links" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "material_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "lesson_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_material_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_material_links_material_id_course_id_key" ON "course_material_links"("material_id", "course_id");
CREATE INDEX "course_material_links_organization_id_course_id_idx" ON "course_material_links"("organization_id", "course_id");
CREATE INDEX "course_material_links_lesson_id_idx" ON "course_material_links"("lesson_id");
ALTER TABLE "course_material_links" ADD CONSTRAINT "course_material_links_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "course_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_material_links" ADD CONSTRAINT "course_material_links_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_material_links" ADD CONSTRAINT "course_material_links_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

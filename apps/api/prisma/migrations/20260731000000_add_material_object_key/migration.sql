ALTER TABLE "course_materials"
  ADD COLUMN "object_key" TEXT,
  ALTER COLUMN "file_url" DROP NOT NULL;

CREATE UNIQUE INDEX "course_materials_object_key_key"
  ON "course_materials"("object_key")
  WHERE "object_key" IS NOT NULL;

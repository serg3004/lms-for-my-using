CREATE TYPE "MultipartUploadStatus" AS ENUM ('pending', 'completed', 'aborted');

CREATE TABLE "multipart_uploads" (
  "id" UUID NOT NULL,
  "upload_id" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "material_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "part_size_bytes" INTEGER NOT NULL,
  "status" "MultipartUploadStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "multipart_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "multipart_uploads_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "course_materials"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "multipart_uploads_upload_id_key" ON "multipart_uploads"("upload_id");
CREATE UNIQUE INDEX "multipart_uploads_object_key_key" ON "multipart_uploads"("object_key");
CREATE INDEX "multipart_uploads_organization_id_status_expires_at_idx" ON "multipart_uploads"("organization_id", "status", "expires_at");
CREATE INDEX "multipart_uploads_material_id_status_idx" ON "multipart_uploads"("material_id", "status");

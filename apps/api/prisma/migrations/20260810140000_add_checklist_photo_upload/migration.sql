-- AlterTable
ALTER TABLE "checklist_item_results"
  ADD COLUMN "photo_object_key" TEXT,
  ADD COLUMN "photo_file_name" TEXT,
  ADD COLUMN "photo_mime_type" TEXT,
  ADD COLUMN "photo_size_bytes" INTEGER;

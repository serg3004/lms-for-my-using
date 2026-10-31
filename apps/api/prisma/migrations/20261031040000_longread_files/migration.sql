ALTER TABLE "course_materials" ADD COLUMN "longread_document_id" UUID;
ALTER TABLE "longread_chapters" ADD COLUMN "cover" JSONB;
CREATE INDEX "course_materials_longread_document_id_idx" ON "course_materials"("longread_document_id");
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_longread_document_id_fkey" FOREIGN KEY ("longread_document_id") REFERENCES "longread_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

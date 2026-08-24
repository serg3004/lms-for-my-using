CREATE INDEX "multipart_uploads_status_expires_at_id_idx"
ON "multipart_uploads"("status", "expires_at", "id");

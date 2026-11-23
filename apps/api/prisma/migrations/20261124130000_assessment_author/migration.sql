ALTER TABLE "assessments" ADD COLUMN "created_by" UUID;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "assessments_organization_id_created_by_idx" ON "assessments"("organization_id", "created_by");

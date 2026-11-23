-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "standalone_token_hash" TEXT;

-- CreateTable
CREATE TABLE "assessment_assignments" (
    "assessment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ NOT NULL,
    "reminded_at" TIMESTAMPTZ,

    CONSTRAINT "assessment_assignments_pkey" PRIMARY KEY ("assessment_id","user_id")
);

-- CreateIndex
CREATE INDEX "assessment_assignments_organization_id_user_id_due_at_idx" ON "assessment_assignments"("organization_id", "user_id", "due_at");

-- CreateIndex
CREATE INDEX "assessment_assignments_reminded_at_due_at_idx" ON "assessment_assignments"("reminded_at", "due_at");

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_assignments" ADD CONSTRAINT "assessment_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "CertificateStatus" AS ENUM ('issued', 'revoked');

CREATE TABLE "certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assessment_attempt_id" UUID,
    "status" "CertificateStatus" NOT NULL DEFAULT 'issued',
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificates_organization_course_user_unique" UNIQUE ("organization_id", "course_id", "user_id")
);

CREATE INDEX "certificates_organization_id_status_idx" ON "certificates"("organization_id", "status");
CREATE INDEX "certificates_course_id_idx" ON "certificates"("course_id");
CREATE INDEX "certificates_user_id_idx" ON "certificates"("user_id");
CREATE INDEX "certificates_assessment_attempt_id_idx" ON "certificates"("assessment_attempt_id");
CREATE INDEX "certificates_issued_at_idx" ON "certificates"("issued_at");

ALTER TABLE "certificates"
ADD CONSTRAINT "certificates_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certificates"
ADD CONSTRAINT "certificates_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "certificates"
ADD CONSTRAINT "certificates_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "certificates"
ADD CONSTRAINT "certificates_assessment_attempt_id_fkey"
FOREIGN KEY ("assessment_attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

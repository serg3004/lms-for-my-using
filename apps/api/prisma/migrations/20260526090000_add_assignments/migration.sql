CREATE TYPE "AssignmentStatus" AS ENUM ('assigned', 'completed', 'cancelled');

CREATE TABLE "assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID,
    "group_id" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'assigned',
    "due_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assignments_single_target_check" CHECK (
        ("user_id" IS NOT NULL AND "group_id" IS NULL)
        OR ("user_id" IS NULL AND "group_id" IS NOT NULL)
    )
);

CREATE INDEX "assignments_organization_id_status_idx" ON "assignments"("organization_id", "status");
CREATE INDEX "assignments_course_id_status_idx" ON "assignments"("course_id", "status");
CREATE INDEX "assignments_user_id_idx" ON "assignments"("user_id");
CREATE INDEX "assignments_group_id_idx" ON "assignments"("group_id");
CREATE INDEX "assignments_due_at_idx" ON "assignments"("due_at");

ALTER TABLE "assignments"
ADD CONSTRAINT "assignments_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assignments"
ADD CONSTRAINT "assignments_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assignments"
ADD CONSTRAINT "assignments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assignments"
ADD CONSTRAINT "assignments_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

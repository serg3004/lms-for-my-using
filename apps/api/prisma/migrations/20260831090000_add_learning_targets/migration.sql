-- PR 277: Department/Position learning targeting.

ALTER TABLE "assignments" ADD COLUMN "department_id" UUID;
ALTER TABLE "assignments" ADD COLUMN "include_descendants" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "assignments_organization_id_department_id_idx" ON "assignments"("organization_id", "department_id");

ALTER TABLE "assignments" ADD CONSTRAINT "assignments_department_id_organization_id_fkey" FOREIGN KEY ("department_id", "organization_id") REFERENCES "departments"("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Superseded by assignments_exactly_one_target_check below, which also covers department_id --
-- the original (pre-department) constraint required exactly one of user_id/group_id and would
-- reject every department-only row (both NULL) outright.
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_single_target_check";

-- Plan invariant: an Assignment targets exactly one of user/group/department. Every existing
-- row already satisfies this (the dropped constraint above already enforced the user/group XOR,
-- and department_id starts NULL for all of them), so this CHECK is safe to add directly.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_exactly_one_target_check" CHECK (num_nonnulls("user_id", "group_id", "department_id") = 1);

-- Plan invariant: includeDescendants is meaningless (and forbidden) without a department target.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_include_descendants_requires_department_check" CHECK ("department_id" IS NOT NULL OR "include_descendants" = false);

CREATE TYPE "PositionCourseRequirement" AS ENUM ('REQUIRED', 'OPTIONAL');

CREATE TABLE "position_courses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "requirement" "PositionCourseRequirement" NOT NULL DEFAULT 'REQUIRED',
    "due_days" INTEGER,
    "status" "PositionStatus" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "position_courses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "position_courses_organization_id_position_id_course_id_key" ON "position_courses"("organization_id", "position_id", "course_id");
CREATE INDEX "position_courses_organization_id_status_idx" ON "position_courses"("organization_id", "status");
CREATE INDEX "position_courses_course_id_idx" ON "position_courses"("course_id");

ALTER TABLE "position_courses" ADD CONSTRAINT "position_courses_due_days_range_check" CHECK ("due_days" IS NULL OR ("due_days" >= 0 AND "due_days" <= 3650));

ALTER TABLE "position_courses" ADD CONSTRAINT "position_courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_courses" ADD CONSTRAINT "position_courses_position_id_organization_id_fkey" FOREIGN KEY ("position_id", "organization_id") REFERENCES "positions"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_courses" ADD CONSTRAINT "position_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_members" ADD COLUMN "deleted_at" TIMESTAMPTZ;
ALTER TABLE "manager_groups" ADD COLUMN "deleted_at" TIMESTAMPTZ;
ALTER TABLE "course_instructors" ADD COLUMN "deleted_at" TIMESTAMPTZ;

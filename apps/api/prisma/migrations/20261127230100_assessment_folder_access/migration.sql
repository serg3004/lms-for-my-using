-- PR 576: access to test folders, as in checklist folders. Folders that exist today were open to everyone who authors tests,
-- so they become "all employees"; folders created from now on start closed (creator and administrators).
ALTER TABLE "assessment_folders" ADD COLUMN "visible_to_staff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "assessment_folders" ADD COLUMN "access_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "assessment_folders" SET "visible_to_staff" = true;

-- PR 576: a checklist folder can be opened to chosen roles. Empty means no roles; existing folders keep their visibility
-- (visible_to_staff = all employees, otherwise only the creator, administrators and the named employees).
ALTER TABLE "checklist_folders" ADD COLUMN "access_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

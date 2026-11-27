-- PR 515: the colour of a checklist folder (the same set as assessment folders) and the employees a folder
-- is opened to by name. Both columns are additive with defaults, so the previous release keeps working.
ALTER TABLE "checklist_folders"
    ADD COLUMN "color" TEXT NOT NULL DEFAULT 'purple',
    ADD COLUMN "shared_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    ADD CONSTRAINT "checklist_folders_color_check" CHECK ("color" IN ('purple', 'green', 'blue', 'orange', 'pink', 'gray'));

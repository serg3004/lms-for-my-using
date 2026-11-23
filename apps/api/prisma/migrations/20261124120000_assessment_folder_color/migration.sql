ALTER TABLE "assessment_folders"
    ADD COLUMN "color" TEXT NOT NULL DEFAULT 'purple',
    ADD CONSTRAINT "assessment_folders_color_check" CHECK ("color" IN ('purple', 'green', 'blue', 'orange', 'pink', 'gray'));

-- PR 330: additive defaulted columns; existing checklists keep the strict behaviour.
ALTER TABLE "checklists"
  ADD COLUMN "allow_finish_incomplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "forbid_gallery_photos" BOOLEAN NOT NULL DEFAULT false;

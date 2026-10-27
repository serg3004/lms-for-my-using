-- PR 354: pin a free checklist as a tile on the learner pages. Additive: every existing checklist stays unpinned.
ALTER TABLE "checklists"
  ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

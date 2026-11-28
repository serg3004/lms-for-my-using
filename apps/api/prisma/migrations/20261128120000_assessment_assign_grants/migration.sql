-- PR 584: the author of a standalone test can let chosen roles and employees assign it. Existing tests grant nothing extra.
ALTER TABLE "assessments"
  ADD COLUMN "assign_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "assign_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

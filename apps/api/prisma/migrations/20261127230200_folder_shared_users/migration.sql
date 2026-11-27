-- PR 576: library folders (courses, assignments, materials) get the same access settings as checklist folders.
-- Existing folders stay visible to every staff role, as before; new ones default to "only the creator" in the API.
ALTER TABLE "library_folders"
  ADD COLUMN "visible_to_staff" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "access_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "shared_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- Assessment folders: employees opened by name.
ALTER TABLE "assessment_folders"
  ADD COLUMN "shared_user_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
